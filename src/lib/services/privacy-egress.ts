import { PIIScrubberService, createPresidioAnalyzer, PrivacyUnavailableError } from "./pii-scrubber";
import { privacyEndpoint } from "./private-engines";
/** Public searches never receive the document/user identity or reversible placeholder IDs. */
export async function safeAcademicQuery(text: string, identity?: { name: string; email: string }): Promise<string> {
  if (!text.trim()) return "";
  const url = privacyEndpoint();
  if (!url) throw new PrivacyUnavailableError();
  const shield = new PIIScrubberService({
    knownNames: identity ? [identity.name] : [], knownEmails: identity ? [identity.email] : [],
    analyzer: createPresidioAnalyzer(url, fetch, true),
  });
  try { return (await shield.scrub(text)).text.replace(/\[TF_[a-f0-9]+_[A-Z_]+_\d+\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500); }
  finally { shield.dispose(); }
}
