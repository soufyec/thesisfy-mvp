/**
 * Hero background: a teacher's desk with stacks of theses, a blackboard beside it. Flat line illustration in the
 * neutral and provenance tokens (Tailwind fill/stroke utilities, no literal colours), drawn once as SVG.
 * On desktop it sits low in the left column under the copy; on phones it gets its own band under the bullets,
 * so it never meets the orbit scene on either.
 */

function Stack({ x, y, n, w = 92, title = "fill-gray-400" }: { x: number; y: number; n: number; w?: number; title?: string }) {
  const h = 6;
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={(i % 2) * 2 - 1} y={-i * h} width={w} height={h + 1} rx={1} className="fill-white stroke-gray-300" strokeWidth={1} />
      ))}
      {/* the top sheet reads as a title page */}
      <rect x={0} y={-n * h - 1} width={w} height={h + 2} rx={1} className="fill-white stroke-gray-300" strokeWidth={1} />
      <rect x={10} y={-n * h + 1} width={w * 0.45} height={2} rx={1} className={title} />
      <rect x={10} y={-n * h + 4.5} width={w * 0.7} height={1} className="fill-gray-300" />
    </g>
  );
}

export default function ClassroomScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 760 300" preserveAspectRatio="xMinYMax meet" className={className} aria-hidden="true" focusable="false">
      {/* Floor */}
      <line x1="0" y1="282" x2="760" y2="282" className="stroke-gray-200" strokeWidth="2" />
      <rect x="0" y="283" width="760" height="17" className="fill-gray-50" />

      {/* Blackboard on its wooden frame, chalk tray below */}
      <g transform="translate(40 30)">
        <rect x="0" y="0" width="300" height="190" rx="6" className="fill-amber-800" />
        <rect x="9" y="9" width="282" height="172" rx="3" className="fill-gray-800" />
        {/* chalk: an outline, a few lines, a crossed-out line and a tick */}
        <g className="stroke-gray-100" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85">
          <path d="M30 40h110" />
          <path d="M30 58h80M30 72h96M30 86h60" />
          <path d="M30 112h120" opacity="0.6" />
          <path d="M26 118l128-10" className="stroke-prov-paste" />
          <path d="M30 140h70M30 154h98" />
          <path d="M190 60l40 0M190 76l52 0M190 92l34 0" />
          <path d="M196 130l12 12 26-28" className="stroke-prov-human" strokeWidth="3" />
          <circle cx="226" cy="50" r="14" />
        </g>
        <rect x="-4" y="190" width="308" height="9" rx="2" className="fill-amber-700" />
        <rect x="40" y="186" width="22" height="4" rx="2" className="fill-white" />
        <rect x="70" y="186" width="14" height="4" rx="2" className="fill-prov-paste" />
        <rect x="236" y="184" width="40" height="7" rx="1" className="fill-gray-300" />
      </g>

      {/* Desk */}
      <g transform="translate(380 0)">
        <rect x="0" y="212" width="360" height="14" rx="3" className="fill-amber-700" />
        <rect x="14" y="226" width="12" height="56" className="fill-amber-800" />
        <rect x="334" y="226" width="12" height="56" className="fill-amber-800" />
        <rect x="26" y="226" width="308" height="30" className="fill-amber-700" opacity="0.5" />
        <rect x="150" y="234" width="50" height="4" rx="2" className="fill-amber-800" opacity="0.6" />
        {/* stacks of theses */}
        <Stack x={18} y={210} n={11} title="fill-prov-ai" />
        <Stack x={124} y={210} n={17} w={100} title="fill-prov-human" />
        <Stack x={238} y={210} n={7} w={88} title="fill-prov-paste" />
        {/* a bound thesis standing against the tall stack, a pen cup, a mug */}
        <rect x={110} y={126} width={16} height={84} rx={2} className="fill-brand-600" />
        <rect x={113} y={134} width={10} height={30} rx={1} className="fill-white" opacity="0.7" />
        <rect x={236} y={166} width={28} height={44} rx={3} className="fill-gray-200 stroke-gray-300" strokeWidth="1" />
        <line x1="244" y1="140" x2="246" y2="166" className="stroke-brand-600" strokeWidth="3" strokeLinecap="round" />
        <line x1="254" y1="136" x2="254" y2="166" className="stroke-prov-ai" strokeWidth="3" strokeLinecap="round" />
        <line x1="260" y1="144" x2="259" y2="166" className="stroke-gray-500" strokeWidth="3" strokeLinecap="round" />
        <path d="M300 176h30v34h-30z" className="fill-white stroke-gray-300" strokeWidth="1" />
        <path d="M330 184a9 9 0 0 1 0 18" className="stroke-gray-300" strokeWidth="2" fill="none" />
      </g>
    </svg>
  );
}
