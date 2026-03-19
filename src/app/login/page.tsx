"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const personas = [
  {
    type: "student" as const,
    name: "Jane Cooper",
    role: "PhD Student, Computer Science",
    university: "Stanford University",
    initials: "JC",
    gradient: "bg-gradient-to-br from-rose-400 to-pink-600",
    quote: "Thesisfy gives me confidence that my work speaks for itself.",
    stats: { theses: 2, integrity: "94%", words: "18.5k" },
  },
  {
    type: "professor" as const,
    name: "Prof. James Williams",
    role: "Department Head, CS",
    university: "Stanford University",
    initials: "JW",
    gradient: "bg-gradient-to-br from-blue-400 to-indigo-600",
    quote: "I can finally mentor students through the writing process, not just judge the output.",
    stats: { students: 12, theses: 18, avgIntegrity: "92%" },
  },
  {
    type: "admin" as const,
    name: "Dr. Sarah Mitchell",
    role: "Academic Integrity Officer",
    university: "Stanford University",
    initials: "SM",
    gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
    quote: "Misconduct cases dropped 73% since we adopted Thesisfy.",
    stats: { departments: 5, students: 340, accuracy: "99.2%" },
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activePersona, setActivePersona] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Rotate personas
  useEffect(() => {
    const timer = setInterval(() => {
      setActivePersona((prev) => (prev + 1) % personas.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user.role === "admin" || data.user.role === "professor") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const fillDemo = (type: "student" | "admin" | "professor") => {
    const creds = {
      student: { email: "jane.cooper@stanford.edu", password: "demo123" },
      admin: { email: "admin@stanford.edu", password: "admin123" },
      professor: { email: "prof.williams@stanford.edu", password: "demo123" },
    };
    setEmail(creds[type].email);
    setPassword(creds[type].password);
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const { auth, googleProvider } = await import("@/lib/firebase");
      const { signInWithPopup } = await import("firebase/auth");

      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Exchange Firebase token for session
      const res = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Google sign-in failed");
        setGoogleLoading(false);
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user.role === "admin" || data.user.role === "professor") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Google sign-in failed";
      if (!errorMessage.includes("popup-closed-by-user")) {
        setError("Google sign-in failed. Make sure Firebase is configured.");
      }
      setGoogleLoading(false);
    }
  };

  const currentPersona = personas[activePersona];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left side - Dynamic Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-accent-500/10 rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">Thesisfy.edu</span>
          </Link>
        </div>

        {/* Persona showcase */}
        <div className="relative">
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">
              Write with integrity.
              <br />
              Graduate with confidence.
            </h2>
          </div>

          {/* Animated persona card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 animate-fade-in" key={activePersona}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 ${currentPersona.gradient} rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg ring-2 ring-white/30`}>
                {currentPersona.initials}
              </div>
              <div>
                <div className="text-white font-semibold text-lg">{currentPersona.name}</div>
                <div className="text-brand-200 text-sm">{currentPersona.role}</div>
                <div className="text-brand-300 text-xs">{currentPersona.university}</div>
              </div>
            </div>

            <blockquote className="text-white/90 italic text-base leading-relaxed mb-4">
              &ldquo;{currentPersona.quote}&rdquo;
            </blockquote>

            {/* Stats */}
            <div className="flex gap-4">
              {currentPersona.type === "student" && (
                <>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.integrity}</div>
                    <div className="text-brand-200 text-xs">Integrity</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.words}</div>
                    <div className="text-brand-200 text-xs">Words</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.theses}</div>
                    <div className="text-brand-200 text-xs">Theses</div>
                  </div>
                </>
              )}
              {currentPersona.type === "professor" && (
                <>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.students}</div>
                    <div className="text-brand-200 text-xs">Students</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.theses}</div>
                    <div className="text-brand-200 text-xs">Theses</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.avgIntegrity}</div>
                    <div className="text-brand-200 text-xs">Avg Integrity</div>
                  </div>
                </>
              )}
              {currentPersona.type === "admin" && (
                <>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.departments}</div>
                    <div className="text-brand-200 text-xs">Depts</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.students}</div>
                    <div className="text-brand-200 text-xs">Students</div>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2 text-center flex-1">
                    <div className="text-white font-bold">{currentPersona.stats.accuracy}</div>
                    <div className="text-brand-200 text-xs">Accuracy</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Persona dots */}
          <div className="flex items-center gap-2 mt-4">
            {personas.map((p, i) => (
              <button
                key={i}
                onClick={() => setActivePersona(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === activePersona
                    ? "w-8 h-2 bg-white"
                    : "w-2 h-2 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="flex -space-x-2">
            {personas.map((p, i) => (
              <div
                key={i}
                className={`w-8 h-8 ${p.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-brand-700`}
              >
                {p.initials}
              </div>
            ))}
          </div>
          <span className="text-brand-200 text-sm">
            Trusted by 50+ universities worldwide
          </span>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span className="text-xl font-bold">
                Thesisfy<span className="text-brand-600">.edu</span>
              </span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-gray-500 mb-8">Sign in to continue to your dashboard</p>

          {/* Demo Account Buttons with personas */}
          <div className="mb-6 p-4 bg-brand-50 rounded-xl border border-brand-100">
            <p className="text-xs font-medium text-brand-700 mb-3">Quick Demo Access:</p>
            <div className="space-y-2">
              {[
                {
                  type: "student" as const,
                  label: "Student",
                  name: "Jane Cooper",
                  desc: "PhD Student, Stanford",
                  initials: "JC",
                  gradient: "bg-gradient-to-br from-rose-400 to-pink-600",
                },
                {
                  type: "professor" as const,
                  label: "Professor",
                  name: "Prof. Williams",
                  desc: "Dept Head, Stanford",
                  initials: "JW",
                  gradient: "bg-gradient-to-br from-blue-400 to-indigo-600",
                },
                {
                  type: "admin" as const,
                  label: "Admin",
                  name: "Dr. Mitchell",
                  desc: "Integrity Officer",
                  initials: "SM",
                  gradient: "bg-gradient-to-br from-amber-400 to-orange-600",
                },
              ].map((demo) => (
                <button
                  key={demo.type}
                  onClick={() => fillDemo(demo.type)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg hover:bg-brand-50 transition-colors border border-brand-100 hover:border-brand-300 group"
                >
                  <div className={`w-9 h-9 ${demo.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                    {demo.initials}
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-gray-800 group-hover:text-brand-700">
                      {demo.name}
                    </div>
                    <div className="text-xs text-gray-500">{demo.desc}</div>
                  </div>
                  <div className="px-2 py-0.5 bg-brand-50 rounded text-[10px] font-semibold text-brand-600 uppercase">
                    {demo.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@university.edu"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-50 px-3 text-gray-400">or continue with</span>
              </div>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {googleLoading ? (
                <svg className="w-5 h-5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              {googleLoading ? "Signing in..." : "Sign in with Google"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <a href="#" className="text-brand-600 hover:text-brand-700 font-medium">
              Contact your university
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
