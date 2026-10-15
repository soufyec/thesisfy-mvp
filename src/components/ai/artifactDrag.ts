import type { Artifact } from "@/lib/db";
import type { ArtifactInsertMeta } from "./AssistantPanel";

export const ARTIFACT_DRAG_TYPE = "application/x-thesisfic-artifact";
interface DragRecord { thesisId: string; artifact: Artifact; meta: ArtifactInsertMeta; expires: number }
const active = new Map<string, DragRecord>();

/** The clipboard carries only an opaque token; data, provenance and interaction stay in this page's memory. */
export function beginArtifactDrag(data: DataTransfer, record: Omit<DragRecord, "expires">): string {
  active.clear();
  const token = crypto.randomUUID();
  active.set(token, { ...record, expires: Date.now() + 120_000 });
  data.setData(ARTIFACT_DRAG_TYPE, token);
  data.setData("text/plain", record.artifact.title);
  data.effectAllowed = "copy";
  return token;
}
export function draggedArtifact(data: DataTransfer, thesisId: string): DragRecord | null {
  const value = active.get(data.getData(ARTIFACT_DRAG_TYPE));
  return value && value.thesisId === thesisId && value.expires > Date.now() && !!value.meta.interactionId ? value : null;
}
export function endArtifactDrag() { active.clear(); }
