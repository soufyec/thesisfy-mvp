"use client";

import React from "react";

/** Small, dependency-free Markdown renderer for assistant replies (headings, lists, quotes, code, bold/italic/links). Produces React nodes, never raw HTML. */
export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return <div className={`md ${className}`}>{blocks.map((b, i) => renderBlock(b, i))}</div>;
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string; lang?: string }
  | { type: "hr" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push({ type: "code", text: buf.join("\n"), lang });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ type: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push({ type: "hr" });
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push({ type: "ol", items });
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ type: "quote", text: buf.join("\n") });
      continue;
    }
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*•]\s|\s*\d+[.)]\s|>)/.test(lines[i])) buf.push(lines[i++]);
    out.push({ type: "p", text: buf.join(" ") });
  }
  return out;
}

function renderBlock(b: Block, key: number): React.ReactNode {
  switch (b.type) {
    case "h": {
      const Tag = (`h${Math.min(6, b.level + 2)}` as unknown) as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} className="font-semibold mt-3 mb-1 text-[0.95em]">
          {inline(b.text)}
        </Tag>
      );
    }
    case "p":
      return (
        <p key={key} className="my-1.5 leading-relaxed">
          {inline(b.text)}
        </p>
      );
    case "ul":
      return (
        <ul key={key} className="list-disc pl-5 my-1.5 space-y-0.5">
          {b.items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="list-decimal pl-5 my-1.5 space-y-0.5">
          {b.items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-l-2 border-brand-300 pl-3 my-2 text-gray-600 italic whitespace-pre-wrap">
          {inline(b.text)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 text-xs overflow-x-auto">
          <code>{b.text}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} className="my-3 border-gray-200" />;
  }
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string): React.ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (!part) return null;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="bg-gray-100 rounded px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = /^https?:\/\//i.test(link[2]) ? link[2] : "#";
      return (
        <a key={i} href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">
          {link[1]}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Markdown -> minimal HTML for inserting assistant output into the editor (ProseMirror parses it). */
export function markdownToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inl = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return parseBlocks(src)
    .map((b) => {
      switch (b.type) {
        case "h":
          return `<h${Math.min(3, b.level + 1)}>${inl(b.text)}</h${Math.min(3, b.level + 1)}>`;
        case "p":
          return `<p>${inl(b.text)}</p>`;
        case "ul":
          return `<ul>${b.items.map((i) => `<li><p>${inl(i)}</p></li>`).join("")}</ul>`;
        case "ol":
          return `<ol>${b.items.map((i) => `<li><p>${inl(i)}</p></li>`).join("")}</ol>`;
        case "quote":
          return `<blockquote><p>${inl(b.text)}</p></blockquote>`;
        case "code":
          return `<pre><code>${esc(b.text)}</code></pre>`;
        case "hr":
          return "<hr>";
      }
    })
    .join("");
}
