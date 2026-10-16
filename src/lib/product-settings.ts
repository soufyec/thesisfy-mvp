import type { AIMode } from "./db";
import type { Locale } from "./i18n";

export const PRODUCT_MODES = ["copilot", "critique", "grammar", "citations", "gaps", "paraphrase_check"] as const;
export type ProductMode = typeof PRODUCT_MODES[number];
export interface ModeSettings {
  enabled: boolean;
  instructions: string;
  descriptions: Record<Locale, string>;
}
export interface ProductSettings {
  revision: number;
  updatedAt: string | null;
  assistantEnabled: boolean;
  defaultMode: ProductMode;
  searchEnabled: boolean;
  filesEnabled: boolean;
  maxArtifacts: number;
  maxOutputTokens: number;
  historyMessages: number;
  instructions: string;
  modes: Record<ProductMode, ModeSettings>;
}
export function defaultProductSettings(): ProductSettings {
  return { revision: 0, updatedAt: null, assistantEnabled: true, defaultMode: "copilot", searchEnabled: true, filesEnabled: true, maxArtifacts: 4, maxOutputTokens: 8192, historyMessages: 30, instructions: "", modes: Object.fromEntries(PRODUCT_MODES.map(id => [id, { enabled: true, instructions: "", descriptions: { en: "", es: "", fr: "", de: "" } }])) as ProductSettings["modes"] };
}
export function isProductMode(value: unknown): value is ProductMode {
  return typeof value === "string" && (PRODUCT_MODES as readonly string[]).includes(value);
}
export function modeEnabled(settings: ProductSettings, mode: AIMode): boolean {
  // Historical modes remain readable, but cannot bypass a globally disabled assistant.
  return settings.assistantEnabled && (isProductMode(mode) ? settings.modes[mode].enabled : settings.modes.copilot.enabled);
}

/** Full replacement, strict bounds and explicit types: no truthy strings or silently dropped settings. */
export function validateProductSettings(raw: unknown): ProductSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid");
  const r = raw as Record<string, unknown>;
  const out = defaultProductSettings();
  for (const key of ["assistantEnabled", "searchEnabled", "filesEnabled"] as const) {
    if (typeof r[key] !== "boolean") throw new Error("invalid");
    out[key] = r[key];
  }
  for (const [key, min, max] of [["maxArtifacts", 1, 4], ["maxOutputTokens", 256, 8192], ["historyMessages", 1, 30]] as const) {
    if (typeof r[key] !== "number" || !Number.isInteger(r[key]) || r[key] < min || r[key] > max) throw new Error("invalid");
    out[key] = r[key];
  }
  const text = (value: unknown, max: number) => {
    if (typeof value !== "string" || value.length > max) throw new Error("invalid");
    return value.trim();
  };
  out.instructions = text(r.instructions, 6000);
  if (!r.modes || typeof r.modes !== "object" || Array.isArray(r.modes)) throw new Error("invalid");
  for (const id of PRODUCT_MODES) {
    const mode = (r.modes as Record<string, unknown>)[id] as ModeSettings | undefined;
    if (!mode || typeof mode.enabled !== "boolean" || !mode.descriptions || typeof mode.descriptions !== "object") throw new Error("invalid");
    out.modes[id] = { enabled: mode.enabled, instructions: text(mode.instructions, 4000), descriptions: Object.fromEntries((["en", "es", "fr", "de"] as const).map(l => [l, text(mode.descriptions[l], 240)])) as Record<Locale, string> };
  }
  if (!isProductMode(r.defaultMode) || !out.modes[r.defaultMode].enabled) throw new Error("invalid");
  out.defaultMode = r.defaultMode;
  return out;
}

/** Student-facing metadata never contains private team instructions. */
export function publicAssistantSettings(settings: ProductSettings) {
  return { enabled: settings.assistantEnabled, defaultMode: settings.defaultMode, searchEnabled: settings.searchEnabled, filesEnabled: settings.filesEnabled };
}
export function productInstructions(settings: ProductSettings, mode: AIMode): string {
  return [settings.instructions, isProductMode(mode) ? settings.modes[mode].instructions : "", settings.filesEnabled ? "" : "Creating downloadable research files is disabled. Do not emit thesisfic-file blocks or promise a file download."]
    .filter(Boolean).join("\n\n");
}
