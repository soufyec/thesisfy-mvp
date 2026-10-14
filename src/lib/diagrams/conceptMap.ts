/**
 * Concept map layout and drawing (docs/papers.md D26): a deterministic layered (Sugiyama-style) layout.
 *  1. Cycles are broken by a depth-first search that starts from the roots (in-degree 0) in input order, then the
 *     remaining nodes in input order; edges closing a cycle are reversed for layout only (their arrow still points at
 *     the original target).
 *  2. Layers by longest path from the roots; edges spanning several layers get virtual nodes.
 *  3. Order inside layers: barycenter, 4 down/up sweeps (best crossing count kept) and an adjacent-swap pass.
 *  4. x by weighted isotonic regression (pool-adjacent-violators) towards the mean of each node's neighbours,
 *     keeping order and spacing; narrower label wrapping is tried when the map is wider than the target width.
 *  5. Edges leave the bottom of the source and enter the top of the target with vertical tangents (smooth S-curves,
 *     straight through virtual nodes), ports spread along the side; arrowheads drawn as paths (no <marker> ids).
 *  6. Edge labels sit at the midpoint on a white halo and are nudged along the edge or beside it when they would
 *     overlap a node or another label; gaps between layers grow until they fit.
 */
import {
  ARROW_LEN,
  DIAGRAM_COLORS,
  DIAGRAM_SERIES,
  LINE_HEIGHT,
  arrowHead,
  maxLineWidth,
  num,
  overlapArea,
  textLines,
  wrapText,
  type FontWeight,
} from "./theme";
import type { Box, ConceptMapSpec, DiagramDrawing } from "./types";

const PAD = 12;
const NODE_PAD_X = 12;
const NODE_PAD_Y = 8;
const NODE_MIN_W = 64;
const LAYER_GAP = 40;
const LAYER_GAP_LABELS = 54;
const EDGE_LABEL_W = 104;
const EDGE_LABEL_LH = 15;
/** Label wrap widths and node gaps tried in order until the map fits the target width. */
const FITS: { wrap: number; gap: number }[] = [
  { wrap: 132, gap: 28 },
  { wrap: 116, gap: 22 },
  { wrap: 100, gap: 18 },
  { wrap: 88, gap: 14 },
];

export interface ConceptMapLayoutOptions {
  width: number;
}

export interface ConceptLayoutNode extends Box {
  id: string;
  lines: string[];
  layer: number;
  root: boolean;
  weight: FontWeight;
}

export interface ConceptLayoutEdge {
  from: string;
  to: string;
  label?: string;
  labelLines?: string[];
  /** True when the edge closes a cycle: drawn upwards, arrow at the original target. */
  reversed: boolean;
  /** SVG path data (ends at the base of the arrowhead). */
  d: string;
  head: { x: number; y: number; dx: number; dy: number };
  labelBox?: Box;
}

export interface ConceptMapLayout {
  width: number;
  height: number;
  nodes: ConceptLayoutNode[];
  edges: ConceptLayoutEdge[];
  layers: number;
}

interface Vertex {
  real: number; // index in spec.nodes, or -1 for a virtual node
  layer: number;
  w: number;
  h: number;
  x: number;
  lines: string[];
  weight: FontWeight;
}

/** Stable sort by key, ties by previous index. */
function stableSortBy<T>(arr: T[], key: (t: T, i: number) => number): T[] {
  return arr
    .map((t, i) => ({ t, i, k: key(t, i) }))
    .sort((a, b) => (a.k !== b.k ? a.k - b.k : a.i - b.i))
    .map((x) => x.t);
}

/**
 * Weighted isotonic placement: minimises Σ wᵢ (xᵢ − dᵢ)² subject to x_{i+1} − x_i ≥ sep_i (pool adjacent violators).
 */
