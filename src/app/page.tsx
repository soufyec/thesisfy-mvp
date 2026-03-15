"use client";

import Link from "next/link";
import { useState } from "react";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const features = [
  {
    icon: EyeIcon,
    title: "Real-Time Monitoring",
    description: "Track writing patterns, keystrokes, and AI interactions as they happen. No surprises at submission time.",
  },
  {
    icon: ShieldIcon,
    title: "Integrity Scoring",
    description: "Dynamic integrity scores based on writing behavior, not post-hoc AI detection that produces false positives.",
  },
  {
    icon: PenIcon,
    title: "Regulated AI Assistance",
    description: "Students can use AI tools transparently within defined boundaries. AI usage is logged, not banned.",
  },
  {
    icon: BarChartIcon,
    title: "Analytics Dashboard",
    description: "Detailed analytics for professors and administrators to understand writing patterns across their institution.",
  },
  {
    icon: GlobeIcon,
    title: "Multi-Institution Support",
    description: "Deploy across departments or entire universities. Support for multiple languages and academic standards.",
  },
  {
    icon: LockIcon,
    title: "Privacy-First Design",
    description: "Student data is encrypted and anonymized. GDPR and FERPA compliant by design.",
  },
];

const comparisons = [
  { feature: "Approach", turnitin: "Post-submission detection", thesisfy: "Real-time regulation" },
  { feature: "AI Usage", turnitin: "Binary flag (AI or not)", thesisfy: "Transparent AI usage tracking" },
  { feature: "False Positives", turnitin: "High rate of false accusations", thesisfy: "Behavioral analysis eliminates false positives" },
  { feature: "Student Experience", turnitin: "Anxiety and fear", thesisfy: "Confidence and transparency" },
  { feature: "Learning Value", turnitin: "Punitive after the fact", thesisfy: "Formative during the process" },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For individual students",
    features: ["1 active thesis", "Basic integrity tracking", "AI usage monitoring", "Writing analytics"],
    cta: "Start Free",
    popular: false,
  },
  {
    name: "Department",
    price: "$4",
    period: "/student/month",
    description: "For university departments",
    features: ["Unlimited theses", "Advanced analytics", "Professor dashboard", "Bulk enrollment", "Priority support", "Custom AI policies"],
    cta: "Contact Sales",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For entire universities",
    features: ["Everything in Department", "SSO integration", "LMS integration", "Dedicated success manager", "Custom SLA", "On-premise option"],
    cta: "Contact Sales",
    popular: false,
  },
];

