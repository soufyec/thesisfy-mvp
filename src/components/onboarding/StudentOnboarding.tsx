"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { TOUR_STEPS, writeOnboardingDone } from "@/lib/onboarding";
import IntroModal from "./IntroModal";
import TourCoachmark from "./TourCoachmark";

export type OnboardingPhase = "off" | "intro" | "tour";

/** Orchestrates the two chained parts (intro modal, then six coachmarks) and persists completion on the device and
 *  on the account. Skipping at any point ends both. */
export default function StudentOnboarding({ phase, onPhase, onEnsureAssistant, onDone, vars }: {
  phase: OnboardingPhase;
  onPhase: (p: OnboardingPhase) => void;
  /** Opens the assistant panel so the "model" step has an anchor. */
  onEnsureAssistant: () => void;
  /** Called once the student finishes or skips: the editor regains focus. */
  onDone: () => void;
  vars: { ai: number; limit: number };
}) {
  const [page, setPage] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => { if (phase === "intro") { setPage(0); setStep(0); } }, [phase]);

  const finish = useCallback(() => {
    writeOnboardingDone();
    api("/api/auth/me", { method: "PATCH", json: { onboarded: true } }).catch(() => { /* the device remembers it anyway */ });
    onPhase("off");
    onDone();
  }, [onPhase, onDone]);

  const goStep = useCallback((n: number) => {
    if (TOUR_STEPS[n]?.key === "model") onEnsureAssistant();
    setStep(n);
  }, [onEnsureAssistant]);

  if (phase === "intro") return <IntroModal page={page} onPage={setPage} onSkip={finish} onFinish={() => { setStep(0); onPhase("tour"); }} vars={vars} />;
  if (phase === "tour") return <TourCoachmark step={step} onStep={goStep} onSkip={finish} onFinish={finish} vars={vars} />;
  return null;
}
