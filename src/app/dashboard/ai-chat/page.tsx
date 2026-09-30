"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AssistantPanel from "@/components/ai/AssistantPanel";
import ConsentModal from "@/components/ConsentModal";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";

export default function AIChatPage() {
  const { me, refresh } = useUser();
  const [theses, setTheses] = useState<{ id: string; title: string }[]>([]);
  const [thesisId, setThesisId] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    api<{ theses: { id: string; title: string; status: string }[] }>("/api/theses").then((d) => {
      setTheses(d.theses);
      const active = d.theses.find((t) => t.status === "in_progress") || d.theses[0];
      if (active) setThesisId(active.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (me && me.policy.requireConsent && !me.consent && me.user.role === "student") setConsentOpen(true);
  }, [me]);

  return (
    <DashboardLayout fullBleed>
      <div className="h-[calc(100dvh-3.5rem-4.5rem)] lg:h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
          <div className="text-sm font-semibold">AI Assistant</div>
          <select value={thesisId || ""} onChange={(e) => setThesisId(e.target.value || undefined)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 max-w-[60vw]">
            <option value="">No thesis context</option>
            {theses.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <span className="text-[11px] text-gray-400 hidden sm:inline">Context helps the assistant respect your citation style, word budget and AI limit.</span>
        </div>
        <div className="flex-1 min-h-0">
          <AssistantPanel key={thesisId || "none"} thesisId={thesisId} variant="page" onConsentRequired={() => setConsentOpen(true)} />
        </div>
      </div>
      {me && <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} policy={me.policy} existing={me.consent} onGranted={() => refresh()} />}
    </DashboardLayout>
  );
}
