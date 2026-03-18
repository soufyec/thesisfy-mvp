"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

/* ===== SVG Icon Components ===== */

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

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
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

/* ===== Avatar Component ===== */

function Avatar({
  initials,
  gradient,
  size = "md",
  ring = false,
}: {
  initials: string;
  gradient: string;
  size?: "sm" | "md" | "lg" | "xl";
  ring?: boolean;
}) {
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-xl",
  };
  return (
    <div
      className={`${sizes[size]} ${gradient} rounded-full flex items-center justify-center text-white font-bold shadow-lg ${
        ring ? "ring-3 ring-white" : ""
      }`}
    >
      {initials}
    </div>
  );
}

/* ===== Animated Counter ===== */

function AnimatedCounter({ target, suffix = "" }: { target: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const num = parseInt(target.replace(/[^0-9]/g, ""));
    if (isNaN(num)) return;
    const duration = 2000;
    const steps = 60;
    const increment = num / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= num) {
        setCount(num);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [visible, target]);

  const isNumeric = /^\d/.test(target);

  return (
    <div ref={ref} className="text-3xl sm:text-4xl font-bold gradient-text">
      {isNumeric ? (
        <>
          {count.toLocaleString()}
          {target.includes("+") ? "+" : ""}
          {suffix}
        </>
      ) : (
        target
      )}
    </div>
  );
}

/* ===== Live Typing Animation ===== */

function TypingAnimation() {
  const [text, setText] = useState("");
  const fullText =
    "Climate change represents one of the most significant challenges of our era. This thesis explores the application of modern machine learning techniques...";
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < fullText.length) {
      const timer = setTimeout(
        () => {
          setText(fullText.slice(0, index + 1));
          setIndex(index + 1);
        },
        30 + Math.random() * 40
      );
      return () => clearTimeout(timer);
    }
  }, [index, fullText]);

  return (
    <div className="font-serif text-sm text-gray-700 leading-relaxed">
      {text}
      <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
    </div>
  );
}

/* ===== Data ===== */

const testimonials = [
  {
    name: "Sarah Chen",
    role: "PhD Candidate",
    university: "Stanford University",
    initials: "SC",
    gradient: "bg-gradient-to-br from-rose-400 to-pink-600",
    quote:
      "Thesisfy changed how I approach my dissertation. I use AI for brainstorming without any guilt — my advisor can see exactly how I use it, and my integrity score speaks for itself.",
    rating: 5,
  },
  {
    name: "Prof. Marcus Webb",
    role: "Department Head, Computer Science",
    university: "MIT",
    initials: "MW",
    gradient: "bg-gradient-to-br from-blue-400 to-indigo-600",
    quote:
      "Instead of spending hours running plagiarism checks after submission, I can see the entire writing process in real time. It's the difference between policing and mentoring.",
    rating: 5,
  },
  {
    name: "Amara Okafor",
    role: "Master's Student",
    university: "University of Oxford",
    initials: "AO",
    gradient: "bg-gradient-to-br from-emerald-400 to-teal-600",
    quote:
      "The regulated AI assistant is incredible. It helps me structure my arguments without writing them for me. My writing has genuinely improved since I started using Thesisfy.",
    rating: 5,
  },
  {
    name: "Dr. Elena Rossi",
    role: "Associate Professor, Literature",
    university: "Sorbonne University",
    initials: "ER",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
    quote:
      "The writing playback feature is revolutionary. I can see a student's thought process unfold — where they struggled, where they excelled. It makes my feedback so much more targeted.",
    rating: 5,
  },
  {
    name: "James Liu",
    role: "PhD Student, Bioengineering",
    university: "ETH Zurich",
    initials: "JL",
    gradient: "bg-gradient-to-br from-cyan-400 to-blue-600",
    quote:
      "As a non-native English speaker, the proofreading tools help me write at an academic level without Turnitin flagging my work as AI-generated. Finally, a fair system.",
    rating: 5,
  },
  {
    name: "Prof. David Nakamura",
    role: "Dean of Graduate Studies",
    university: "University of Toronto",
    initials: "DN",
    gradient: "bg-gradient-to-br from-violet-400 to-purple-600",
    quote:
      "We rolled out Thesisfy across three departments. Academic misconduct cases dropped 73% in the first semester — not because students cheat less, but because the rules are finally clear.",
    rating: 5,
  },
];

