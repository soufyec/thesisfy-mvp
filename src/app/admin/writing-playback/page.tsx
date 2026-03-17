"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


interface Thesis {
  id: string;
  title: string;
  studentId: string;
  status: string;
}

interface WritingSnapshot {
  id: string;
  thesisId: string;
  sessionId: string;
  timestamp: string;
  action: "typed" | "pasted" | "deleted" | "ai_insert";
  position: number;
  content: string;
  wordCount: number;
  metadata?: {
    pasteSize?: number;
    pasteModified?: boolean;
    deletedText?: string;
    sourceHint?: string;
  };
}

const actionColors: Record<string, { bg: string; text: string; label: string }> = {
  typed: { bg: "bg-green-100", text: "text-green-700", label: "Typed" },
  pasted: { bg: "bg-purple-100", text: "text-purple-700", label: "Pasted" },
  deleted: { bg: "bg-red-100", text: "text-red-700", label: "Deleted" },
  ai_insert: { bg: "bg-blue-100", text: "text-blue-700", label: "AI Insert" },
};

export default function WritingPlaybackPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [selectedThesisId, setSelectedThesisId] = useState("");
  const [snapshots, setSnapshots] = useState<WritingSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch theses list
  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        if (data.theses) setTheses(data.theses);
      })
      .catch(() => {});
  }, []);

  // Fetch snapshots when thesis changes
  useEffect(() => {
    if (!selectedThesisId) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    setCurrentIndex(-1);
    setPlaying(false);
    fetch(`/api/writing-playback?thesisId=${selectedThesisId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.snapshots) {
          const sorted = [...data.snapshots].sort(
            (a: WritingSnapshot, b: WritingSnapshot) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setSnapshots(sorted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedThesisId]);

  // Playback logic
  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startPlayback = useCallback(() => {
    if (snapshots.length === 0) return;
    setPlaying(true);
    setCurrentIndex((prev) => (prev < 0 ? 0 : prev >= snapshots.length - 1 ? 0 : prev));
  }, [snapshots.length]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= snapshots.length) {
          stopPlayback();
          return snapshots.length - 1;
        }
        return next;
      });
    }, 1500 / speed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, speed, snapshots.length, stopPlayback]);

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  // Group snapshots by session
  const sessionGroups: Record<string, WritingSnapshot[]> = {};
  snapshots.forEach((s) => {
    if (!sessionGroups[s.sessionId]) sessionGroups[s.sessionId] = [];
    sessionGroups[s.sessionId].push(s);
  });

  const progressPercent = snapshots.length > 0 ? ((currentIndex + 1) / snapshots.length) * 100 : 0;

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Writing Process Playback</h1>
          <p className="text-gray-500 mt-1">Replay the writing process of a thesis step by step.</p>
        </div>

        {/* Thesis Selector */}
        <div className="card p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Thesis</label>
          <select
            value={selectedThesisId}
            onChange={(e) => setSelectedThesisId(e.target.value)}
            className="input-field"
          >
            <option value="">-- Choose a thesis --</option>
            {theses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="card p-10 text-center text-gray-500">Loading snapshots...</div>
        )}

        {!loading && selectedThesisId && snapshots.length === 0 && (
          <div className="card p-10 text-center text-gray-500">No writing snapshots found for this thesis.</div>
        )}

        {!loading && snapshots.length > 0 && (
          <>
            {/* Playback Controls */}
            <div className="card p-5 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <button onClick={togglePlay} className="btn-primary flex items-center gap-2">
                  {playing ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                  {playing ? "Pause" : "Play"}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Speed:</span>
                  {[1, 2, 5, 10].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                        speed === s
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <span className="text-sm text-gray-500 ml-auto">
                  {currentIndex + 1} / {snapshots.length} snapshots
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const idx = Math.round(pct * (snapshots.length - 1));
                    setCurrentIndex(Math.max(0, Math.min(idx, snapshots.length - 1)));
                  }}
                >
                  <div
                    className="h-full bg-brand-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Timeline by Session */}
            <div className="space-y-6">
              {Object.entries(sessionGroups).map(([sessionId, sessionSnapshots]) => (
                <div key={sessionId} className="card">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">Session: {sessionId}</span>
                      <span className="badge-info">{sessionSnapshots.length} snapshots</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {sessionSnapshots.map((snap) => {
                      const globalIdx = snapshots.indexOf(snap);
                      const isActive = globalIdx === currentIndex;
                      const colors = actionColors[snap.action];
                      return (
                        <div
                          key={snap.id}
                          className={`p-4 transition-all duration-300 cursor-pointer ${
                            isActive ? "bg-brand-50 ring-2 ring-brand-300 ring-inset" : "hover:bg-gray-50"
                          }`}
                          onClick={() => setCurrentIndex(globalIdx)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Timeline dot */}
                            <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
                              isActive ? "bg-brand-600 ring-4 ring-brand-200" : "bg-gray-300"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                                  {colors.label}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(snap.timestamp).toLocaleString()}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {snap.wordCount} words
                                </span>
                              </div>
                              {/* Content preview */}
                              <div className={`text-sm transition-all duration-300 ${
                                isActive ? "max-h-40" : "max-h-6 overflow-hidden"
                              }`}>
                                {snap.action === "deleted" ? (
                                  <span className="text-red-500 italic">
                                    Deleted: {snap.metadata?.deletedText || "(content removed)"}
                                  </span>
                                ) : (
                                  <span className="text-gray-700">{snap.content}</span>
                                )}
                              </div>
                              {/* Metadata */}
                              {isActive && snap.metadata?.sourceHint && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Source: {snap.metadata.sourceHint}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
