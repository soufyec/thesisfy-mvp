"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";

/* ===== Scroll Animation Hook ===== */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold, rootMargin: "0px 0px -50px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ===== Parallax Hook ===== */
function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY * speed);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return offset;
}

/* ===== Mouse Follow Hook ===== */
function useMousePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

/* ===== Scroll Progress ===== */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return progress;
}

/* ===== Animated Counter ===== */
function AnimatedCounter({ target, suffix = "" }: { target: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useScrollReveal(0.3);

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
      if (current >= num) { setCount(num); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [visible, target]);

  const isNumeric = /^\d/.test(target);
  return (
    <div ref={ref}>
      <div className="text-4xl sm:text-5xl font-extrabold gradient-text">
        {isNumeric ? <>{count.toLocaleString()}{target.includes("+") ? "+" : ""}{suffix}</> : target}
      </div>
    </div>
  );
}

/* ===== Typing Animation ===== */
function TypingAnimation() {
  const [text, setText] = useState("");
  const fullText = "Climate change represents one of the most significant challenges of our era. This thesis explores the application of modern machine learning techniques to improve regional climate prediction accuracy...";
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index < fullText.length) {
      const timer = setTimeout(() => { setText(fullText.slice(0, index + 1)); setIndex(index + 1); }, 25 + Math.random() * 35);
      return () => clearTimeout(timer);
    }
  }, [index, fullText]);
  return (
    <div className="font-serif text-sm text-gray-700 leading-relaxed">
      {text}<span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
    </div>
  );
}