const universities = [
  { name: "Stanford University", color: "#8C1515" },
  { name: "MIT", color: "#A31F34" },
  { name: "University of Oxford", color: "#002147" },
  { name: "ETH Zurich", color: "#1F407A" },
  { name: "Sorbonne University", color: "#1B3A6B" },
  { name: "University of Toronto", color: "#002A5C" },
  { name: "TU Munich", color: "#0065BD" },
  { name: "NUS Singapore", color: "#003D7C" },
];

const features = [
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "Real-Time Monitoring",
    description:
      "Track writing patterns, keystrokes, and AI interactions as they happen. No surprises at submission time.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Integrity Scoring",
    description:
      "Dynamic integrity scores based on writing behavior, not post-hoc AI detection that produces false positives.",
    color: "from-green-500 to-emerald-500",
    bg: "bg-green-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: "Regulated AI Tools",
    description:
      "Students use AI transparently within defined boundaries. AI usage is logged, tracked, and visible — not banned.",
    color: "from-purple-500 to-violet-500",
    bg: "bg-purple-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
    title: "Analytics Dashboard",
    description:
      "Detailed analytics for professors and administrators to understand writing patterns across their institution.",
    color: "from-orange-500 to-amber-500",
    bg: "bg-orange-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Multi-Institution Support",
    description:
      "Deploy across departments or entire universities. Support for multiple languages and academic standards.",
    color: "from-teal-500 to-cyan-500",
    bg: "bg-teal-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Privacy-First Design",
    description:
      "Student data is encrypted and anonymized. GDPR and FERPA compliant by design. Zero data selling.",
    color: "from-red-500 to-rose-500",
    bg: "bg-red-50",
  },
];