function placeLayer(desired: number[], weights: number[], seps: number[]): number[] {
  const n = desired.length;
  const c: number[] = [0];
  for (let i = 1; i < n; i++) c.push(c[i - 1] + seps[i - 1]);
  const blocks: { w: number; wz: number; n: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ w: weights[i], wz: weights[i] * (desired[i] - c[i]), n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.wz / a.w <= b.wz / b.w) break;
      blocks.splice(blocks.length - 2, 2, { w: a.w + b.w, wz: a.wz + b.wz, n: a.n + b.n });
    }
  }
  const out: number[] = [];
  let i = 0;
  for (const b of blocks) {
    const y = b.wz / b.w;
    for (let k = 0; k < b.n; k++, i++) out.push(y + c[i]);
  }
  return out;
}

/** Point at `t` on an S-curve from `p` to `q` (cubic with vertical tangents at both ends). */
function onCurve(s: { p: [number, number]; q: [number, number] }, t: number): [number, number] {
  const u = 1 - t;
  const my = (s.p[1] + s.q[1]) / 2;
  const x = u * u * u * s.p[0] + 3 * u * u * t * s.p[0] + 3 * u * t * t * s.q[0] + t * t * t * s.q[0];
  const y = u * u * u * s.p[1] + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * s.q[1];
  return [x, y];
}

