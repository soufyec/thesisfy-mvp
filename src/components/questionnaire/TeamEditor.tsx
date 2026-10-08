"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { ItemType } from "@/lib/questionnaire";

const TEAM_NAME_KEY = "team_name";

export function useTeamName(): [string, (v: string) => void] {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem(TEAM_NAME_KEY) || "");
    } catch {}
  }, []);
  return [
    name,
    (v: string) => {
      setName(v);
      try {
        localStorage.setItem(TEAM_NAME_KEY, v);
      } catch {}
    },
  ];
}

export type AddRequest = { kind: "item"; sectionId: string; targetKey?: string } | { kind: "phrasing"; sectionId: string; targetKey: string; questionTitle: string };

interface Props {
  request: AddRequest | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPES: ItemType[] = ["mc", "cb", "scale", "text", "para"];

/** Dialog the team uses to add a question to a section or an alternative phrasing to a question. */
export default function TeamEditor({ request, onClose, onSaved }: Props) {
  const t = useT();
  const [author, setAuthor] = useTeamName();
  const [type, setType] = useState<ItemType>("mc");
  const [title, setTitle] = useState("");
  const [help, setHelp] = useState("");
  const [choices, setChoices] = useState("");
  const [other, setOther] = useState(false);
  const [max, setMax] = useState("");
  const [min, setMin] = useState("1");
  const [maxScale, setMaxScale] = useState("5");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [req, setReq] = useState(false);
  const [interviewerOnly, setInterviewerOnly] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!request) return;
    setType("mc");
    setTitle("");
    setHelp("");
    setChoices("");
    setOther(false);
    setMax("");
    setMin("1");
    setMaxScale("5");
    setLow("");
    setHigh("");
    setReq(false);
    setInterviewerOnly(false);
    setText("");
    setError("");
  }, [request]);

  if (!request) return null;

  const submit = async () => {
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = { kind: request.kind, sectionId: request.sectionId, targetKey: request.targetKey, author: author.trim() || undefined };
    if (request.kind === "item") {
      body.item = {
        type,
        title,
        help,
        req,
        interviewerOnly,
        choices: choices.split("\n").map((c) => c.trim()).filter(Boolean),
        other,
        max: type === "cb" ? Number(max) || undefined : type === "scale" ? Number(maxScale) : undefined,
        min: type === "scale" ? Number(min) : undefined,
        low,
        high,
      };
    } else {
      body.text = text;
    }
    try {
      const res = await fetch("/api/questionnaire/edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      onSaved();
      onClose();
    } catch {
      setError(t("q.team.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const canSave = request.kind === "phrasing" ? text.trim().length >= 3 : title.trim().length >= 3 && (!(type === "mc" || type === "cb") || choices.split("\n").filter((c) => c.trim()).length >= 2);
  const label = "block text-[13px] font-medium text-gray-700 mb-1";

  return (
    <Modal
      open
      onClose={onClose}
      title={request.kind === "item" ? t("q.team.addQuestion") : t("q.team.addPhrasing")}
      footer={
        <>
          <button type="button" className="btn-outline !py-2 !px-4" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn-primary !py-2 !px-4" disabled={!canSave || saving} onClick={submit}>
            {saving ? t("common.saving") : t("q.team.save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="team-author">
            {t("q.team.name")}
          </label>
          <input id="team-author" className="input-field !py-2" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60} />
          <p className="text-[12px] text-gray-500 mt-1">{t("q.team.nameHelp")}</p>
        </div>

        {request.kind === "phrasing" ? (
          <div>
            <p className="text-[13px] text-gray-500 mb-2">{request.questionTitle}</p>
            <label className={label} htmlFor="team-phrasing">
              {t("q.team.phrasingText")}
            </label>
            <textarea id="team-phrasing" className="input-field min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
            <p className="text-[12px] text-gray-500 mt-1">{t("q.team.phrasingHelp")}</p>
          </div>
        ) : (
          <>
            <div>
              <label className={label} htmlFor="team-type">
                {t("q.team.type")}
              </label>
              <select id="team-type" className="input-field !py-2" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`q.team.type.${ty}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="team-title">
                {t("q.team.title")}
              </label>
              <textarea id="team-title" className="input-field min-h-[70px]" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={400} />
            </div>
            <div>
              <label className={label} htmlFor="team-help">
                {t("q.team.help")}
              </label>
              <input id="team-help" className="input-field !py-2" value={help} onChange={(e) => setHelp(e.target.value)} maxLength={600} />
            </div>
            {(type === "mc" || type === "cb") && (
              <>
                <div>
                  <label className={label} htmlFor="team-choices">
                    {t("q.team.choices")}
                  </label>
                  <textarea id="team-choices" className="input-field min-h-[110px]" value={choices} onChange={(e) => setChoices(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-gray-700">
                  <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={other} onChange={(e) => setOther(e.target.checked)} />
                  {t("q.team.other")}
                </label>
                {type === "cb" && (
                  <div>
                    <label className={label} htmlFor="team-max">
                      {t("q.team.max")}
                    </label>
                    <input id="team-max" type="number" min={1} className="input-field !py-2 max-w-[120px]" value={max} onChange={(e) => setMax(e.target.value)} />
                  </div>
                )}
              </>
            )}
            {type === "scale" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="team-min">
                    {t("q.team.min")}
                  </label>
                  <input id="team-min" type="number" min={0} max={9} className="input-field !py-2" value={min} onChange={(e) => setMin(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="team-maxscale">
                    {t("q.team.maxScale")}
                  </label>
                  <input id="team-maxscale" type="number" min={2} max={10} className="input-field !py-2" value={maxScale} onChange={(e) => setMaxScale(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="team-low">
                    {t("q.team.low")}
                  </label>
                  <input id="team-low" className="input-field !py-2" value={low} onChange={(e) => setLow(e.target.value)} maxLength={80} />
                </div>
                <div>
                  <label className={label} htmlFor="team-high">
                    {t("q.team.high")}
                  </label>
                  <input id="team-high" className="input-field !py-2" value={high} onChange={(e) => setHigh(e.target.value)} maxLength={80} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[13px] text-gray-700">
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={req} onChange={(e) => setReq(e.target.checked)} />
                {t("q.team.req")}
              </label>
              <label className="flex items-center gap-2 text-[13px] text-gray-700">
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={interviewerOnly} onChange={(e) => setInterviewerOnly(e.target.checked)} />
                {t("q.team.interviewerOnly")}
              </label>
            </div>
          </>
        )}
        {error && <p className="text-[13px] text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