const stats = [
  { value: "50+", label: "Universities" },
  { value: "12,000+", label: "Students" },
  { value: "99.2%", label: "Accuracy" },
  { value: "0", label: "False Accusations" },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                <ShieldIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Thesisfy<span className="text-brand-600">.edu</span></span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Features</a>
              <a href="#comparison" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Compare</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Pricing</a>
              <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Sign In</Link>
              <Link href="/login" className="btn-primary text-sm !py-2 !px-4">Get Started</Link>
            </div>

            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            <a href="#features" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#comparison" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Compare</a>
            <a href="#pricing" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link href="/login" className="block text-sm font-medium text-gray-600 py-2">Sign In</Link>
            <Link href="/login" className="btn-primary text-sm w-full text-center">Get Started</Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 rounded-full text-brand-700 text-sm font-medium mb-8 animate-fade-in">
              <ShieldIcon className="w-4 h-4" />
              The Anti-Turnitin for the AI Era
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-slide-up">
              Academic Integrity Through{" "}
              <span className="gradient-text">AI Regulation</span>
              {", "}Not Detection
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
              Stop punishing students for using AI. Start empowering them to use it responsibly.
              Thesisfy monitors the writing process, not just the output.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <Link href="/login" className="btn-primary text-base !px-8 !py-4 w-full sm:w-auto">
                Start Writing with Integrity
                <ArrowRightIcon className="w-5 h-5 ml-2" />
              </Link>
              <a href="#comparison" className="btn-outline text-base !px-8 !py-4 w-full sm:w-auto">
                See How We Compare
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold gradient-text">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Hero visual - Dashboard Preview */}
          <div className="mt-20 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-600/10 to-accent-500/10 rounded-3xl blur-3xl" />
            <div className="relative bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-800">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-xs text-gray-400">thesisfy.edu/dashboard</span>
              </div>
              <div className="p-6 sm:p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-xs text-gray-400 mb-2">Integrity Score</div>
                    <div className="text-3xl font-bold text-green-400">94%</div>
                    <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                      <div className="bg-green-400 h-2 rounded-full" style={{ width: "94%" }} />
                    </div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-xs text-gray-400 mb-2">AI Usage</div>
                    <div className="text-3xl font-bold text-blue-400">12%</div>
                    <div className="text-xs text-gray-500 mt-1">Within acceptable range</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="text-xs text-gray-400 mb-2">Words Written Today</div>
                    <div className="text-3xl font-bold text-purple-400">450</div>
                    <div className="text-xs text-gray-500 mt-1">+23% vs last session</div>
                  </div>
                </div>
                <div className="mt-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-400">Writing Activity (Last 7 days)</span>
                    <span className="text-xs text-green-400">Active now</span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {[40, 65, 30, 80, 55, 90, 70].map((h, i) => (
                      <div key={i} className="flex-1 bg-brand-500/60 rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need for{" "}
              <span className="gradient-text">Academic Integrity</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              A complete platform that transforms how universities approach AI in academic writing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="card p-6 group">
                <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-100 transition-colors">
                  <feature.icon className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section id="comparison" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Turnitin vs <span className="gradient-text">Thesisfy</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              The old approach punishes. The new approach empowers.
            </p>
          </div>

          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-500"></th>
                  <th className="text-left py-4 px-6">
                    <span className="text-sm font-medium text-gray-400">Turnitin</span>
                  </th>
                  <th className="text-left py-4 px-6">
                    <span className="text-sm font-bold gradient-text">Thesisfy.edu</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr key={row.feature} className="border-t border-gray-100">
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">{row.feature}</td>
                    <td className="py-4 px-6 text-sm text-gray-500">{row.turnitin}</td>
                    <td className="py-4 px-6 text-sm text-brand-700 font-medium">{row.thesisfy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Three simple steps to genuine academic integrity.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Write in Thesisfy", description: "Students write their thesis using our integrated editor. Every keystroke, edit, and AI interaction is transparently logged." },
              { step: "02", title: "AI Assists, Regulated", description: "Students can use AI tools within professor-defined boundaries. Usage is tracked and visible, not hidden." },
              { step: "03", title: "Integrity Verified", description: "Professors see a complete integrity profile based on actual writing behavior, not probabilistic AI detection." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, <span className="gradient-text">Transparent</span> Pricing
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Start free. Scale as your institution grows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <div key={plan.name} className={`card p-8 relative ${plan.popular ? "border-brand-500 border-2 shadow-lg shadow-brand-600/10" : ""}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckIcon className="w-4 h-4 text-accent-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={plan.popular ? "btn-primary w-full text-center" : "btn-outline w-full text-center"}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-12 sm:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPjwvc3ZnPg==')] opacity-50" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Transform Academic Integrity?
              </h2>
              <p className="text-brand-100 mb-8 max-w-xl mx-auto">
                Join 50+ universities already using Thesisfy to build a culture of transparency and responsible AI usage.
              </p>
              <Link href="/login" className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-brand-700 bg-white rounded-xl hover:bg-brand-50 transition-all duration-200 shadow-lg">
                Get Started for Free
                <ArrowRightIcon className="w-5 h-5 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                  <ShieldIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold">Thesisfy<span className="text-brand-600">.edu</span></span>
              </div>
              <p className="text-sm text-gray-500">Academic integrity through AI regulation, not detection.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-brand-600 transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-brand-600 transition-colors">Pricing</a></li>
                <li><a href="#comparison" className="hover:text-brand-600 transition-colors">Compare</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-brand-600 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-brand-600 transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">GDPR</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Thesisfy.edu. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