/** Computes the geometry of a sanitised concept map spec. */
export function layoutConceptMap(spec: ConceptMapSpec, opts: ConceptMapLayoutOptions): ConceptMapLayout {
  const N = spec.nodes.length;
  const index: Record<string, number> = {};
  spec.nodes.forEach((n, i) => (index["#" + n.id] = i));
  const E = spec.edges.map((e) => ({ u: index["#" + e.from], v: index["#" + e.to], label: e.label }));

  // 1. Cycle breaking by DFS from the roots.
  const outEdges: number[][] = spec.nodes.map(() => []);
  const indeg: number[] = spec.nodes.map(() => 0);
  E.forEach((e, i) => {
    outEdges[e.u].push(i);
    indeg[e.v]++;
  });
  const state: number[] = spec.nodes.map(() => 0);
  const reversed: boolean[] = E.map(() => false);
  const dfs = (u: number) => {
    state[u] = 1;
    for (const ei of outEdges[u]) {
      const v = E[ei].v;
      if (state[v] === 1) reversed[ei] = true;
      else if (state[v] === 0) dfs(v);
    }
    state[u] = 2;
  };
  const starts = spec.nodes.map((_, i) => i).filter((i) => indeg[i] === 0).concat(spec.nodes.map((_, i) => i).filter((i) => indeg[i] > 0));
  for (const s of starts) if (state[s] === 0) dfs(s);
  const dag = E.map((e, i) => (reversed[i] ? { a: e.v, b: e.u } : { a: e.u, b: e.v }));

  // 2. Longest-path layering (Kahn order, input order on ties).
  const dagIn: number[] = spec.nodes.map(() => 0);
  const dagOut: number[][] = spec.nodes.map(() => []);
  dag.forEach((e, i) => {
    dagIn[e.b]++;
    dagOut[e.a].push(i);
  });
  const layer: number[] = spec.nodes.map(() => 0);
  const remaining = dagIn.slice();
  const queue: number[] = [];
  for (let i = 0; i < N; i++) if (remaining[i] === 0) queue.push(i);
  while (queue.length) {
    const u = queue.shift() as number;
    for (const ei of dagOut[u]) {
      const v = dag[ei].b;
      layer[v] = Math.max(layer[v], layer[u] + 1);
      if (--remaining[v] === 0) queue.push(v);
    }
  }
  const L = Math.max(...layer) + 1;

  // Virtual nodes for long edges: chain of vertex ids per edge (in DAG direction).
  const verts: Vertex[] = spec.nodes.map((_, i) => ({ real: i, layer: layer[i], w: 0, h: 0, x: 0, lines: [], weight: 400 as FontWeight }));
  const chains: number[][] = dag.map((e) => {
    const chain = [e.a];
    for (let l = layer[e.a] + 1; l < layer[e.b]; l++) {
      verts.push({ real: -1, layer: l, w: 2, h: 0, x: 0, lines: [], weight: 400 });
      chain.push(verts.length - 1);
    }
    chain.push(e.b);
    return chain;
  });
  const segs: { a: number; b: number }[] = [];
  for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) segs.push({ a: ch[i], b: ch[i + 1] });
  const preds: number[][] = verts.map(() => []);
  const succs: number[][] = verts.map(() => []);
  for (const s of segs) {
    succs[s.a].push(s.b);
    preds[s.b].push(s.a);
  }

  // 3. Ordering.
  let order: number[][] = [];
  for (let l = 0; l < L; l++) order.push([]);
  verts.forEach((v, i) => order[v.layer].push(i));
  const pos: number[] = verts.map(() => 0);
  const syncPos = (ord: number[][]) => ord.forEach((layerVerts) => layerVerts.forEach((v, i) => (pos[v] = i)));
  syncPos(order);
  const crossingsBetween = (l: number, ord: number[][]): number => {
    const p: Record<number, number> = {};
    ord[l].forEach((v, i) => (p[v] = i));
    ord[l + 1].forEach((v, i) => (p[v] = i));
    const pairs: [number, number][] = [];
    for (const v of ord[l]) for (const w of succs[v]) pairs.push([p[v], p[w]]);
    let c = 0;
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++) {
        const [a1, b1] = pairs[i];
        const [a2, b2] = pairs[j];
        if ((a1 - a2) * (b1 - b2) < 0) c++;
      }
    return c;
  };
  const totalCrossings = (ord: number[][]) => {
    let c = 0;
    for (let l = 0; l + 1 < L; l++) c += crossingsBetween(l, ord);
    return c;
  };
  const sweep = (down: boolean) => {
    const range = down ? order.map((_, l) => l).slice(1) : order.map((_, l) => l).slice(0, L - 1).reverse();
    for (const l of range) {
      const neighbours = down ? preds : succs;
      order[l] = stableSortBy(order[l], (v) => {
        const ns = neighbours[v];
        if (!ns.length) return pos[v];
        return ns.reduce((s, n) => s + pos[n], 0) / ns.length;
      });
      order[l].forEach((v, i) => (pos[v] = i));
    }
  };
  let best = order.map((l) => l.slice());
  let bestC = totalCrossings(order);
  for (let it = 0; it < 4 && bestC > 0; it++) {
    sweep(true);
    let c = totalCrossings(order);
    if (c < bestC) {
      bestC = c;
      best = order.map((l) => l.slice());
    }
    sweep(false);
    c = totalCrossings(order);
    if (c < bestC) {
      bestC = c;
      best = order.map((l) => l.slice());
    }
  }
  order = best;
  // Adjacent swaps that strictly reduce crossings with both neighbouring layers.
  for (let round = 0; round < 8 && bestC > 0; round++) {
    let improved = false;
    for (let l = 0; l < L; l++) {
      for (let i = 0; i + 1 < order[l].length; i++) {
        const local = () => (l > 0 ? crossingsBetween(l - 1, order) : 0) + (l + 1 < L ? crossingsBetween(l, order) : 0);
        const before = local();
        const tmp = order[l][i];
        order[l][i] = order[l][i + 1];
        order[l][i + 1] = tmp;
        if (local() < before) improved = true;
        else {
          order[l][i + 1] = order[l][i];
          order[l][i] = tmp;
        }
      }
    }
    if (!improved) break;
  }
  syncPos(order);

  // Roots (emphasised): top-layer nodes with outgoing edges.
  const isRoot = (i: number) => layer[i] === 0 && dagOut[i].length > 0;

  // 4. Sizes and x, trying narrower wraps when too wide.
  const target = Math.max(240, opts.width);
  let chosen: { width: number; gap: number } | null = null;
  for (let f = 0; f < FITS.length; f++) {
    const fit = FITS[f];
    for (const v of verts) {
      if (v.real < 0) continue;
      v.weight = isRoot(v.real) ? 600 : 400;
      v.lines = wrapText(spec.nodes[v.real].label, fit.wrap, v.weight);
      v.w = Math.max(NODE_MIN_W, Math.ceil(maxLineWidth(v.lines, v.weight)) + NODE_PAD_X * 2);
      v.h = v.lines.length * LINE_HEIGHT + NODE_PAD_Y * 2;
    }
    const sep = (a: Vertex, b: Vertex) => (a.w + b.w) / 2 + (a.real >= 0 && b.real >= 0 ? fit.gap : a.real < 0 && b.real < 0 ? 8 : 12);
    // Initial packing, centred on 0.
    for (const layerVerts of order) {
      let x = 0;
      layerVerts.forEach((v, i) => {
        if (i > 0) x += sep(verts[layerVerts[i - 1]], verts[v]);
        verts[v].x = x;
      });
      const shift = x / 2;
      for (const v of layerVerts) verts[v].x -= shift;
    }
    const relax = (l: number, mode: "down" | "up" | "both") => {
      const lv = order[l];
      if (!lv.length) return;
      const desired = lv.map((v) => {
        const ns = mode === "down" ? preds[v] : mode === "up" ? succs[v] : preds[v].concat(succs[v]);
        return ns.length ? ns.reduce((s, n) => s + verts[n].x, 0) / ns.length : verts[v].x;
      });
      const weights = lv.map((v) => {
        const ns = mode === "down" ? preds[v] : mode === "up" ? succs[v] : preds[v].concat(succs[v]);
        return (verts[v].real < 0 ? 4 : 1) * (ns.length ? 1 : 0.25);
      });
      const seps = lv.slice(1).map((v, i) => sep(verts[lv[i]], verts[v]));
      const xs = placeLayer(desired, weights, seps);
      lv.forEach((v, i) => (verts[v].x = xs[i]));
    };
    for (let it = 0; it < 6; it++) {
      for (let l = 1; l < L; l++) relax(l, "down");
      for (let l = L - 2; l >= 0; l--) relax(l, "up");
    }
    for (let it = 0; it < 4; it++) for (let l = 0; l < L; l++) relax(l, "both");
    let minX = Infinity;
    let maxX = -Infinity;
    for (const v of verts) {
      minX = Math.min(minX, v.x - v.w / 2);
      maxX = Math.max(maxX, v.x + v.w / 2);
    }
    const natural = maxX - minX + PAD * 2;
    if (natural <= target || f === FITS.length - 1) {
      const width = Math.max(target, Math.ceil(natural));
      const offset = (width - (maxX - minX)) / 2 - minX;
      for (const v of verts) v.x += offset;
      chosen = { width, gap: fit.gap };
      break;
    }
  }
  const width = (chosen as { width: number }).width;

  // 5–6. Vertical placement, routing and labels; gaps grow until labels stop colliding.
  const labelled: boolean[] = [];
  for (let l = 0; l + 1 < L; l++) labelled.push(false);
  dag.forEach((e, i) => {
    if (!E[i].label) return;
    for (let l = layer[e.a]; l < layer[e.b]; l++) labelled[l] = true;
  });
  const gaps = labelled.map((has) => (has ? LAYER_GAP_LABELS : LAYER_GAP));
  const realBox = (i: number, layerTop: number[], layerH: number[]): Box => {
    const v = verts[i];
    return { x: v.x - v.w / 2, y: layerTop[v.layer] + (layerH[v.layer] - v.h) / 2, w: v.w, h: v.h };
  };

  let result: ConceptMapLayout | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const layerH: number[] = [];
    for (let l = 0; l < L; l++) layerH.push(Math.max(16, ...order[l].map((v) => verts[v].h)));
    const layerTop: number[] = [PAD];
    for (let l = 1; l < L; l++) layerTop.push(layerTop[l - 1] + layerH[l - 1] + gaps[l - 1]);
    const height = layerTop[L - 1] + layerH[L - 1] + PAD;
    const nodeBoxes: Box[] = spec.nodes.map((_, i) => realBox(i, layerTop, layerH));

    // Ports: spread the edge ends along the top and bottom sides, ordered by the x of the other end.
    const bottomPort: Record<number, number> = {};
    const topPort: Record<number, number> = {};
    for (let i = 0; i < N; i++) {
      const box = nodeBoxes[i];
      const sides: [Record<number, number>, number[]][] = [
        [bottomPort, chains.map((ch, ei) => (ch[0] === i ? ei : -1)).filter((ei) => ei >= 0)],
        [topPort, chains.map((ch, ei) => (ch[ch.length - 1] === i ? ei : -1)).filter((ei) => ei >= 0)],
      ];
      for (const [ports, eis] of sides) {
        const isBottom = ports === bottomPort;
        const sorted = stableSortBy(eis, (ei) => {
          const ch = chains[ei];
          return verts[isBottom ? ch[1] : ch[ch.length - 2]].x;
        });
        const k = sorted.length;
        const spacing = k > 1 ? Math.min(16, (box.w * 0.6) / (k - 1)) : 0;
        sorted.forEach((ei, j) => (ports[ei] = box.x + box.w / 2 + (j - (k - 1) / 2) * spacing));
      }
    }

    // Routes in DAG direction: bottom port → through virtual nodes → top port.
    const routes: [number, number][][] = chains.map((ch, ei) => {
      const pts: [number, number][] = [];
      const a = nodeBoxes[ch[0]];
      pts.push([bottomPort[ei], a.y + a.h]);
      for (let k = 1; k + 1 < ch.length; k++) {
        const v = verts[ch[k]];
        pts.push([v.x, layerTop[v.layer]]);
        pts.push([v.x, layerTop[v.layer] + layerH[v.layer]]);
      }
      const b = nodeBoxes[ch[ch.length - 1]];
      pts.push([topPort[ei], b.y]);
      return pts;
    });

    // Labels.
    const placed: Box[] = [];
    const conflictGaps: number[] = [];
    const edges: ConceptLayoutEdge[] = [];
    // Pass 1: paths, their S-curve segments and sample points (to keep labels off other edges).
    type Seg = { p: [number, number]; q: [number, number]; layer: number };
    const drawn = E.map((e, ei) => {
      let pts = routes[ei].slice();
      if (reversed[ei]) pts = pts.reverse();
      const n = pts.length;
      const [tx, ty] = pts[n - 1];
      const dy = ty > pts[n - 2][1] ? 1 : -1;
      const base: [number, number] = [tx, ty - dy * (ARROW_LEN - 1)];
      const drawPts = pts.slice(0, n - 1).concat([base]);
      let d = `M${num(drawPts[0][0])} ${num(drawPts[0][1])}`;
      // Segments between layers are S-curves; segments inside a layer band (virtual nodes) are straight.
      const curveSegs: Seg[] = [];
      const samples: [number, number][] = [];
      for (let k = 0; k + 1 < drawPts.length; k++) {
        const p = drawPts[k];
        const q = drawPts[k + 1];
        if (k % 2 === 0) {
          const my = (p[1] + q[1]) / 2;
          d += `C${num(p[0])} ${num(my)} ${num(q[0])} ${num(my)} ${num(q[0])} ${num(q[1])}`;
          // The gap this curve crosses: the last layer whose band starts above the curve's midpoint.
          let gl = 0;
          for (let l = 0; l + 1 < L; l++) if (layerTop[l] <= my) gl = l;
          const seg: Seg = { p, q, layer: gl };
          curveSegs.push(seg);
          for (let i = 0; i <= 16; i++) samples.push(onCurve(seg, i / 16));
        } else {
          d += `L${num(q[0])} ${num(q[1])}`;
          const len = Math.abs(q[1] - p[1]);
          for (let y = 0; y <= len; y += 6) samples.push([p[0], Math.min(p[1], q[1]) + y]);
        }
      }
      const edge: ConceptLayoutEdge = { from: spec.edges[ei].from, to: spec.edges[ei].to, reversed: reversed[ei], d, head: { x: tx, y: ty, dx: 0, dy } };
      return { edge, curveSegs, samples };
    });

    // Pass 2: labels at the middle of their own edge, nudged along it, beside it only as a last resort.
    E.forEach((e, ei) => {
      const { edge, curveSegs } = drawn[ei];
      if (!e.label) return;
      const lines = wrapText(e.label, EDGE_LABEL_W, 400);
      const w = Math.ceil(maxLineWidth(lines)) + 8;
      const h = lines.length * EDGE_LABEL_LH + 4;
      const mid = Math.floor((curveSegs.length - 1) / 2);
      const segOrder = stableSortBy(curveSegs.map((_, i) => i), (i) => Math.abs(i - mid));
      let bestBox: Box | null = null;
      let bestScore = Infinity;
      let bestOverlap = 0;
      let bestLayer = 0;
      for (const si of segOrder) {
        const s = curveSegs[si];
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78]) {
          const [px, py] = onCurve(s, t);
          for (const shift of [0, 1, -1]) {
            const cx = px + shift * (w / 2 + 5);
            const box: Box = { x: cx - w / 2, y: py - h / 2, w, h };
            let overlap = 0;
            for (const nb of nodeBoxes) overlap += overlapArea(box, { x: nb.x - 3, y: nb.y - 3, w: nb.w + 6, h: nb.h + 6 });
            for (const pb of placed) overlap += overlapArea(box, { x: pb.x - 2, y: pb.y - 2, w: pb.w + 4, h: pb.h + 4 });
            if (box.x < 2 || box.x + box.w > width - 2) overlap += 1000;
            // Other edges hidden under the halo make the label ambiguous.
            let covered = 0;
            for (let oj = 0; oj < drawn.length; oj++) {
              if (oj === ei) continue;
              for (const [sx, sy] of drawn[oj].samples) if (sx > box.x - 1 && sx < box.x + box.w + 1 && sy > box.y - 1 && sy < box.y + box.h + 1) covered++;
            }
            const score = overlap * 10 + covered * 30 + Math.abs(si - mid) * 15 + Math.abs(t - 0.5) * 50 + Math.abs(shift) * 70;
            if (score < bestScore) {
              bestScore = score;
              bestBox = box;
              bestOverlap = overlap;
              bestLayer = s.layer;
            }
          }
        }
      }
      if (bestBox) {
        if (bestOverlap > 0) conflictGaps.push(bestLayer);
        placed.push(bestBox);
        edge.label = e.label;
        edge.labelLines = lines;
        edge.labelBox = bestBox;
      }
    });
    for (const x of drawn) edges.push(x.edge);

    const nodes: ConceptLayoutNode[] = spec.nodes.map((n, i) => ({
      id: n.id,
      ...nodeBoxes[i],
      lines: verts[i].lines,
      layer: layer[i],
      root: isRoot(i),
      weight: verts[i].weight,
    }));
    result = { width, height, nodes, edges, layers: L };
    if (!conflictGaps.length) break;
    for (const g of conflictGaps) if (g < gaps.length) gaps[g] += 20;
  }
  return result as ConceptMapLayout;
}

