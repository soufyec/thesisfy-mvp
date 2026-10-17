export type Effort = "low" | "medium" | "high";
export const EFFORTS: Effort[] = ["low", "medium", "high"];
export function supportedEfforts(provider: string, model: string, backend?: string): Effort[] {
  if (backend === "foundry_claude") return ["medium"];
  if (provider === "anthropic" && /^claude-(opus-5|sonnet-5|fable|mythos)/.test(model)) return EFFORTS;
  if (provider === "google" && /^gemini-(2\.5|3\.|4)/.test(model)) {
    return /^gemini-3(?:\.1)?-pro/.test(model) ? ["low", "high"] : EFFORTS;
  }
  return ["medium"];
}
export function defaultEffort(provider: string, model: string, backend?: string): Effort {
  const options = supportedEfforts(provider, model, backend);
  return options.includes("medium") ? "medium" : "low";
}
export function geminiThinking(model: string, effort: Effort, maxTokens: number) {
  if (/^gemini-(3\.|4)/.test(model)) return { thinkingLevel: effort.toUpperCase(), includeThoughts: false };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: Math.min({ low: 1024, medium: 2048, high: 4096 }[effort], Math.max(128, maxTokens - 512)), includeThoughts: false };
  return undefined;
}