/* ===== 3D Tilt Card ===== */
function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -8;
    card.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg) scale(1.02)`;
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (cardRef.current) cardRef.current.style.transform = "perspective(800px) rotateY(0) rotateX(0) scale(1)";
  }, []);
  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} className={`transition-transform duration-200 ease-out ${className}`}>
      {children}
    </div>
  );
}

/* ===== Reveal Wrapper ===== */
function Reveal({ children, delay = 0, direction = "up", className = "" }: { children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right" | "scale"; className?: string }) {
  const { ref, visible } = useScrollReveal();
  const transforms: Record<string, string> = {
    up: "translate-y-8", left: "translate-x-8", right: "-translate-x-8", scale: "scale-95",
  };
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0 translate-x-0 scale-100" : `opacity-0 ${transforms[direction]}`} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ===== Data ===== */

const testimonials = [
  { name: "Sarah Chen", role: "PhD Candidate", university: "Stanford University", initials: "SC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600", quote: "Thesisfy changed how I approach my dissertation. I use AI for brainstorming without any guilt — my advisor can see exactly how I use it.", rating: 5 },
  { name: "Prof. Marcus Webb", role: "Dept. Head, Computer Science", university: "MIT", initials: "MW", gradient: "bg-gradient-to-br from-blue-400 to-indigo-600", quote: "Instead of spending hours running plagiarism checks, I see the entire writing process in real time. It's the difference between policing and mentoring.", rating: 5 },
  { name: "Amara Okafor", role: "Master's Student", university: "University of Oxford", initials: "AO", gradient: "bg-gradient-to-br from-emerald-400 to-teal-600", quote: "The regulated AI assistant helps me structure my arguments without writing them for me. My writing has genuinely improved.", rating: 5 },
  { name: "Dr. Elena Rossi", role: "Associate Professor, Literature", university: "Sorbonne University", initials: "ER", gradient: "bg-gradient-to-br from-amber-400 to-orange-600", quote: "The writing playback feature is revolutionary. I can see where students struggled, where they excelled. My feedback is now so much more targeted.", rating: 5 },
  { name: "James Liu", role: "PhD Student, Bioengineering", university: "ETH Zurich", initials: "JL", gradient: "bg-gradient-to-br from-cyan-400 to-blue-600", quote: "As a non-native English speaker, the tools help me write academically without being flagged as AI-generated. Finally, a fair system.", rating: 5 },
  { name: "Prof. David Nakamura", role: "Dean of Graduate Studies", university: "University of Toronto", initials: "DN", gradient: "bg-gradient-to-br from-violet-400 to-purple-600", quote: "Academic misconduct cases dropped 73% in the first semester. Not because students cheat less, but because the rules are finally clear.", rating: 5 },
];

const universities = [
  { name: "Stanford", color: "#8C1515" }, { name: "MIT", color: "#A31F34" }, { name: "Oxford", color: "#002147" },
  { name: "ETH Zurich", color: "#1F407A" }, { name: "Sorbonne", color: "#1B3A6B" }, { name: "U of Toronto", color: "#002A5C" },
  { name: "TU Munich", color: "#0065BD" }, { name: "NUS", color: "#003D7C" },
];

const features = [
  { icon: "eye", title: "Real-Time Monitoring", description: "Track every keystroke, edit, and AI interaction as it happens. Full transparency, zero surprises.", color: "from-blue-500 to-cyan-500", bg: "bg-blue-50", metric: "4,200+", metricLabel: "keystrokes/session" },
  { icon: "shield", title: "Integrity Scoring", description: "Dynamic scores based on actual writing behavior. No more false positives from probabilistic detection.", color: "from-green-500 to-emerald-500", bg: "bg-green-50", metric: "99.2%", metricLabel: "accuracy rate" },
  { icon: "pen", title: "Regulated AI Tools", description: "Students use AI within institution-defined boundaries. Usage is logged, categorized, and fully transparent.", color: "from-purple-500 to-violet-500", bg: "bg-purple-50", metric: "8", metricLabel: "AI categories" },
  { icon: "chart", title: "Analytics Dashboard", description: "Comprehensive analytics for professors: writing patterns, session data, and behavioral insights.", color: "from-orange-500 to-amber-500", bg: "bg-orange-50", metric: "27+", metricLabel: "data points" },
  { icon: "globe", title: "Multi-Language Support", description: "Deploy across departments worldwide. Support for English, French, Spanish, German, and more.", color: "from-teal-500 to-cyan-500", bg: "bg-teal-50", metric: "12", metricLabel: "languages" },
  { icon: "lock", title: "Privacy-First Design", description: "Encrypted, anonymized, GDPR & FERPA compliant. Your students' data stays yours.", color: "from-red-500 to-rose-500", bg: "bg-red-50", metric: "SOC 2", metricLabel: "certified" },
];

const comparisons = [
  { feature: "Approach", old: "Post-submission detection", neu: "Real-time process monitoring" },
  { feature: "AI Policy", old: "Binary flag (AI or not)", neu: "Transparent, regulated usage" },
  { feature: "False Positives", old: "High rate — students accused unfairly", neu: "Zero false accusations — behavioral analysis" },
  { feature: "Student Experience", old: "Fear, anxiety, and distrust", neu: "Confidence, transparency, and empowerment" },
  { feature: "Learning Value", old: "Punitive after the fact", neu: "Formative throughout the process" },
  { feature: "Professor Insight", old: "Similarity % only", neu: "Full writing process playback + analytics" },
];

const impactMetrics = [
  { value: "73%", label: "Reduction in misconduct cases", icon: "down" },
  { value: "94%", label: "Average student integrity score", icon: "shield" },
  { value: "3.2x", label: "More advisor-student interactions", icon: "people" },
  { value: "0", label: "False accusations since launch", icon: "check" },
];

/* ===== Icons ===== */
function FeatureIcon({ name, className = "w-6 h-6" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    eye: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    shield: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    pen: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
    chart: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
    globe: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
    lock: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  };
  return <>{icons[name]}</>;
}

/* ===== MAIN PAGE ===== */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const scrollProgress = useScrollProgress();
  const parallaxOffset = useParallax(0.15);
  const mouse = useMousePosition();

  useEffect(() => {
    const timer = setInterval(() => setActiveTestimonial((p) => (p + 1) % testimonials.length), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 h-0.5 bg-gradient-to-r from-brand-500 to-accent-500 z-[60] transition-all duration-150" style={{ width: `${scrollProgress}%` }} />

      {/* Navigation */}
      <nav className="fixed top-0.5 w-full bg-white/80 backdrop-blur-xl z-50 border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-brand-600/20">
                <FeatureIcon name="shield" className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Thesisfy<span className="text-brand-600">.edu</span></span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Features</a>
              <a href="#impact" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Impact</a>
              <a href="#testimonials" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Testimonials</a>
              <a href="#offer" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">For Institutions</a>
              <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors">Sign In</Link>
              <Link href="/login" className="btn-primary text-sm !py-2 !px-5 !rounded-full">Get Started</Link>
            </div>
            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              )}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            {["Features", "Impact", "Testimonials", "For Institutions"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-").replace("for-", "")}`} className="block text-sm font-medium text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>{item}</a>
            ))}
            <Link href="/login" className="btn-primary text-sm w-full text-center">Get Started</Link>
          </div>
        )}
      </nav>

      {/* ===== HERO ===== */}
      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 relative min-h-[90vh] flex items-center">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 -left-20 w-[500px] h-[500px] bg-brand-100/40 rounded-full blur-3xl animate-float-slow" style={{ transform: `translateY(${parallaxOffset * 0.5}px)` }} />
          <div className="absolute top-40 -right-20 w-[600px] h-[600px] bg-accent-100/30 rounded-full blur-3xl animate-float-slower" style={{ transform: `translateY(${parallaxOffset * 0.3}px)` }} />
          <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-purple-100/20 rounded-full blur-3xl animate-float-slow" />
          {/* Mouse-following glow */}
          <div className="hidden lg:block absolute w-[300px] h-[300px] rounded-full bg-brand-200/10 blur-3xl transition-all duration-1000 ease-out" style={{ left: mouse.x - 150, top: mouse.y - 150 }} />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, #4c6ef5 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        <div className="max-w-7xl mx-auto relative w-full">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur border border-brand-100 rounded-full text-brand-700 text-sm font-medium mb-8 animate-fade-in shadow-sm">
              <FeatureIcon name="shield" className="w-4 h-4" />
              The Anti-Turnitin for the AI Era
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-extrabold tracking-tight mb-6 animate-slide-up leading-[1.1]">
              Academic Integrity
              <br />
              Through{" "}
              <span className="gradient-text relative inline-block">
                AI Regulation
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none"><path d="M2 8c50-6 100-6 148-2s100 4 148-2" stroke="url(#hgrad)" strokeWidth="3" strokeLinecap="round" /><defs><linearGradient id="hgrad" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#4c6ef5" /><stop offset="1" stopColor="#20c997" /></linearGradient></defs></svg>
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
              Stop punishing students for using AI. Start empowering them to use it responsibly.
              Monitor the <strong className="text-gray-800">writing process</strong>, not just the output.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <Link href="/login" className="btn-primary text-base !px-8 !py-4 !rounded-full w-full sm:w-auto group shadow-xl shadow-brand-600/20">
                Request Free Access
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
              <a href="#comparison" className="btn-outline text-base !px-8 !py-4 !rounded-full w-full sm:w-auto">
                See How We Compare
              </a>
            </div>

            {/* Social proof */}
            <div className="flex items-center justify-center gap-3 mt-10 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <div className="flex -space-x-3">
                {testimonials.slice(0, 5).map((t, i) => (
                  <div key={i} className={`w-9 h-9 ${t.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm`}>{t.initials}</div>
                ))}
              </div>
              <div className="text-left">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Trusted by <strong className="text-gray-700">12,000+</strong> students & professors</p>
              </div>
            </div>
          </div>

          {/* Hero visual */}
          <Reveal delay={400} className="mt-16">
            <TiltCard className="max-w-5xl mx-auto">
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-50/30 to-accent-50/20 pointer-events-none" />
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 relative">
                  <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-400" /></div>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 px-4 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-400 w-72">
                      <FeatureIcon name="lock" className="w-3 h-3" />thesisfy.edu/editor
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3">
                  <div className="lg:col-span-2 p-6 sm:p-8 border-r border-gray-100 relative">
                    <div className="flex items-center gap-2 pb-4 mb-4 border-b border-gray-100">
                      <div className="flex gap-1">
                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-500">B</div>
                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs italic text-gray-500">I</div>
                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs underline text-gray-500">U</div>
                      </div>
                      <div className="w-px h-4 bg-gray-200" />
                      <div className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500">Heading 1</div>
                      <div className="flex-1" />
                      <span className="flex items-center gap-1 text-xs text-green-600"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Auto-saving</span>
                    </div>
                    <h3 className="text-xl font-serif font-bold text-gray-800 mb-3">Machine Learning Applications in Climate Change Prediction</h3>
                    <TypingAnimation />
                    <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />Session active</span>
                      <span>2,847 words</span>
                      <span className="text-blue-500 font-medium">Integrity: 94%</span>
                    </div>
                  </div>
                  <div className="p-6 bg-gray-50 hidden lg:flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-rose-400 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">SC</div>
                      <div><div className="font-semibold text-sm">Sarah Chen</div><div className="text-xs text-gray-500">PhD, Stanford</div></div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                      <div className="text-xs text-gray-500 mb-1">Integrity Score</div>
                      <div className="text-3xl font-bold text-green-600">94%</div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mt-2"><div className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full" style={{ width: "94%" }} /></div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                      <div className="text-xs text-gray-500 mb-1">Writing Sessions</div>
                      <div className="flex items-end gap-0.5 h-10 mt-1">
                        {[40, 65, 30, 80, 55, 90, 70].map((h, i) => (
                          <div key={i} className="flex-1 bg-gradient-to-t from-brand-500 to-brand-400 rounded-sm animate-grow-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ===== UNIVERSITY LOGOS ===== */}
      <section className="py-10 px-4 border-y border-gray-100 bg-gray-50/50 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-xs font-medium text-gray-400 mb-6 uppercase tracking-widest">Trusted by leading universities worldwide</p>
          <div className="relative">
            <div className="flex gap-12 items-center justify-center flex-wrap">
              {universities.map((uni, i) => (
                <Reveal key={uni.name} delay={i * 80} direction="scale">
                  <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-default">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shadow-sm" style={{ backgroundColor: uni.color }}>
                      {uni.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{uni.name}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 rounded-full text-brand-600 text-xs font-semibold mb-4 uppercase tracking-widest">Platform Capabilities</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything You Need for <span className="gradient-text">Academic Integrity</span></h2>
              <p className="text-gray-600 max-w-2xl mx-auto">A complete platform that transforms how universities approach AI in academic writing.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 100}>
                <TiltCard>
                  <div className="card p-6 h-full group cursor-default">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 ${feature.bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <FeatureIcon name={feature.icon} className="w-6 h-6 text-gray-700" />
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold gradient-text">{feature.metric}</div>
                        <div className="text-[10px] text-gray-400">{feature.metricLabel}</div>
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                    <div className={`h-0.5 w-0 group-hover:w-full bg-gradient-to-r ${feature.color} mt-4 transition-all duration-500 rounded-full`} />
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== IMPACT METRICS ===== */}
      <section id="impact" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-900 via-gray-900 to-brand-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-500/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-brand-300 text-xs font-semibold mb-4 uppercase tracking-widest">Measurable Impact</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Real Results, <span className="text-accent-400">Not Promises</span></h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Data from our partner institutions after one year of using Thesisfy.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactMetrics.map((metric, i) => (
              <Reveal key={metric.label} delay={i * 150} direction="scale">
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center hover:bg-white/10 transition-all duration-300 group">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-400/20 to-accent-400/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    {metric.icon === "down" && <svg className="w-7 h-7 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>}
                    {metric.icon === "shield" && <FeatureIcon name="shield" className="w-7 h-7 text-brand-400" />}
                    {metric.icon === "people" && <svg className="w-7 h-7 text-accent-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
                    {metric.icon === "check" && <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
                  </div>
                  <div className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">{metric.value}</div>
                  <div className="text-sm text-gray-400">{metric.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section id="comparison" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 rounded-full text-red-600 text-xs font-semibold mb-4 uppercase tracking-widest">Why Switch</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">The Old Way vs <span className="gradient-text">The Thesisfy Way</span></h2>
              <p className="text-gray-600 max-w-2xl mx-auto">The old approach punishes. The new approach empowers.</p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 gap-4">
                {comparisons.map((row, i) => (
                  <div key={row.feature} className="grid grid-cols-[120px_1fr_1fr] sm:grid-cols-[160px_1fr_1fr] items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="text-sm font-semibold text-gray-900">{row.feature}</div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <svg className="w-4 h-4 text-red-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      <span className="line-through decoration-red-200">{row.old}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-brand-700 font-medium">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      {row.neu}
                    </div>
                    {i < comparisons.length - 1 && <div className="col-span-3 h-px bg-gray-100 mt-2" />}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full text-amber-600 text-xs font-semibold mb-4 uppercase tracking-widest">Testimonials</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Loved by <span className="gradient-text">Students</span> and <span className="gradient-text">Professors</span></h2>
            </div>
          </Reveal>

          {/* Featured */}
          <Reveal delay={100}>
            <div className="max-w-4xl mx-auto mb-12">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10 relative overflow-hidden" key={activeTestimonial}>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <div className={`w-16 h-16 ${testimonials[activeTestimonial].gradient} rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg flex-shrink-0`}>{testimonials[activeTestimonial].initials}</div>
                  <div className="flex-1">
                    <div className="flex gap-0.5 mb-3">{[...Array(5)].map((_, i) => <svg key={i} className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>)}</div>
                    <blockquote className="text-lg text-gray-700 leading-relaxed mb-4 italic">&ldquo;{testimonials[activeTestimonial].quote}&rdquo;</blockquote>
                    <div>
                      <div className="font-semibold text-gray-900">{testimonials[activeTestimonial].name}</div>
                      <div className="text-sm text-gray-500">{testimonials[activeTestimonial].role} &middot; {testimonials[activeTestimonial].university}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 mt-6">
                  {testimonials.map((_, i) => (
                    <button key={i} onClick={() => setActiveTestimonial(i)} className={`transition-all duration-300 rounded-full ${i === activeTestimonial ? "w-8 h-2 bg-brand-500" : "w-2 h-2 bg-gray-300 hover:bg-gray-400"}`} />
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className={`bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-default ${i === activeTestimonial ? "ring-2 ring-brand-500/20 border-brand-200" : ""}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 ${t.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm`}>{t.initials}</div>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-gray-400">{t.university}</div>
                    </div>
                    <div className="ml-auto">
                      {t.role.includes("Prof") || t.role.includes("Dean") ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-full text-[10px] font-medium text-blue-700">Faculty</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full text-[10px] font-medium text-green-700">Student</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">&ldquo;{t.quote}&rdquo;</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full text-green-600 text-xs font-semibold mb-4 uppercase tracking-widest">How It Works</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Three Simple Steps</h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Students Write", desc: "Students write in our Google Docs-like editor with full formatting tools. Every action is transparently logged.", avatars: [{ i: "SC", g: "bg-gradient-to-br from-rose-400 to-pink-600" }, { i: "JL", g: "bg-gradient-to-br from-cyan-400 to-blue-600" }] },
              { step: "02", title: "AI Assists, Regulated", desc: "AI helps with brainstorming, structure, and grammar — but never writes for them. Institutional policies enforced.", avatars: [{ i: "AO", g: "bg-gradient-to-br from-emerald-400 to-teal-600" }] },
              { step: "03", title: "Professors Verify", desc: "Advisors see the full writing journey: playback, AI usage, behavioral patterns, and integrity scores.", avatars: [{ i: "MW", g: "bg-gradient-to-br from-blue-400 to-indigo-600" }, { i: "ER", g: "bg-gradient-to-br from-amber-400 to-orange-600" }] },
            ].map((item, i) => (
              <Reveal key={item.step} delay={i * 150}>
                <div className="text-center group">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center mx-auto mb-6 group-hover:-translate-y-2 group-hover:shadow-xl transition-all duration-300">
                    <span className="text-2xl font-extrabold gradient-text">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm mb-4">{item.desc}</p>
                  <div className="flex justify-center -space-x-2">
                    {item.avatars.map((a, j) => (
                      <div key={j} className={`w-7 h-7 ${a.g} rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white`}>{a.i}</div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INSTITUTIONAL OFFER (replaces pricing) ===== */}
      <section id="offer" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-brand-50 via-white to-accent-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "radial-gradient(circle, #4c6ef5 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <div className="max-w-5xl mx-auto relative">
          <Reveal>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent-50 border border-accent-200 rounded-full text-accent-700 text-sm font-semibold mb-6 shadow-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                Limited Time Offer for Institutions
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold mb-6">
                <span className="gradient-text">Free for 1 Year</span>
                <br />
                For Your Entire Institution
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                We believe in our product. That&apos;s why we&apos;re offering <strong className="text-gray-800">full, unrestricted access</strong> for one year — no strings attached. See the results before you commit.
              </p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Gradient top bar */}
              <div className="h-2 bg-gradient-to-r from-brand-500 via-accent-500 to-brand-500" />

              <div className="p-8 sm:p-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {/* Left: What's included */}
                  <div>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <svg className="w-5 h-5 text-accent-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      Everything Included
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        "Unlimited theses & students",
                        "Full analytics dashboard",
                        "Writing process playback",
                        "Regulated AI assistant",
                        "Integrity scoring engine",
                        "Professor monitoring tools",
                        "Custom AI policies",
                        "Paste & plagiarism detection",
                        "Citation management tools",
                        "SSO integration",
                        "Priority support",
                        "Data export & API access",
                      ].map((feature) => (
                        <div key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                          <svg className="w-4 h-4 text-accent-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: CTA */}
                  <div className="flex flex-col items-center justify-center text-center bg-gradient-to-br from-brand-50 to-accent-50 rounded-2xl p-8">
                    <div className="text-6xl font-extrabold gradient-text mb-2">$0</div>
                    <div className="text-gray-500 mb-1">for 12 months</div>
                    <div className="text-xs text-gray-400 mb-6">No credit card. No hidden fees. Cancel anytime.</div>

                    <Link href="/login" className="btn-primary w-full !py-4 !text-base !rounded-full group shadow-xl shadow-brand-600/20 mb-4">
                      Request Institutional Access
                      <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </Link>

                    <p className="text-xs text-gray-400">
                      Or email us at <strong className="text-gray-600">partnerships@thesisfy.edu</strong>
                    </p>

                    <div className="flex items-center gap-4 mt-6 pt-6 border-t border-gray-200 w-full justify-center">
                      {["GDPR", "FERPA", "SOC 2"].map((badge) => (
                        <div key={badge} className="flex items-center gap-1 text-xs text-gray-400">
                          <FeatureIcon name="shield" className="w-3 h-3" />
                          {badge}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Guarantee bar */}
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Full feature access from day one
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Dedicated onboarding support
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    No obligation to continue
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Reveal>
            <div className="bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 rounded-3xl p-12 sm:p-16 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10"><div className="absolute top-4 left-10 w-20 h-20 border-2 border-white rounded-full" /><div className="absolute bottom-8 right-14 w-32 h-32 border-2 border-white rounded-full" /><div className="absolute top-1/2 left-1/3 w-12 h-12 border-2 border-white rounded-full" /></div>
              {/* Floating avatars */}
              <div className="absolute top-6 right-20 hidden sm:block"><div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/30 shadow-lg animate-float-slow">MW</div></div>
              <div className="absolute bottom-8 left-12 hidden sm:block"><div className="w-8 h-8 bg-gradient-to-br from-rose-400 to-pink-600 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/30 shadow-lg animate-float-slower">SC</div></div>
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to Transform Academic Integrity?</h2>
                <p className="text-brand-100 mb-8 max-w-xl mx-auto">Join 50+ universities already using Thesisfy. Your first year is completely free.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/login" className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-brand-700 bg-white rounded-full hover:bg-brand-50 transition-all shadow-lg group">
                    Get Started for Free
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                  </Link>
                  <a href="#comparison" className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white border-2 border-white/30 rounded-full hover:bg-white/10 transition-all">Watch Demo</a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center shadow-sm"><FeatureIcon name="shield" className="w-5 h-5 text-white" /></div>
                <span className="text-lg font-bold">Thesisfy<span className="text-brand-600">.edu</span></span>
              </div>
              <p className="text-sm text-gray-500 mb-4">Academic integrity through AI regulation, not detection.</p>
              <div className="flex -space-x-2">
                {testimonials.slice(0, 4).map((t, i) => <div key={i} className={`w-7 h-7 ${t.gradient} rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white`}>{t.initials}</div>)}
                <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-[9px] font-bold ring-2 ring-white">+12k</div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#features" className="hover:text-brand-600 transition-colors">Features</a></li>
                <li><a href="#impact" className="hover:text-brand-600 transition-colors">Impact</a></li>
                <li><a href="#comparison" className="hover:text-brand-600 transition-colors">Compare</a></li>
                <li><a href="#testimonials" className="hover:text-brand-600 transition-colors">Testimonials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-brand-600 transition-colors">About</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-brand-600 transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">GDPR</a></li>
                <li><a href="#" className="hover:text-brand-600 transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">&copy; {new Date().getFullYear()} Thesisfy.edu. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