/** SVG body of a concept map layout: edges, then nodes, then edge labels on their white halo. */
export function drawConceptMap(layout: ConceptMapLayout): DiagramDrawing {
  const parts: string[] = [];
  for (const e of layout.edges) {
    parts.push(`<path d="${e.d}" fill="none" stroke="${DIAGRAM_COLORS.arrow}" stroke-width="1.25" stroke-linecap="round"/>`);
    parts.push(arrowHead(e.head.x, e.head.y, e.head.dx, e.head.dy));
  }
  for (const n of layout.nodes) {
    const stroke = n.root ? DIAGRAM_SERIES[0] : DIAGRAM_COLORS.stroke;
    const sw = n.root ? 1.5 : 1;
    parts.push(
      `<rect x="${num(n.x + sw / 2)}" y="${num(n.y + sw / 2)}" width="${num(n.w - sw)}" height="${num(n.h - sw)}" rx="8" fill="${DIAGRAM_COLORS.surface}" stroke="${stroke}" stroke-width="${sw}"/>`,
    );
    parts.push(textLines(n.lines, n.x + n.w / 2, n.y + NODE_PAD_Y, { anchor: "middle", weight: n.weight }));
  }
  for (const e of layout.edges) {
    if (!e.labelBox || !e.labelLines) continue;
    const b = e.labelBox;
    parts.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="3" fill="${DIAGRAM_COLORS.surface}"/>`);
    parts.push(textLines(e.labelLines, b.x + b.w / 2, b.y + 2, { anchor: "middle", fill: DIAGRAM_COLORS.muted, lineHeight: EDGE_LABEL_LH }));
  }
  return { width: layout.width, height: layout.height, body: parts.join("") };
}
