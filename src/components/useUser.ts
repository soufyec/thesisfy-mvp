"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "student" | "professor" | "admin";
  university: string;
  avatar?: string;
  preferences: { language: "en" | "es" | "fr"; defaultProvider?: string; editorFont: string; editorZoom: number };
}

export interface ConsentScopes {
  keystrokes: boolean;
  paste: boolean;
  aiInteractions: boolean;
  tabActivity: boolean;
  extensionActivity: boolean;
  extensionPromptText: boolean;
}

export interface Consent {
  id: string;
  version: string;
  scopes: ConsentScopes;
  grantedAt: string;
  revokedAt?: string;
}

export interface Policy {
  university: string;
  maxAiUsagePercent: number;
  allowBYOK: boolean;
  allowedProviders: string[];
  allowExternalAi: boolean;
  allowedModes: string[];
  blockGeneration: boolean;
  researchCopilot: boolean;
  flagSensitivity: "low" | "medium" | "high";
  requireConsent: boolean;
  monitoring: { keystrokes: boolean; paste: boolean; aiInteractions: boolean; tabActivity: boolean; extension: boolean };
  updatedAt: string;
}

export interface MeResponse {
  user: SessionUser;
  unreadNotifications: number;
  consent: Consent | null;
  policy: Policy;
  connections: { id: string; provider: string; label: string; status: string; model?: string }[];
}

let cache: MeResponse | null = null;
const listeners = new Set<(m: MeResponse | null) => void>();

export function setMeCache(m: MeResponse | null) {
  cache = m;
  listeners.forEach((l) => l(m));
}

export function useUser() {
  const [me, setMe] = useState<MeResponse | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>("/api/auth/me");
      setMeCache(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setMeCache(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listeners.add(setMe);
    if (!cache) refresh();
    return () => {
      listeners.delete(setMe);
    };
  }, [refresh]);

  return { me, user: me?.user || null, policy: me?.policy || null, consent: me?.consent || null, loading, error, refresh };
}
