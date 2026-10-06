import { Check } from "lucide-react";
import LandingNav, { Logo } from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import PilotForm from "@/components/landing/PilotForm";

const PILLARS = [
  {
    n: "01",
    title: "Attribution at the moment of writing",
    body: "Text inserted from the assistant or pasted from a source is marked when it enters the document. Sentences taken from a Research copilot answer are recognised and attributed. Nothing is inferred afterwards.",
  },
  {
    n: "02",
    title: "A ledger the student can see and fix",
    body: "The integrity score is a sum of visible deductions: unattributed pastes, AI share above policy, open notices. Every point maps to an action the student can take.",
  },
  {
    n: "03",
    title: "Consent and policy enforced on the server",
    body: "Students choose monitoring scopes within the institution's policy. Events outside the granted scopes are dropped even if a client sends them. Receipts are downloadable.",
  },
];

const ROLES = [
  {
    who: "Integrity office",
    chip: "bg-brand-50 text-brand-700",
    title: "Fewer accusations, better evidence",
    items: [
      "A policy you set once: AI share limit, permitted tools and modes, monitoring scopes.",
      "Provenance reports instead of probability scores in appeal hearings.",
      "Monthly AI spend by model and department, with budget alerts.",
    ],
  },
  {
    who: "Advisors",
    chip: "bg-accent-50 text-accent-700",
    title: "Read the process, not just the draft",
    items: [
      "Which passages were AI-assisted, pasted or written, with dates.",
      "Session timeline and AI log alongside the chapter you are reviewing.",
      "Approve, request revision or comment without leaving the document.",
    ],
  },
  {
    who: "Students",
    chip: "bg-prov-ai-soft text-prov-ai-deep",
    title: "Use AI openly, within the rules",
    items: [
      "Claude, GPT, Gemini or Mistral inside the editor, paid by the university or their own account.",
      "An assistant that outlines, critiques and corrects, but never writes the thesis.",
      "A Research copilot for any question about their work, paid by the university, with the history kept.",
      "Clear view of their own AI share and what each insertion costs.",
    ],
  },
];

const FOOTER_LINKS = [
  { href: "#model", label: "Integrity model" },
  { href: "#model", label: "Data & consent" },
  { href: "#model", label: "Privacy" },
  { href: "#pilot", label: "Contact" },
];

const CARD = "bg-white rounded-2xl border border-gray-100 shadow-sm p-7";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNav />

      <Hero />

      {/* Integrity model */}
      <section id="model" className="py-20 px-5 sm:px-8 bg-gray-50 scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-center mb-14">
            <h2 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.02em] mb-3">
              Why a provenance report beats an <span className="gradient-text">AI score</span>
            </h2>
            <p className="text-[16px] text-gray-600 max-w-[600px] mx-auto">Three design decisions that hold up in an appeal hearing.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {PILLARS.map((p) => (
              <article key={p.n} className={CARD}>
                <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-[15px] mb-[18px]" aria-hidden="true">
                  {p.n}
                </div>
                <h3 className="text-[17px] font-semibold mb-2">{p.title}</h3>
                <p className="text-[14px] leading-[1.65] text-gray-600 [text-wrap:pretty]">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Three readers */}
      <section id="roles" className="py-20 px-5 sm:px-8 bg-white scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-center mb-14">
            <h2 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.02em]">One record, three readers</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {ROLES.map((r) => (
              <article key={r.who} className={CARD}>
                <div className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-semibold mb-3.5 ${r.chip}`}>{r.who}</div>
                <h3 className="text-[20px] font-bold leading-[1.3] tracking-[-0.01em] mb-3.5">{r.title}</h3>
                <ul className="flex flex-col gap-2.5 text-[14px] leading-[1.55] text-gray-600 list-none p-0 m-0">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2.5">
                      <Check className="w-4 h-4 text-accent-500 flex-shrink-0 mt-[3px]" strokeWidth={2.4} aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot programme */}
      <section id="pilot" className="px-5 sm:px-8 pt-10 pb-24 scroll-mt-16">
        <div className="mx-auto max-w-[1200px] bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-3xl p-7 sm:p-10 lg:p-14 grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-10 lg:gap-12 items-center">
          <div>
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-brand-200 mb-4">Pilot programme</div>
            <h2 className="text-[30px] sm:text-[36px] leading-[1.15] font-bold tracking-[-0.02em] mb-4 [text-wrap:pretty]">One department. One semester. A report you can take to the academic board.</h2>
            <p className="text-[16px] leading-[1.6] text-brand-100 max-w-[520px] [text-wrap:pretty]">
              We set up your AI policy together, onboard advisors and students in a 45-minute session, and deliver an end-of-term integrity report with provenance statistics, consent records and AI spend.
            </p>
          </div>
          <PilotForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-5 sm:px-8 py-8 text-[13px] text-gray-500">
        <div className="mx-auto max-w-[1200px] flex flex-wrap items-center justify-between gap-6">
          <Logo size="footer" />
          <nav className="flex flex-wrap gap-6" aria-label="Footer">
            {FOOTER_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <span>© 2026 Thesisfic.edu</span>
        </div>
      </footer>
    </div>
  );
}