const comparisons = [
  {
    feature: "Approach",
    turnitin: "Post-submission detection",
    thesisfy: "Real-time regulation & monitoring",
  },
  {
    feature: "AI Usage",
    turnitin: "Binary flag (AI or not)",
    thesisfy: "Transparent AI usage tracking",
  },
  {
    feature: "False Positives",
    turnitin: "High rate of false accusations",
    thesisfy: "Behavioral analysis eliminates false positives",
  },
  {
    feature: "Student Experience",
    turnitin: "Anxiety and fear of false flags",
    thesisfy: "Confidence and transparency",
  },
  {
    feature: "Learning Value",
    turnitin: "Punitive after the fact",
    thesisfy: "Formative during the writing process",
  },
  {
    feature: "Professor Insight",
    turnitin: "Similarity percentage only",
    thesisfy: "Full writing process playback & analytics",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For individual students",
    features: [
      "1 active thesis",
      "Basic integrity tracking",
      "AI usage monitoring",
      "Writing analytics",
    ],
    cta: "Start Free",
    popular: false,
  },
  {
    name: "Department",
    price: "$4",
    period: "/student/month",
    description: "For university departments",
    features: [
      "Unlimited theses",
      "Advanced analytics dashboard",
      "Professor monitoring tools",
      "Bulk enrollment & SSO",
      "Priority support",
      "Custom AI policies",
    ],
    cta: "Contact Sales",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For entire universities",
    features: [
      "Everything in Department",
      "LMS integration (Canvas, Moodle)",
      "Dedicated success manager",
      "Custom SLA & uptime guarantee",
      "On-premise deployment option",
      "Advanced API access",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const stats = [
  { value: "50+", label: "Universities" },
  { value: "12000+", label: "Students" },
  { value: "99.2%", label: "Accuracy" },
  { value: "0", label: "False Accusations" },
];

/* ===== Main Landing Page ===== */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  // Auto-rotate testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                <ShieldIcon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">
                Thesisfy<span className="text-brand-600">.edu</span>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Features</a>
              <a href="#testimonials" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Testimonials</a>
              <a href="#comparison" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Compare</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Pricing</a>
              <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Sign In</Link>
              <Link href="/login" className="btn-primary text-sm !py-2 !px-4">
                Get Started
              </Link>
            </div>

            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            <a href="#features" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#testimonials" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Testimonials</a>
            <a href="#comparison" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Compare</a>
            <a href="#pricing" className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link href="/login" className="block text-sm font-medium text-gray-600 py-2">Sign In</Link>
            <Link href="/login" className="btn-primary text-sm w-full text-center">Get Started</Link>
          </div>
        )}
      </nav>

      {/* ===== HERO SECTION ===== */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 relative">
        {/* Background decorations */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-brand-200/30 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute top-40 right-10 w-96 h-96 bg-accent-200/20 rounded-full blur-3xl animate-float-slower" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-purple-200/20 rounded-full blur-3xl animate-float-slow" />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 border border-brand-100 rounded-full text-brand-700 text-sm font-medium mb-8 animate-fade-in">
              <ShieldIcon className="w-4 h-4" />
              The Anti-Turnitin for the AI Era
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-slide-up">
              Academic Integrity Through{" "}
              <span className="gradient-text relative">
                AI Regulation
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 300 12"
                  fill="none"
                >
                  <path
                    d="M2 8c50-6 100-6 148-2s100 4 148-2"
                    stroke="url(#grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#4c6ef5" />
                      <stop offset="1" stopColor="#20c997" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <br />
              Not Detection
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
              Stop punishing students for using AI. Start empowering them to use
              it responsibly. Thesisfy monitors the{" "}
              <span className="font-semibold text-gray-800">
                writing process
              </span>
              , not just the output.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <Link href="/login" className="btn-primary text-base !px-8 !py-4 w-full sm:w-auto group">
                Start Writing with Integrity
                <ArrowRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#comparison" className="btn-outline text-base !px-8 !py-4 w-full sm:w-auto">
                See How We Compare
              </a>
            </div>

            {/* Avatars row - social proof */}
            <div className="flex items-center justify-center gap-3 mt-10 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <div className="flex -space-x-3">
                {testimonials.slice(0, 5).map((t, i) => (
                  <div
                    key={i}
                    className={`w-9 h-9 ${t.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white`}
                  >
                    {t.initials}
                  </div>
                ))}
              </div>
              <div className="text-left">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} className="w-4 h-4 text-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Loved by <span className="font-semibold text-gray-700">12,000+</span> students & professors
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <AnimatedCounter target={stat.value} />
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Hero visual - Live Editor Preview */}
          <div className="mt-16 relative animate-slide-up" style={{ animationDelay: "0.4s" }}>
            <div className="absolute inset-0 bg-gradient-to-r from-brand-600/10 to-accent-500/10 rounded-3xl blur-3xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-400 w-72">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    thesisfy.edu/editor
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3">
                {/* Editor area */}
                <div className="lg:col-span-2 p-6 sm:p-8 border-r border-gray-100">
                  {/* Fake toolbar */}
                  <div className="flex items-center gap-2 pb-4 mb-4 border-b border-gray-100">
                    <div className="flex gap-1">
                      <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-500">B</div>
                      <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs italic text-gray-500">I</div>
                      <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs underline text-gray-500">U</div>
                    </div>
                    <div className="w-px h-4 bg-gray-200" />
                    <div className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">
                      Heading 1
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      Auto-saving
                    </div>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-gray-800 mb-3">
                    Machine Learning Applications in Climate Change Prediction
                  </h3>
                  <TypingAnimation />

                  {/* Monitoring indicators */}
                  <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Session active
                    </span>
                    <span>2,847 words</span>
                    <span>142 keystrokes</span>
                    <span className="text-blue-500">AI: 12%</span>
                  </div>
                </div>

                {/* Side panel - Student profile + integrity */}
                <div className="p-6 bg-gray-50 hidden lg:block">
                  <div className="flex items-center gap-3 mb-5">
                    <Avatar
                      initials="SC"
                      gradient="bg-gradient-to-br from-rose-400 to-pink-600"
                      size="lg"
                    />
                    <div>
                      <div className="font-semibold text-sm">Sarah Chen</div>
                      <div className="text-xs text-gray-500">
                        PhD Candidate, Stanford
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">
                        Integrity Score
                      </div>
                      <div className="text-3xl font-bold text-green-600">
                        94%
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: "94%" }}
                        />
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">
                        AI Usage
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        12%
                      </div>
                      <div className="text-xs text-green-600 mt-1">
                        Within institutional limits
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">
                        Writing Sessions
                      </div>
                      <div className="flex items-end gap-0.5 h-10 mt-1">
                        {[40, 65, 30, 80, 55, 90, 70].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-brand-500/60 rounded-sm animate-grow-bar"
                            style={{
                              height: `${h}%`,
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUSTED BY UNIVERSITIES ===== */}
      <section className="py-12 px-4 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-medium text-gray-400 mb-8 uppercase tracking-wider">
            Trusted by leading universities worldwide
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
            {universities.map((uni) => (
              <div
                key={uni.name}
                className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ backgroundColor: uni.color }}
                >
                  {uni.name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                  {uni.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 rounded-full text-brand-600 text-xs font-semibold mb-4 uppercase tracking-wider">
              Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need for{" "}
              <span className="gradient-text">Academic Integrity</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              A complete platform that transforms how universities approach AI
              in academic writing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group card p-6 hover:-translate-y-1 transition-all duration-300"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div
                  className={`w-12 h-12 ${feature.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                >
                  <div className={`bg-gradient-to-r ${feature.color} bg-clip-text`}>
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS SECTION ===== */}
      <section
        id="testimonials"
        className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full text-amber-600 text-xs font-semibold mb-4 uppercase tracking-wider">
              Testimonials
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Loved by <span className="gradient-text">Students</span> and{" "}
              <span className="gradient-text">Professors</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Hear from the people who use Thesisfy every day.
            </p>
          </div>

          {/* Featured testimonial */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 sm:p-10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <Avatar
                  initials={testimonials[activeTestimonial].initials}
                  gradient={testimonials[activeTestimonial].gradient}
                  size="xl"
                />
                <div className="flex-1">
                  <div className="flex gap-1 mb-3">
                    {[...Array(testimonials[activeTestimonial].rating)].map(
                      (_, i) => (
                        <StarIcon
                          key={i}
                          className="w-5 h-5 text-amber-400"
                        />
                      )
                    )}
                  </div>
                  <blockquote className="text-lg text-gray-700 leading-relaxed mb-4 italic">
                    &ldquo;{testimonials[activeTestimonial].quote}&rdquo;
                  </blockquote>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {testimonials[activeTestimonial].name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {testimonials[activeTestimonial].role} &middot;{" "}
                      {testimonials[activeTestimonial].university}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation dots */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTestimonial(i)}
                    className={`transition-all duration-300 rounded-full ${
                      i === activeTestimonial
                        ? "w-8 h-2 bg-brand-500"
                        : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Testimonial grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 ${
                  i === activeTestimonial
                    ? "ring-2 ring-brand-500/30 border-brand-200"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Avatar
                    initials={t.initials}
                    gradient={t.gradient}
                    size="md"
                  />
                  <div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.role}</div>
                    <div className="text-xs text-gray-400">{t.university}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {[...Array(t.rating)].map((_, j) => (
                    <StarIcon key={j} className="w-3.5 h-3.5 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
                  &ldquo;{t.quote}&rdquo;
                </p>
                {t.role.includes("Prof") ||
                t.role.includes("Dean") ||
                t.role.includes("Department") ? (
                  <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-full text-[10px] font-medium text-blue-700">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                    Faculty
                  </div>
                ) : (
                  <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full text-[10px] font-medium text-green-700">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                    Student
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMPARISON SECTION ===== */}
      <section id="comparison" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 rounded-full text-red-600 text-xs font-semibold mb-4 uppercase tracking-wider">
              Comparison
            </div>
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
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-500" />
                  <th className="text-left py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                        <XIcon className="w-3 h-3 text-gray-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-400">
                        Turnitin
                      </span>
                    </div>
                  </th>
                  <th className="text-left py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-accent-500 rounded flex items-center justify-center">
                        <CheckIcon className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-bold gradient-text">
                        Thesisfy.edu
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-t border-gray-100 ${
                      i % 2 === 0 ? "bg-gray-50/50" : ""
                    }`}
                  >
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">
                      {row.feature}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <XIcon className="w-4 h-4 text-red-300 flex-shrink-0" />
                        {row.turnitin}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-brand-700 font-medium">
                      <div className="flex items-center gap-2">
                        <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {row.thesisfy}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full text-green-600 text-xs font-semibold mb-4 uppercase tracking-wider">
              How It Works
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Three Simple Steps
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              From writing to verification in one seamless platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Students Write",
                description:
                  "Students write in our Google Docs-like editor. Every keystroke, edit, and AI interaction is transparently logged.",
                icon: (
                  <svg className="w-8 h-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                ),
                people: [
                  { initials: "SC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600" },
                  { initials: "JL", gradient: "bg-gradient-to-br from-cyan-400 to-blue-600" },
                  { initials: "AO", gradient: "bg-gradient-to-br from-emerald-400 to-teal-600" },
                ],
              },
              {
                step: "02",
                title: "AI Assists, Regulated",
                description:
                  "Students use AI within institution-defined boundaries. Usage is tracked, categorized, and fully transparent.",
                icon: (
                  <svg className="w-8 h-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                people: [
                  { initials: "SC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600" },
                ],
              },
              {
                step: "03",
                title: "Professors Verify",
                description:
                  "Professors see a complete integrity profile: writing process playback, AI usage analytics, and behavioral patterns.",
                icon: (
                  <svg className="w-8 h-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ),
                people: [
                  { initials: "MW", gradient: "bg-gradient-to-br from-blue-400 to-indigo-600" },
                  { initials: "ER", gradient: "bg-gradient-to-br from-amber-400 to-orange-600" },
                ],
              },
            ].map((item, i) => (
              <div key={item.step} className="relative text-center group">
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-brand-300 to-brand-100" />
                )}

                <div className="w-20 h-20 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center mx-auto mb-4 group-hover:-translate-y-1 transition-transform">
                  {item.icon}
                </div>

                <div className="text-xs font-bold text-brand-500 mb-1">
                  STEP {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {item.description}
                </p>

                {/* People involved */}
                <div className="flex justify-center -space-x-2">
                  {item.people.map((p, j) => (
                    <div
                      key={j}
                      className={`w-7 h-7 ${p.gradient} rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white`}
                    >
                      {p.initials}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 rounded-full text-brand-600 text-xs font-semibold mb-4 uppercase tracking-wider">
              Pricing
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple, <span className="gradient-text">Transparent</span> Pricing
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Start free. Scale as your institution grows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`card p-8 relative hover:-translate-y-1 transition-all duration-300 ${
                  plan.popular
                    ? "border-brand-500 border-2 shadow-xl shadow-brand-600/10"
                    : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-brand-600 to-accent-500 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {plan.description}
                </p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <CheckIcon className="w-4 h-4 text-accent-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={
                    plan.popular
                      ? "btn-primary w-full text-center"
                      : "btn-outline w-full text-center"
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 rounded-3xl p-12 sm:p-16 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
              <div className="absolute top-4 left-10 w-20 h-20 border-2 border-white rounded-full" />
              <div className="absolute bottom-8 right-14 w-32 h-32 border-2 border-white rounded-full" />
              <div className="absolute top-1/2 left-1/3 w-12 h-12 border-2 border-white rounded-full" />
            </div>

            {/* Floating avatars */}
            <div className="absolute top-6 right-20 opacity-80 hidden sm:block">
              <Avatar initials="MW" gradient="bg-gradient-to-br from-blue-400 to-indigo-600" size="sm" ring />
            </div>
            <div className="absolute bottom-8 left-12 opacity-80 hidden sm:block">
              <Avatar initials="SC" gradient="bg-gradient-to-br from-rose-400 to-pink-600" size="sm" ring />
            </div>
            <div className="absolute top-1/2 right-8 opacity-80 hidden sm:block">
              <Avatar initials="AO" gradient="bg-gradient-to-br from-emerald-400 to-teal-600" size="sm" ring />
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Transform Academic Integrity?
              </h2>
              <p className="text-brand-100 mb-8 max-w-xl mx-auto">
                Join 50+ universities and 12,000+ students already using Thesisfy
                to build a culture of transparency and responsible AI usage.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-brand-700 bg-white rounded-xl hover:bg-brand-50 transition-all duration-200 shadow-lg group"
                >
                  Get Started for Free
                  <ArrowRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="#comparison"
                  className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white border-2 border-white/30 rounded-xl hover:bg-white/10 transition-all duration-200"
                >
                  Watch Demo
                </a>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center justify-center gap-6 mt-8">
                <div className="flex items-center gap-1.5 text-brand-200 text-xs">
                  <CheckIcon className="w-4 h-4" />
                  No credit card required
                </div>
                <div className="flex items-center gap-1.5 text-brand-200 text-xs">
                  <CheckIcon className="w-4 h-4" />
                  GDPR compliant
                </div>
                <div className="flex items-center gap-1.5 text-brand-200 text-xs hidden sm:flex">
                  <CheckIcon className="w-4 h-4" />
                  SOC 2 certified
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                  <ShieldIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold">
                  Thesisfy<span className="text-brand-600">.edu</span>
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Academic integrity through AI regulation, not detection.
              </p>
              {/* Social proof in footer */}
              <div className="flex -space-x-2">
                {testimonials.slice(0, 4).map((t, i) => (
                  <div
                    key={i}
                    className={`w-7 h-7 ${t.gradient} rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white`}
                  >
                    {t.initials}
                  </div>
                ))}
                <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-[9px] font-bold ring-2 ring-white">
                  +12k
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#features" className="hover:text-brand-600 transition-colors">Features</a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-brand-600 transition-colors">Pricing</a>
                </li>
                <li>
                  <a href="#comparison" className="hover:text-brand-600 transition-colors">Compare</a>
                </li>
                <li>
                  <a href="#testimonials" className="hover:text-brand-600 transition-colors">Testimonials</a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">About</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Blog</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Careers</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Contact</a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Privacy Policy</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Terms of Service</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">GDPR</a>
                </li>
                <li>
                  <a href="#" className="hover:text-brand-600 transition-colors">Security</a>
                </li>
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
