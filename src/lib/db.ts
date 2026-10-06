// Thesisfic data layer.
// In-memory store persisted on globalThis (survives hot reloads) with optional
// JSON-file persistence (DATA_FILE env). Swap for Postgres/Prisma in production:
// every access goes through the `db` object below, so the surface stays stable.

import { randomUUID } from "crypto";
import fs from "fs";

export type Role = "student" | "professor" | "admin";
export type ThesisStatus = "draft" | "in_progress" | "under_review" | "revision_requested" | "approved" | "submitted";
export type Provider = "anthropic" | "openai" | "google" | "mistral";
export type AIMode =
  | "chat"
  | "brainstorm"
  | "outline"
  | "critique"
  | "grammar"
  | "summarize"
  | "explain"
  | "citations"
  | "gaps"
  | "paraphrase_check"
  | "copilot";

export interface User {
  id: string;
  email: string;
  password: string; // bcrypt hash
  name: string;
  role: Role;
  university: string;
  avatar?: string;
  createdAt: string;
  lastActiveAt?: string;
  preferences: {
    language: "en" | "es" | "fr";
    defaultProvider?: Provider;
    editorFont: string;
    editorZoom: number;
  };
}

export interface ProvenanceStats {
  human: number; // words typed by the student
  paste: number; // words pasted from unknown sources
  ai: number; // words inserted from AI (Thesisfic assistant or attributed external AI)
}

export interface Thesis {
  id: string;
  title: string;
  description: string;
  studentId: string;
  professorId?: string;
  status: ThesisStatus;
  content: string; // HTML (TipTap document)
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  targetWords: number;
  citationStyle: "APA" | "MLA" | "Chicago" | "IEEE" | "Harvard";
  provenance: ProvenanceStats;
  createdAt: string;
  updatedAt: string;
  sessions: WritingSession[];
  references: Reference[];
  /** Working tabs (notes, drafts). The submission tab is `content`; only it is submitted, reviewed and scored. */
  tabs: ThesisTab[];
  pageSetup: { orientation: "portrait" | "landscape"; size: "A4" | "Letter"; margin: number; lineSpacing: number };
}

export interface ThesisTab {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface Reference {
  id: string;
  type: "book" | "article" | "web" | "thesis" | "chapter";
  authors: string;
  year: string;
  title: string;
  source: string; // journal / publisher / site
  url?: string;
  doi?: string;
  pages?: string;
  volume?: string;
  issue?: string;
  /** Identifiers and verification added by the citation checker (feature: verified citations). */
  openalexId?: string;
  s2Id?: string;
  pmid?: string;
  isRetracted?: boolean;
  verification?: { status: "verified" | "unverified" | "retracted" | "mismatch"; checkedAt: string; source: "openalex" | "crossref" | "s2" | "manual"; mismatches?: string[] };
  /** Passage that supports the claim this reference was suggested for. */
  supportSnippet?: { text: string; workId?: string; section?: string };
  interactionId?: string;
}

export interface ThesisVersion {
  id: string;
  thesisId: string;
  authorId: string;
  content: string;
  wordCount: number;
  label?: string;
  kind: "autosave" | "manual" | "milestone" | "restore";
  createdAt: string;
}

export interface CommentReply {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  thesisId: string;
  authorId: string;
  anchorId: string; // id of the comment mark inside the document
  quote: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  replies: CommentReply[];
  /** Set when the comment was produced by the AI reviewer on the student's request; the student remains the author of record. */
  source?: "ai";
  /** Reviewer category and severity, for AI reviewer comments. */
  category?: "argument" | "evidence" | "structure" | "clarity" | "citations" | "method" | "other";
  severity?: "low" | "medium" | "high";
  reviewRunId?: string;
  /** Whether the anchored text still matches the quote the reviewer saw. */
  anchorStatus?: "live" | "stale" | "orphaned";
  /** Socratic question the reviewer attached, if any. */
  question?: string;
  dismissedReason?: string;
}

/** One run of the AI reviewer over a scope of the thesis. */
export interface ReviewRun {
  id: string;
  thesisId: string;
  userId: string;
  scope: "selection" | "section" | "document";
  scopeLabel?: string;
  rubricVersion: string;
  model: string;
  provider: string;
  costUsd: number;
  commentCount: number;
  createdAt: string;
}

/** Rubric criteria the institution uses for AI reviews. */
export interface RubricCriterion {
  id: "argument" | "evidence" | "structure" | "clarity" | "citations" | "method";
  label: string;
  description: string;
  weight: number; // 0-3, 0 disables
}

/** Periodic snapshot of a thesis, hash-chained so the process record is tamper-evident. */
export interface Snapshot {
  id: string;
  thesisId: string;
  tabId: string; // "submission" or a working tab id
  userId: string;
  sessionId?: string;
  wordCount: number;
  provenance: { human: number; ai: number; paste: number };
  /** Full HTML when `diff` is absent (first snapshot or every 20th); otherwise a unified diff against the previous snapshot. */
  html?: string;
  diff?: string;
  hash: string;
  prevHash?: string;
  createdAt: string;
}

/** AI-use declaration generated from the ledger and signed by the student. */
export interface Declaration {
  id: string;
  thesisId: string;
  version: number;
  text: string;
  ledgerSummary: Record<string, unknown>;
  signedAt?: string;
  signedBy?: string;
  createdAt: string;
}

/** A chunk of a source's text, retrievable by the grounded assistant. */
export interface SourceChunk {
  id: string;
  sourceId: string;
  thesisId: string;
  index: number;
  page?: number;
  section?: string;
  text: string;
  wordCount: number;
}

/** Supporting / contrasting evidence found for a claim. */
export interface EvidenceCheck {
  id: string;
  thesisId: string;
  userId: string;
  claimQuote: string;
  anchorId?: string;
  results: { workId: string; title: string; authors?: string; year?: string; doi?: string; quote: string; stance: "supports" | "qualifies" | "contradicts" | "mentions"; confidence: number; citedByCount?: number; type?: string; isRetracted?: boolean }[];
  model: string;
  costUsd: number;
  createdAt: string;
}

/** Per-thesis language review preferences. */
export interface LanguagePrefs {
  thesisId: string;
  language: "en-US" | "en-GB" | "es" | "fr" | "auto";
  motherTongue?: string;
  mutedCategories: string[];
  mutedRules: string[];
  dictionary: string[];
  updatedAt: string;
}

export type SourceKind = "doi" | "url" | "pdf" | "text";

/** A source in a thesis's library: metadata plus extracted text the assistant can quote from. */
export interface ThesisSource {
  id: string;
  thesisId: string;
  kind: SourceKind;
  title: string;
  authors?: string;
  year?: string;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  /** Extracted full text, capped (see sources API). Chunked on demand. */
  text?: string;
  pages?: number;
  wordCount: number;
  parseStatus?: "pending" | "parsed" | "no_text" | "failed";
  license?: string;
  openalexId?: string;
  addedAt: string;
  lastUsedAt?: string;
}

export type SessionEventType =
  | "typing"
  | "paste"
  | "ai_prompt"
  | "ai_insert"
  | "ai_suggestion_rejected"
  | "tab_hidden"
  | "tab_visible"
  | "save"
  | "flag";

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ConsentScopes {
  keystrokes: boolean; // typing rhythm and counts (never the text itself)
  paste: boolean; // paste sizes + hash for attribution
  aiInteractions: boolean; // prompts/responses through Thesisfic assistant
  tabActivity: boolean; // tab hidden/visible while a session is active
}

export interface Consent {
  id: string;
  userId: string;
  thesisId?: string;
  version: string;
  scopes: ConsentScopes;
  grantedAt: string;
  revokedAt?: string;
  userAgent?: string;
}

export interface IntegrityFlag {
  id: string;
  thesisId: string;
  sessionId?: string;
  type: "bulk_paste" | "ai_generation" | "style_inconsistency" | "rapid_typing" | "unattributed_ai" | "policy_limit";
  severity: "low" | "medium" | "high";
  description: string;
  timestamp: string;
  resolved: boolean;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface WritingSession {
  id: string;
  thesisId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  lastHeartbeatAt: string;
  wordsWritten: number;
  aiAssists: number;
  keystrokes: number;
  pasteEvents: number;
  tabSwitches: number;
  consentId?: string;
  device: "desktop" | "mobile" | "tablet";
  events: SessionEvent[];
  integrityFlags: IntegrityFlag[];
}

export interface AIConnection {
  id: string;
  userId: string;
  provider: Provider;
  authType: "api_key" | "oauth";
  label: string;
  encryptedSecret: string; // AES-256-GCM (see lib/crypto)
  secretHint: string; // last 4 characters
  model?: string;
  status: "active" | "invalid" | "revoked" | "pending";
  scopes?: string[];
  createdAt: string;
  lastUsedAt?: string;
  lastError?: string;
}

export interface AIInteraction {
  id: string;
  userId: string;
  thesisId?: string;
  sessionId?: string;
  provider: Provider | "demo";
  model: string;
  mode: AIMode;
  source: "thesisfic";
  connectionId?: string;
  promptPreview: string;
  responsePreview: string;
  inputTokens: number;
  outputTokens: number;
  insertedWords: number;
  blockedByPolicy: boolean;
  timestamp: string;
  billedTo?: "institution" | "student" | "none"; // who pays the provider for this request
  costUsd?: number; // provider list cost at the model's configured prices
  institutionModelId?: string;
  /** Fingerprints of the answer's paragraphs and sentences, so text taken from it can be recognised when pasted into a thesis. */
  responseFingerprints?: string[];
}

export interface Conversation {
  id: string;
  userId: string;
  thesisId?: string;
  title: string;
  messages: { id: string; role: "user" | "assistant"; content: string; mode?: AIMode; provider?: string; model?: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  university: string;
  maxAiUsagePercent: number;
  allowBYOK: boolean; // students may connect their own AI accounts
  allowedProviders: Provider[];
  allowedModes: AIMode[];
  blockGeneration: boolean; // hard-block "write it for me"
  /**
   * Research copilot: when the institution provides the models, students may ask anything about their research,
   * in any mode, with the history kept and visible to the institution. Writing thesis text stays blocked and
   * any answer text pasted into the thesis is recognised and marked as AI-assisted.
   */
  researchCopilot: boolean;
  /** Rubric for the AI reviewer; absent = default rubric. */
  reviewRubric?: RubricCriterion[];
  flagSensitivity: "low" | "medium" | "high";
  requireConsent: boolean;
  monitoring: {
    keystrokes: boolean;
    paste: boolean;
    aiInteractions: boolean;
    tabActivity: boolean;
  };
  updatedAt: string;
  updatedBy?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "deadline" | "comment" | "flag";
  read: boolean;
  link?: string;
  createdAt: string;
}

export type DatabaseAccess = "sso" | "proxy" | "vpn" | "campus" | "open" | "personal";

/** A research database the university subscribes to (or recommends), shown to its students. */
export interface ResearchDatabase {
  id: string;
  university: string;
  name: string;
  url: string; // public landing or search page
  loginUrl?: string; // direct institutional login page, when the provider has one
  description: string;
  subjects: string[];
  access: DatabaseAccess;
  instructions?: string; // special steps, written by the library
  featured: boolean;
  opens: number; // click-throughs from Thesisfic (for library usage reporting)
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySettings {
  university: string;
  proxyPrefix?: string; // e.g. EZproxy "https://login.proxy.example.edu/login?url="
  intro?: string;
  helpEmail?: string;
  helpUrl?: string;
  updatedAt: string;
}

/**
 * Where an institution-provided model runs, which decides who invoices the university:
 * - thesisfic: Thesisfic's own provider contracts, passed through on the Thesisfic invoice
 * - anthropic / openai / mistral / google: the university's own API account with that provider
 * - azure_openai: GPT (or other Foundry models) in the university's Microsoft Azure subscription
 * - foundry_claude: Claude in the university's Microsoft Foundry resource (billed by Microsoft)
 */
export type ModelBackend = "thesisfic" | "anthropic" | "openai" | "mistral" | "google" | "azure_openai" | "foundry_claude";

/** A model the institution offers to its students and pays for, like Copilot inside a company. */
export interface InstitutionModel {
  id: string;
  university: string;
  provider: Provider; // model family the student sees (Claude, GPT, Gemini, Mistral)
  backend: ModelBackend;
  label: string;
  model: string; // model id, or the deployment name on Azure / Foundry
  endpoint?: string; // Azure resource URL or Foundry resource name
  encryptedSecret?: string; // the institution's key (not needed for the thesisfic backend)
  secretHint?: string;
  region: string; // shown to students, e.g. "EU (France Central)"
  inputPrice: number; // USD per million input tokens, as the provider bills it
  outputPrice: number; // USD per million output tokens
  enabled: boolean;
  isDefault: boolean; // used by "Auto"
  lastTestedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/** Who pays for AI at a university and how much. Amounts are in the institution's currency. */
export interface AIFunding {
  university: string;
  institutionPays: boolean; // offer the institution's models to students
  currency: "EUR" | "USD" | "GBP" | "CHF";
  usdRate: number; // 1 USD in the institution's currency, used to convert provider list prices
  monthlyBudget: number; // whole institution, 0 = no cap
  perStudentMonthly: number; // allowance per student, 0 = no cap
  atLimit: "block" | "own_account"; // when an allowance runs out
  alertPercent: number; // notify admins when the budget passes this share
  alertedMonth?: string;
  updatedAt: string;
  updatedBy?: string;
}

/** Pilot request from the landing page. */
export interface Lead {
  id: string;
  institution: string;
  email: string;
  role: "integrity_office" | "dean" | "library" | "other";
  message?: string;
  createdAt: string;
}

interface Store {
  users: User[];
  theses: Thesis[];
  versions: ThesisVersion[];
  comments: Comment[];
  flags: IntegrityFlag[];
  connections: AIConnection[];
  interactions: AIInteraction[];
  conversations: Conversation[];
  consents: Consent[];
  policies: Policy[];
  notifications: Notification[];
  researchDatabases: ResearchDatabase[];
  librarySettings: LibrarySettings[];
  institutionModels: InstitutionModel[];
  aiFunding: AIFunding[];
  leads: Lead[];
  sources: ThesisSource[];
  sourceChunks: SourceChunk[];
  reviewRuns: ReviewRun[];
  snapshots: Snapshot[];
  declarations: Declaration[];
  evidenceChecks: EvidenceCheck[];
  languagePrefs: LanguagePrefs[];
}

const DEMO_HASH = "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe";

function seed(): Store {
  const users: User[] = [
    {
      id: "usr_1",
      email: "jane.cooper@stanford.edu",
      password: DEMO_HASH,
      name: "Jane Cooper",
      role: "student",
      university: "Stanford University",
      avatar: "JC",
      createdAt: "2024-09-01T00:00:00Z",
      lastActiveAt: "2026-03-14T10:00:00Z",
      preferences: { language: "en", defaultProvider: "anthropic", editorFont: "Georgia", editorZoom: 100 },
    },
    {
      id: "usr_2",
      email: "admin@stanford.edu",
      password: DEMO_HASH,
      name: "Dr. Sarah Mitchell",
      role: "admin",
      university: "Stanford University",
      avatar: "SM",
      createdAt: "2024-01-01T00:00:00Z",
      preferences: { language: "en", editorFont: "Georgia", editorZoom: 100 },
    },
    {
      id: "usr_3",
      email: "marie.dupont@sorbonne.fr",
      password: DEMO_HASH,
      name: "Marie Dupont",
      role: "student",
      university: "Sorbonne University",
      avatar: "MD",
      createdAt: "2024-09-15T00:00:00Z",
      lastActiveAt: "2026-03-08T16:00:00Z",
      preferences: { language: "fr", defaultProvider: "openai", editorFont: "Georgia", editorZoom: 100 },
    },
    {
      id: "usr_4",
      email: "prof.williams@stanford.edu",
      password: DEMO_HASH,
      name: "Prof. James Williams",
      role: "professor",
      university: "Stanford University",
      avatar: "JW",
      createdAt: "2024-01-15T00:00:00Z",
      preferences: { language: "en", editorFont: "Georgia", editorZoom: 100 },
    },
  ];

  const thesis1Content = `<h1>Machine Learning Applications in Climate Change Prediction Models</h1>
<h2>Abstract</h2>
<p>Climate change represents one of the most significant challenges of our era. This thesis explores the application of modern machine learning techniques, particularly deep learning architectures, to improve the accuracy of climate change prediction models at regional scales.</p>
<h2>1. Introduction</h2>
<p>The increasing availability of climate data from satellites, weather stations, and ocean sensors has created unprecedented opportunities for data-driven approaches to climate modeling. Traditional physics-based models, while valuable, often struggle to capture the complex nonlinear interactions that govern regional climate patterns.</p>
<p>This research aims to bridge the gap between traditional climate science and modern machine learning by developing hybrid models that leverage the strengths of both approaches. We focus specifically on regional precipitation patterns and temperature anomalies in the Western United States.</p>
<h2>2. Literature Review</h2>
<h3>2.1 Traditional Climate Models</h3>
<p>General Circulation Models (GCMs) have been the backbone of climate prediction for decades. These models solve the fundamental equations of fluid dynamics and thermodynamics on a three-dimensional grid covering the Earth's surface and atmosphere <span data-comment-id="cmt_1" class="thesisfic-comment">(Randall et al., 2007)</span>.</p>
<h3>2.2 Machine Learning in Climate Science</h3>
<p>Recent advances in deep learning have shown promising results in weather forecasting and climate prediction. <span data-provenance="ai" data-provider="anthropic">Convolutional neural networks are particularly well suited to gridded climate fields because their inductive bias mirrors the spatial locality of atmospheric processes.</span> Convolutional Neural Networks (CNNs) have been particularly effective at capturing spatial patterns in climate data.</p>
<p><span data-provenance="paste" data-source="Reichstein et al. (2019), Nature">Deep learning and process understanding for data-driven Earth system science requires hybrid modelling approaches that combine physical process models with the versatility of data-driven machine learning.</span> This framing motivates the hybrid architecture described in Chapter 3.</p>
<h2>3. Methodology</h2>
<p>Our approach combines a pre-trained climate model with a neural network correction layer. The architecture consists of:</p>
<ol>
<li><p><strong>Data preprocessing pipeline</strong>: Handling missing values, normalization, and spatial interpolation</p></li>
<li><p><strong>Feature extraction</strong>: Using CNNs to extract relevant spatial features from climate data</p></li>
<li><p><strong>Temporal modeling</strong>: Applying LSTM networks to capture long-term dependencies</p></li>
<li><p><strong>Hybrid integration</strong>: Combining physics-based predictions with ML corrections</p></li>
</ol>
<h2>4. Preliminary Results</h2>
<p>Initial experiments show a 23% improvement in regional temperature prediction accuracy compared to standalone GCM models. The hybrid approach is particularly effective for extreme weather events, where traditional models tend to underperform.</p>
<table><tbody>
<tr><th><p>Model</p></th><th><p>RMSE (°C)</p></th><th><p>Improvement</p></th></tr>
<tr><td><p>GCM baseline</p></td><td><p>1.84</p></td><td><p>—</p></td></tr>
<tr><td><p>CNN correction</p></td><td><p>1.52</p></td><td><p>17%</p></td></tr>
<tr><td><p>CNN + LSTM (ours)</p></td><td><p>1.42</p></td><td><p>23%</p></td></tr>
</tbody></table>
<h2>5. Discussion</h2>
<p></p>`;

  const theses: Thesis[] = [
    {
      id: "thesis_1",
      title: "Machine Learning Applications in Climate Change Prediction Models",
      description: "Exploring the use of deep learning architectures for improving climate prediction accuracy at regional scales.",
      studentId: "usr_1",
      professorId: "usr_4",
      status: "in_progress",
      content: thesis1Content,
      wordCount: 0,
      aiUsagePercent: 12,
      integrityScore: 94,
      deadline: "2026-06-15T00:00:00Z",
      targetWords: 20000,
      citationStyle: "APA",
      provenance: { human: 2480, paste: 120, ai: 247 },
      createdAt: "2025-10-01T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      references: [
        { id: "ref_1", type: "article", authors: "Randall, D. A., Wood, R. A., Bony, S.", year: "2007", title: "Climate models and their evaluation", source: "Climate Change 2007: The Physical Science Basis", pages: "589-662" },
        { id: "ref_2", type: "article", authors: "Reichstein, M., Camps-Valls, G., Stevens, B.", year: "2019", title: "Deep learning and process understanding for data-driven Earth system science", source: "Nature", volume: "566", pages: "195-204", doi: "10.1038/s41586-019-0912-1" },
      ],
      pageSetup: { orientation: "portrait", size: "A4", margin: 2.54, lineSpacing: 1.5 },
      tabs: [
        {
          id: "tab_notes_1",
          title: "Research notes",
          content: "<h2>Research notes</h2><p>Ideas for the discussion chapter:</p><ul><li><p>Compare CNN+LSTM errors in summer vs winter months.</p></li><li><p>Ask Prof. Williams about including the 2021 heatwave as a case study.</p></li></ul><p>Sources to read: Eyring et al. (2021) on model evaluation.</p>",
          updatedAt: "2026-03-12T10:00:00Z",
        },
        {
          id: "tab_draft_1",
          title: "Chapter 5 draft",
          content: "<h2>5. Discussion (draft)</h2><p>The results suggest that hybrid models capture extreme events better because the correction layer learns systematic biases of the GCM.</p>",
          updatedAt: "2026-03-13T18:20:00Z",
        },
      ],
      sessions: [],
    },
    {
      id: "thesis_2",
      title: "Blockchain-Based Academic Credential Verification Systems",
      description: "A decentralized approach to verifying academic credentials using blockchain technology.",
      studentId: "usr_1",
      professorId: "usr_4",
      status: "draft",
      content: "<h1>Blockchain-Based Academic Credential Verification Systems</h1><h2>Abstract</h2><p>This thesis proposes a novel blockchain-based system for verifying academic credentials. Universities issue signed credentials that are anchored on a public ledger, allowing employers to verify authenticity without contacting the issuing institution.</p><h2>1. Introduction</h2><p></p>",
      wordCount: 0,
      aiUsagePercent: 5,
      integrityScore: 98,
      deadline: "2026-08-01T00:00:00Z",
      targetWords: 15000,
      citationStyle: "IEEE",
      provenance: { human: 495, paste: 0, ai: 25 },
      createdAt: "2026-01-15T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      references: [],
      pageSetup: { orientation: "portrait", size: "A4", margin: 2.54, lineSpacing: 1.5 },
      tabs: [],
      sessions: [],
    },
    {
      id: "thesis_3",
      title: "L'impact de l'intelligence artificielle sur l'éducation supérieure en France",
      description: "Analyse des transformations induites par l'IA dans le système universitaire français.",
      studentId: "usr_3",
      professorId: "usr_4",
      status: "under_review",
      content: "<h1>L'impact de l'intelligence artificielle sur l'éducation supérieure en France</h1><h2>Résumé</h2><p>Cette thèse examine les profondes transformations que l'intelligence artificielle apporte au paysage de l'enseignement supérieur en France. Elle s'appuie sur une enquête menée auprès de 412 étudiants et 68 enseignants de six universités.</p><h2>1. Introduction</h2><p>Depuis 2023, l'adoption des assistants conversationnels par les étudiants a profondément modifié les pratiques d'écriture académique.</p>",
      wordCount: 0,
      aiUsagePercent: 8,
      integrityScore: 96,
      deadline: "2026-05-01T00:00:00Z",
      targetWords: 40000,
      citationStyle: "APA",
      provenance: { human: 13984, paste: 342, ai: 874 },
      createdAt: "2025-09-01T00:00:00Z",
      updatedAt: "2026-03-08T00:00:00Z",
      references: [],
      pageSetup: { orientation: "portrait", size: "A4", margin: 2.5, lineSpacing: 1.5 },
      tabs: [],
      sessions: [],
    },
  ];
  theses.forEach((t) => (t.wordCount = countWords(t.content)));
  theses[0].wordCount = Math.max(theses[0].wordCount, 2847);
  theses[2].wordCount = 15200;

  const flags: IntegrityFlag[] = [
    {
      id: "flag_1",
      thesisId: "thesis_1",
      sessionId: "sess_2",
      type: "style_inconsistency",
      severity: "low",
      description: "Minor style variation in paragraph 3 of section 2.2",
      timestamp: "2026-03-10T15:23:00Z",
      resolved: true,
      resolvedBy: "usr_4",
      resolutionNote: "Student attributed the passage to a cited source.",
    },
    {
      id: "flag_2",
      thesisId: "thesis_3",
      type: "bulk_paste",
      severity: "medium",
      description: "Large text block pasted from external source (342 words) without attribution",
      timestamp: "2026-03-07T11:02:00Z",
      resolved: false,
    },
  ];

  const sessions: WritingSession[] = [
    {
      id: "sess_1",
      thesisId: "thesis_1",
      userId: "usr_1",
      startedAt: "2026-03-12T09:00:00Z",
      endedAt: "2026-03-12T11:30:00Z",
      lastHeartbeatAt: "2026-03-12T11:30:00Z",
      wordsWritten: 450,
      aiAssists: 3,
      keystrokes: 4200,
      pasteEvents: 2,
      tabSwitches: 6,
      consentId: "consent_1",
      device: "desktop",
      events: [
        { id: "ev_1", type: "ai_prompt", timestamp: "2026-03-12T09:20:00Z", data: { mode: "outline", provider: "anthropic", promptPreview: "Help me outline the discussion section" } },
        { id: "ev_3", type: "paste", timestamp: "2026-03-12T10:19:00Z", data: { words: 38, hash: "9f2c" } },
        { id: "ev_4", type: "ai_insert", timestamp: "2026-03-12T11:02:00Z", data: { words: 41, provider: "anthropic", mode: "grammar" } },
      ],
      integrityFlags: [flags[2]],
    },
    {
      id: "sess_2",
      thesisId: "thesis_1",
      userId: "usr_1",
      startedAt: "2026-03-10T14:00:00Z",
      endedAt: "2026-03-10T16:00:00Z",
      lastHeartbeatAt: "2026-03-10T16:00:00Z",
      wordsWritten: 380,
      aiAssists: 5,
      keystrokes: 3800,
      pasteEvents: 1,
      tabSwitches: 2,
      consentId: "consent_1",
      device: "desktop",
      events: [],
      integrityFlags: [flags[0]],
    },
    {
      id: "sess_3",
      thesisId: "thesis_3",
      userId: "usr_3",
      startedAt: "2026-03-07T10:00:00Z",
      endedAt: "2026-03-07T12:40:00Z",
      lastHeartbeatAt: "2026-03-07T12:40:00Z",
      wordsWritten: 1240,
      aiAssists: 2,
      keystrokes: 9100,
      pasteEvents: 3,
      tabSwitches: 4,
      device: "mobile",
      events: [{ id: "ev_5", type: "paste", timestamp: "2026-03-07T11:02:00Z", data: { words: 342 } }],
      integrityFlags: [flags[1]],
    },
  ];
  theses[0].sessions = [sessions[0], sessions[1]];
  theses[2].sessions = [sessions[2]];

  const t0 = "2026-09-01T00:00:00Z";
  const institutionModels: InstitutionModel[] = [
    { id: "im_stan_1", university: "Stanford University", provider: "anthropic", backend: "thesisfic", label: "Claude Sonnet 5.5", model: "claude-sonnet-5-5", region: "US", inputPrice: 2, outputPrice: 10, enabled: true, isDefault: true, createdAt: t0, updatedAt: t0 },
    { id: "im_stan_2", university: "Stanford University", provider: "openai", backend: "azure_openai", label: "GPT-4.1 (Azure)", model: "gpt-4.1", endpoint: "https://stanford-ai.openai.azure.com", region: "US (East US 2)", inputPrice: 2, outputPrice: 8, enabled: true, isDefault: false, createdAt: t0, updatedAt: t0 },
    { id: "im_stan_3", university: "Stanford University", provider: "anthropic", backend: "foundry_claude", label: "Claude Opus 5.5 (Microsoft Foundry)", model: "claude-opus-5-5", endpoint: "stanford-foundry", region: "US (East US 2)", inputPrice: 4, outputPrice: 20, enabled: false, isDefault: false, createdAt: t0, updatedAt: t0 },
    { id: "im_sorb_1", university: "Sorbonne University", provider: "mistral", backend: "thesisfic", label: "Mistral Medium", model: "mistral-medium-latest", region: "EU (France)", inputPrice: 0.4, outputPrice: 2, enabled: true, isDefault: true, createdAt: t0, updatedAt: t0 },
    { id: "im_sorb_2", university: "Sorbonne University", provider: "anthropic", backend: "foundry_claude", label: "Claude Sonnet 5.5 (Microsoft Foundry)", model: "claude-sonnet-5-5", endpoint: "sorbonne-foundry", region: "EU (Sweden Central)", inputPrice: 2, outputPrice: 10, enabled: true, isDefault: false, createdAt: t0, updatedAt: t0 },
    { id: "im_sorb_3", university: "Sorbonne University", provider: "openai", backend: "azure_openai", label: "GPT-4.1 (Azure)", model: "gpt-4.1", endpoint: "https://sorbonne-ai.openai.azure.com", region: "EU (France Central)", inputPrice: 2, outputPrice: 8, enabled: true, isDefault: false, createdAt: t0, updatedAt: t0 },
  ];
  const aiFunding: AIFunding[] = [
    { university: "Stanford University", institutionPays: true, currency: "USD", usdRate: 1, monthlyBudget: 1500, perStudentMonthly: 12, atLimit: "own_account", alertPercent: 80, updatedAt: t0, updatedBy: "usr_2" },
    { university: "Sorbonne University", institutionPays: true, currency: "EUR", usdRate: 0.86, monthlyBudget: 900, perStudentMonthly: 8, atLimit: "block", alertPercent: 80, updatedAt: t0 },
  ];
  // Usage this month on institution-paid models, so the billing views have history.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(8, 0, 0, 0);
  const daysSoFar = Math.max(1, new Date().getUTCDate());
  const usage: AIInteraction[] = [];
  const plan: [string, string, number][] = [["usr_1", "im_stan_1", 34], ["usr_1", "im_stan_2", 9], ["usr_3", "im_sorb_1", 22], ["usr_3", "im_sorb_2", 7]];
  const modes: AIMode[] = ["outline", "critique", "grammar", "explain", "brainstorm", "gaps", "chat"];
  let n = 0;
  for (const [userId, modelId, count] of plan) {
    const m = institutionModels.find((x) => x.id === modelId)!;
    for (let i = 0; i < count; i++) {
      n++;
      const inputTokens = 900 + ((n * 977) % 3200);
      const outputTokens = 250 + ((n * 613) % 900);
      const ts = new Date(monthStart.getTime() + (((n * 7919) % (daysSoFar * 24)) * 3600 * 1000) / 1).toISOString();
      if (new Date(ts).getTime() > Date.now()) continue;
      usage.push({
        id: `ai_inst_${n}`, userId, thesisId: userId === "usr_1" ? "thesis_1" : "thesis_3", provider: m.provider, model: m.model, mode: modes[n % modes.length], source: "thesisfic",
        promptPreview: "(institution model usage)", responsePreview: "", inputTokens, outputTokens, insertedWords: 0, blockedByPolicy: false, timestamp: ts,
        billedTo: "institution", institutionModelId: m.id, costUsd: (inputTokens * m.inputPrice + outputTokens * m.outputPrice) / 1e6,
      });
    }
  }

  return {
    users,
    theses,
    institutionModels,
    aiFunding,
    leads: [],
    sources: [],
    sourceChunks: [],
    reviewRuns: [],
    snapshots: [],
    declarations: [],
    evidenceChecks: [],
    languagePrefs: [],
    versions: [
      { id: "ver_1", thesisId: "thesis_1", authorId: "usr_1", content: thesis1Content, wordCount: 2847, kind: "milestone", label: "Chapter 4 draft", createdAt: "2026-03-12T11:30:00Z" },
    ],
    comments: [
      {
        id: "cmt_1",
        thesisId: "thesis_1",
        authorId: "usr_4",
        anchorId: "cmt_1",
        quote: "(Randall et al., 2007)",
        text: "Good source. Consider also citing the IPCC AR6 chapter on model evaluation for a more recent reference.",
        resolved: false,
        createdAt: "2026-03-13T15:30:00Z",
        replies: [{ id: "rep_1", authorId: "usr_1", text: "Will do, adding Eyring et al. (2021).", createdAt: "2026-03-14T09:10:00Z" }],
      },
    ],
    flags,
    connections: [],
    interactions: [
      { id: "ai_1", userId: "usr_1", thesisId: "thesis_1", sessionId: "sess_1", provider: "anthropic", model: "claude-sonnet-4-5", mode: "outline", source: "thesisfic", promptPreview: "Help me outline the discussion section", responsePreview: "A discussion section typically moves from your findings to their implications…", inputTokens: 420, outputTokens: 310, insertedWords: 0, blockedByPolicy: false, timestamp: "2026-03-12T09:20:00Z" },
      { id: "ai_2", userId: "usr_1", thesisId: "thesis_1", sessionId: "sess_1", provider: "anthropic", model: "claude-sonnet-4-5", mode: "grammar", source: "thesisfic", promptPreview: "Review this paragraph for clarity", responsePreview: "Two suggestions: split the second sentence and replace…", inputTokens: 380, outputTokens: 220, insertedWords: 41, blockedByPolicy: false, timestamp: "2026-03-12T11:02:00Z" },
      ...usage,
    ],
    conversations: [],
    consents: [
      {
        id: "consent_1",
        userId: "usr_1",
        version: "2026-03",
        scopes: { keystrokes: true, paste: true, aiInteractions: true, tabActivity: true },
        grantedAt: "2026-03-01T09:00:00Z",
      },
    ],
    policies: [
      {
        university: "Stanford University",
        maxAiUsagePercent: 25,
        allowBYOK: true,
        allowedProviders: ["anthropic", "openai", "google"],
        allowedModes: ["chat", "brainstorm", "outline", "critique", "grammar", "summarize", "explain", "citations", "gaps", "paraphrase_check", "copilot"],
        blockGeneration: true,
        researchCopilot: true,
        flagSensitivity: "medium",
        requireConsent: true,
        monitoring: { keystrokes: true, paste: true, aiInteractions: true, tabActivity: true },
        updatedAt: "2026-02-01T00:00:00Z",
        updatedBy: "usr_2",
      },
      {
        university: "Sorbonne University",
        maxAiUsagePercent: 15,
        allowBYOK: true,
        allowedProviders: ["anthropic", "openai", "mistral"],
        allowedModes: ["chat", "brainstorm", "outline", "critique", "grammar", "explain", "citations", "gaps", "copilot"],
        blockGeneration: true,
        researchCopilot: true,
        flagSensitivity: "high",
        requireConsent: true,
        monitoring: { keystrokes: true, paste: true, aiInteractions: true, tabActivity: false },
        updatedAt: "2026-02-10T00:00:00Z",
      },
    ],
    notifications: [
      { id: "notif_1", userId: "usr_1", title: "Deadline Reminder", message: "Your thesis 'ML in Climate Change' deadline is in 93 days.", type: "deadline", read: false, link: "/dashboard/editor/thesis_1", createdAt: "2026-03-14T08:00:00Z" },
      { id: "notif_2", userId: "usr_1", title: "Review Feedback", message: "Prof. Williams left a comment on your literature review.", type: "comment", read: false, link: "/dashboard/editor/thesis_1", createdAt: "2026-03-13T15:30:00Z" },
      { id: "notif_3", userId: "usr_1", title: "Integrity Score Updated", message: "Your integrity score for 'ML in Climate Change' increased to 94%.", type: "success", read: true, createdAt: "2026-03-12T12:00:00Z" },
      { id: "notif_4", userId: "usr_4", title: "Thesis submitted for review", message: "Marie Dupont submitted 'L'impact de l'IA…' for review.", type: "info", read: false, link: "/admin/theses/thesis_3", createdAt: "2026-03-08T16:05:00Z" },
    ],
    librarySettings: [
      { university: "Stanford University", intro: "Databases licensed by Stanford Libraries for your research. Sign in with your university account when a provider asks.", helpUrl: "https://library.stanford.edu/", updatedAt: "2026-09-01T00:00:00Z" },
      { university: "Sorbonne University", intro: "Ressources documentaires accessibles avec votre compte universitaire. En cas de problème d'accès, contactez la bibliothèque.", helpUrl: "https://www.sorbonne-universite.fr/bibliotheques", updatedAt: "2026-09-01T00:00:00Z" },
    ],
    researchDatabases: [
      ...[
        { name: "Web of Science", url: "https://www.webofscience.com/", description: "Citation index across sciences, social sciences and humanities. Best for finding the most-cited work on a topic.", subjects: ["Multidisciplinary", "Citation analysis"], access: "sso", featured: true },
        { name: "Scopus", url: "https://www.scopus.com/", description: "Abstract and citation database of peer-reviewed literature, with author and journal metrics.", subjects: ["Multidisciplinary", "Citation analysis"], access: "sso", featured: true },
        { name: "JSTOR", url: "https://www.jstor.org/", description: "Full-text archive of journals, books and primary sources, strong in humanities and social sciences.", subjects: ["Humanities", "Social sciences"], access: "sso", featured: true },
        { name: "IEEE Xplore", url: "https://ieeexplore.ieee.org/", description: "Journals, conference papers and standards in electrical engineering, computer science and electronics.", subjects: ["Engineering", "Computer science"], access: "sso", featured: false },
        { name: "ScienceDirect", url: "https://www.sciencedirect.com/", description: "Elsevier journals and books in physical, life, health and social sciences.", subjects: ["Sciences", "Health"], access: "sso", featured: false },
        { name: "ProQuest Dissertations & Theses Global", url: "https://www.proquest.com/", description: "Millions of dissertations and theses worldwide. Useful to see how others structured similar research.", subjects: ["Theses", "Multidisciplinary"], access: "proxy", featured: true, instructions: "Open it from this page so the library proxy recognises you, then sign in with your university account. If you land on a ProQuest page asking for a subscription, use the library help link." },
        { name: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/", description: "Biomedical and life-sciences literature from MEDLINE and life-science journals.", subjects: ["Health", "Life sciences"], access: "open", featured: false, instructions: "Searching is free. For full text, open the article's publisher link while signed in to the university, or use the library's link resolver." },
        { name: "Google Scholar", url: "https://scholar.google.com/", description: "Broad search across scholarly literature, with citation counts.", subjects: ["Multidisciplinary"], access: "open", featured: false, instructions: "In Scholar settings → Library links, add your university so 'Find it @ library' links appear next to results you can read in full." },
      ].map((d, i) => ({ ...d, id: `rdb_stan_${i}`, university: "Stanford University", opens: [42, 31, 27, 9, 12, 18, 5, 22][i], createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" })),
      ...[
        { name: "Cairn.info", url: "https://shs.cairn.info/", description: "Revues et ouvrages francophones en sciences humaines et sociales.", subjects: ["Sciences humaines", "Sciences sociales"], access: "sso", featured: true, instructions: "Cliquez sur « Connexion institutionnelle », choisissez votre université dans la liste de la fédération Renater, puis connectez-vous avec vos identifiants ENT." },
        { name: "Europresse", url: "https://nouveau.europresse.com/", description: "Presse française et internationale en texte intégral, utile pour l'actualité et l'analyse de discours.", subjects: ["Presse", "Sciences sociales"], access: "proxy", featured: true, instructions: "Accès uniquement via le lien de la bibliothèque (proxy). Ouvrez-le depuis cette page et identifiez-vous avec votre compte universitaire." },
        { name: "JSTOR", url: "https://www.jstor.org/", description: "Archives de revues et d'ouvrages, en particulier en sciences humaines et sociales.", subjects: ["Sciences humaines", "Sciences sociales"], access: "sso", featured: false },
        { name: "theses.fr", url: "https://theses.fr/", description: "Moteur de recherche des thèses de doctorat françaises soutenues et en préparation.", subjects: ["Thèses"], access: "open", featured: true },
        { name: "HAL", url: "https://hal.science/", description: "Archive ouverte pluridisciplinaire des publications de la recherche française.", subjects: ["Pluridisciplinaire", "Accès ouvert"], access: "open", featured: false },
        { name: "Persée", url: "https://www.persee.fr/", description: "Collections patrimoniales de revues scientifiques francophones numérisées.", subjects: ["Sciences humaines"], access: "open", featured: false },
      ].map((d, i) => ({ ...d, id: `rdb_sorb_${i}`, university: "Sorbonne University", opens: [19, 11, 6, 14, 8, 3][i], createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" })),
    ] as ResearchDatabase[],
  };
}

// ---------- persistence ----------

const g = globalThis as unknown as { __thesisficStore?: Store };
const DATA_FILE = process.env.DATA_FILE;

function load(): Store {
  if (g.__thesisficStore) return g.__thesisficStore;
  let store: Store | null = null;
  if (DATA_FILE) {
    try {
      if (fs.existsSync(DATA_FILE)) store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (e) {
      console.warn("Could not read DATA_FILE, seeding:", e);
    }
  }
  g.__thesisficStore = store || seed();
  // fill collections added after a store was first created (hot reload / older DATA_FILE)
  const fresh = seed();
  const st = g.__thesisficStore as unknown as Record<string, unknown>;
  for (const k of Object.keys(fresh) as (keyof Store)[]) if (st[k] === undefined) st[k] = fresh[k];
  return g.__thesisficStore;
}

let persistTimer: NodeJS.Timeout | null = null;
function persist() {
  if (!DATA_FILE) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(load()));
    } catch (e) {
      console.warn("Could not persist DATA_FILE:", e);
    }
  }, 250);
}

// ---------- helpers ----------

export const now = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(html: string): number {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Counts words inside provenance spans. Unmarked text is attributed to the student. */
export function computeProvenance(html: string): ProvenanceStats {
  const total = countWords(html);
  let ai = 0;
  let paste = 0;
  const re = /<span[^>]*data-provenance="(ai|paste)"[^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const w = countWords(m[2]);
    if (m[1] === "ai") ai += w;
    else paste += w;
  }
  return { human: Math.max(0, total - ai - paste), paste, ai };
}

export function publicUser(u: User) {
  const { password: _pw, ...rest } = u;
  return rest;
}

type PublicUser = ReturnType<typeof publicUser>;

// ---------- data access ----------

export const db = {
  raw: () => load(),
  persist,

  users: {
    findByEmail: (email: string) => load().users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
    findById: (id: string) => load().users.find((u) => u.id === id),
    getAll: (): PublicUser[] => load().users.map(publicUser),
    getByUniversity: (uni: string): PublicUser[] => load().users.filter((u) => u.university === uni).map(publicUser),
    create: (data: Omit<User, "id" | "createdAt" | "preferences"> & { preferences?: Partial<User["preferences"]> }): User => {
      const user: User = {
        ...data,
        id: uid("usr"),
        createdAt: now(),
        preferences: { language: "en", editorFont: "Georgia", editorZoom: 100, ...(data.preferences || {}) },
      };
      load().users.push(user);
      persist();
      return user;
    },
    update: (id: string, patch: Partial<User>) => {
      const u = load().users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch, { preferences: { ...u.preferences, ...(patch.preferences || {}) } });
      persist();
      return u;
    },
    touch: (id: string) => {
      const u = load().users.find((x) => x.id === id);
      if (u) u.lastActiveAt = now();
    },
  },

  theses: {
    findById: (id: string) => load().theses.find((t) => t.id === id),
    getByStudent: (studentId: string) => load().theses.filter((t) => t.studentId === studentId),
    getByProfessor: (profId: string) => load().theses.filter((t) => t.professorId === profId),
    getByUniversity: (uni: string) => {
      const s = load();
      const ids = new Set(s.users.filter((u) => u.university === uni).map((u) => u.id));
      return s.theses.filter((t) => ids.has(t.studentId));
    },
    getAll: () => load().theses,
    create: (data: { title: string; description: string; studentId: string; professorId?: string; deadline?: string; targetWords?: number; citationStyle?: Thesis["citationStyle"]; content?: string }): Thesis => {
      const content = data.content || `<h1>${escapeHtml(data.title)}</h1><h2>Abstract</h2><p></p><h2>1. Introduction</h2><p></p>`;
      const thesis: Thesis = {
        id: uid("thesis"),
        title: data.title,
        description: data.description,
        studentId: data.studentId,
        professorId: data.professorId,
        status: "draft",
        content,
        wordCount: countWords(content),
        aiUsagePercent: 0,
        integrityScore: 100,
        deadline: data.deadline,
        targetWords: data.targetWords || 20000,
        citationStyle: data.citationStyle || "APA",
        provenance: computeProvenance(content),
        createdAt: now(),
        updatedAt: now(),
        sessions: [],
        references: [],
        tabs: [{ id: uid("tab"), title: "Notes", content: "<h2>Notes</h2><p></p>", updatedAt: now() }],
        pageSetup: { orientation: "portrait", size: "A4", margin: 2.54, lineSpacing: 1.5 },
      };
      load().theses.push(thesis);
      persist();
      return thesis;
    },
    update: (id: string, patch: Partial<Thesis>) => {
      const t = load().theses.find((x) => x.id === id);
      if (!t) return null;
      Object.assign(t, patch, { updatedAt: now() });
      if (patch.content !== undefined) {
        t.wordCount = countWords(patch.content);
        t.provenance = computeProvenance(patch.content);
        t.aiUsagePercent = t.wordCount ? Math.round((t.provenance.ai / t.wordCount) * 100) : 0;
      }
      persist();
      return t;
    },
    remove: (id: string) => {
      const s = load();
      const idx = s.theses.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      s.theses.splice(idx, 1);
      s.versions = s.versions.filter((v) => v.thesisId !== id);
      s.comments = s.comments.filter((c) => c.thesisId !== id);
      s.flags = s.flags.filter((f) => f.thesisId !== id);
      persist();
      return true;
    },
    getStats: (theses = load().theses) => ({
      total: theses.length,
      inProgress: theses.filter((t) => t.status === "in_progress").length,
      underReview: theses.filter((t) => t.status === "under_review").length,
      approved: theses.filter((t) => t.status === "approved").length,
      avgIntegrity: theses.length ? Math.round(theses.reduce((sum, t) => sum + t.integrityScore, 0) / theses.length) : 0,
      avgAiUsage: theses.length ? Math.round(theses.reduce((sum, t) => sum + t.aiUsagePercent, 0) / theses.length) : 0,
    }),
  },

  versions: {
    list: (thesisId: string) => load().versions.filter((v) => v.thesisId === thesisId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    findById: (id: string) => load().versions.find((v) => v.id === id),
    create: (data: Omit<ThesisVersion, "id" | "createdAt">) => {
      const s = load();
      const v: ThesisVersion = { ...data, id: uid("ver"), createdAt: now() };
      s.versions.push(v);
      // keep at most 60 autosaves per thesis
      const autos = s.versions.filter((x) => x.thesisId === data.thesisId && x.kind === "autosave");
      if (autos.length > 60) {
        const drop = new Set(autos.slice(0, autos.length - 60).map((x) => x.id));
        s.versions = s.versions.filter((x) => !drop.has(x.id));
      }
      persist();
      return v;
    },
  },

  comments: {
    list: (thesisId: string) => load().comments.filter((c) => c.thesisId === thesisId),
    findById: (id: string) => load().comments.find((c) => c.id === id),
    create: (data: Omit<Comment, "id" | "createdAt" | "replies" | "resolved">) => {
      const c: Comment = { ...data, id: data.anchorId || uid("cmt"), createdAt: now(), replies: [], resolved: false };
      load().comments.push(c);
      persist();
      return c;
    },
    update: (id: string, patch: Partial<Comment>) => {
      const c = load().comments.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, patch);
      persist();
      return c;
    },
    reply: (id: string, authorId: string, text: string) => {
      const c = load().comments.find((x) => x.id === id);
      if (!c) return null;
      const r: CommentReply = { id: uid("rep"), authorId, text, createdAt: now() };
      c.replies.push(r);
      persist();
      return c;
    },
    remove: (id: string) => {
      const s = load();
      const before = s.comments.length;
      s.comments = s.comments.filter((c) => c.id !== id);
      persist();
      return s.comments.length < before;
    },
  },

  sessions: {
    findById: (id: string) => {
      for (const t of load().theses) {
        const s = t.sessions.find((x) => x.id === id);
        if (s) return s;
      }
      return undefined;
    },
    listByUser: (userId: string) => load().theses.flatMap((t) => t.sessions.filter((s) => s.userId === userId)),
    listByThesis: (thesisId: string) => load().theses.find((t) => t.id === thesisId)?.sessions || [],
    active: () => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      return load().theses.flatMap((t) => t.sessions.filter((s) => !s.endedAt && new Date(s.lastHeartbeatAt).getTime() > cutoff));
    },
    start: (data: { thesisId: string; userId: string; consentId?: string; device: WritingSession["device"] }) => {
      const t = load().theses.find((x) => x.id === data.thesisId);
      if (!t) return null;
      // close stale open sessions for this user on this thesis
      t.sessions.filter((s) => s.userId === data.userId && !s.endedAt).forEach((s) => (s.endedAt = s.lastHeartbeatAt));
      const session: WritingSession = {
        id: uid("sess"),
        thesisId: data.thesisId,
        userId: data.userId,
        startedAt: now(),
        lastHeartbeatAt: now(),
        wordsWritten: 0,
        aiAssists: 0,
        keystrokes: 0,
        pasteEvents: 0,
        tabSwitches: 0,
        consentId: data.consentId,
        device: data.device,
        events: [],
        integrityFlags: [],
      };
      t.sessions.push(session);
      persist();
      return session;
    },
    update: (id: string, patch: Partial<WritingSession>) => {
      const s = db.sessions.findById(id);
      if (!s) return null;
      Object.assign(s, patch, { lastHeartbeatAt: now() });
      persist();
      return s;
    },
    addEvent: (id: string, type: SessionEventType, data: Record<string, unknown>) => {
      const s = db.sessions.findById(id);
      if (!s) return null;
      const ev: SessionEvent = { id: uid("ev"), type, timestamp: now(), data };
      s.events.push(ev);
      s.lastHeartbeatAt = ev.timestamp;
      if (type === "paste") s.pasteEvents += 1;
      if (type === "ai_insert" || type === "ai_prompt") s.aiAssists += 1;
      if (type === "tab_hidden") s.tabSwitches += 1;
      if (type === "typing" && typeof data.keystrokes === "number") s.keystrokes += data.keystrokes as number;
      if (type === "typing" && typeof data.words === "number") s.wordsWritten += data.words as number;
      if (s.events.length > 2000) s.events.splice(0, s.events.length - 2000);
      persist();
      return ev;
    },
    end: (id: string) => {
      const s = db.sessions.findById(id);
      if (!s) return null;
      s.endedAt = now();
      persist();
      return s;
    },
  },

  flags: {
    list: () => load().flags,
    listByThesis: (thesisId: string) => load().flags.filter((f) => f.thesisId === thesisId),
    listByUniversity: (uni: string) => {
      const ids = new Set(db.theses.getByUniversity(uni).map((t) => t.id));
      return load().flags.filter((f) => ids.has(f.thesisId));
    },
    create: (data: Omit<IntegrityFlag, "id" | "timestamp" | "resolved">) => {
      const f: IntegrityFlag = { ...data, id: uid("flag"), timestamp: now(), resolved: false };
      load().flags.push(f);
      if (data.sessionId) db.sessions.findById(data.sessionId)?.integrityFlags.push(f);
      persist();
      return f;
    },
    resolve: (id: string, resolvedBy: string, note?: string) => {
      const f = load().flags.find((x) => x.id === id);
      if (!f) return null;
      f.resolved = true;
      f.resolvedBy = resolvedBy;
      f.resolutionNote = note;
      persist();
      return f;
    },
  },

  connections: {
    listByUser: (userId: string) => load().connections.filter((c) => c.userId === userId && c.status !== "revoked"),
    findById: (id: string) => load().connections.find((c) => c.id === id),
    findActive: (userId: string, provider?: Provider) =>
      load().connections.find((c) => c.userId === userId && c.status === "active" && (!provider || c.provider === provider)),
    create: (data: Omit<AIConnection, "id" | "createdAt">) => {
      const s = load();
      // one active connection per provider per user
      s.connections.filter((c) => c.userId === data.userId && c.provider === data.provider && c.status !== "revoked").forEach((c) => (c.status = "revoked"));
      const c: AIConnection = { ...data, id: uid("conn"), createdAt: now() };
      s.connections.push(c);
      persist();
      return c;
    },
    update: (id: string, patch: Partial<AIConnection>) => {
      const c = load().connections.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, patch);
      persist();
      return c;
    },
    revoke: (id: string) => db.connections.update(id, { status: "revoked", encryptedSecret: "" }),
  },

  interactions: {
    listByUser: (userId: string) => load().interactions.filter((i) => i.userId === userId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    listByThesis: (thesisId: string) => load().interactions.filter((i) => i.thesisId === thesisId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    listByUniversity: (uni: string) => {
      const ids = new Set(load().users.filter((u) => u.university === uni).map((u) => u.id));
      return load().interactions.filter((i) => ids.has(i.userId));
    },
    create: (data: Omit<AIInteraction, "id" | "timestamp">) => {
      const i: AIInteraction = { ...data, id: uid("ai"), timestamp: now() };
      load().interactions.push(i);
      persist();
      return i;
    },
    /** The student's own recent assistant answers whose fingerprints overlap the given ones, best match first. */
    matchFingerprints: (userId: string, fps: string[], days = 90) => {
      if (!fps.length) return [];
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const set = new Set(fps);
      return load()
        .interactions.filter((i) => i.userId === userId && i.timestamp >= since && i.responseFingerprints?.length)
        .map((i) => ({ interaction: i, hits: i.responseFingerprints!.filter((f) => set.has(f)).length }))
        .filter((m) => m.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.interaction.timestamp.localeCompare(a.interaction.timestamp));
    },
  },

  conversations: {
    listByUser: (userId: string, thesisId?: string) =>
      load()
        .conversations.filter((c) => c.userId === userId && (thesisId === undefined || c.thesisId === thesisId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    findById: (id: string) => load().conversations.find((c) => c.id === id),
    create: (userId: string, thesisId: string | undefined, title: string) => {
      const c: Conversation = { id: uid("conv"), userId, thesisId, title, messages: [], createdAt: now(), updatedAt: now() };
      load().conversations.push(c);
      persist();
      return c;
    },
    append: (id: string, msg: Omit<Conversation["messages"][number], "id" | "createdAt">) => {
      const c = load().conversations.find((x) => x.id === id);
      if (!c) return null;
      c.messages.push({ ...msg, id: uid("msg"), createdAt: now() });
      c.updatedAt = now();
      if (c.messages.length === 1 && msg.role === "user") c.title = msg.content.slice(0, 60);
      persist();
      return c;
    },
    remove: (id: string) => {
      const s = load();
      s.conversations = s.conversations.filter((c) => c.id !== id);
      persist();
    },
  },

  consents: {
    latest: (userId: string) => load().consents.filter((c) => c.userId === userId && !c.revokedAt).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0],
    list: (userId: string) => load().consents.filter((c) => c.userId === userId).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt)),
    grant: (data: Omit<Consent, "id" | "grantedAt">) => {
      const s = load();
      s.consents.filter((c) => c.userId === data.userId && !c.revokedAt).forEach((c) => (c.revokedAt = now()));
      const c: Consent = { ...data, id: uid("consent"), grantedAt: now() };
      s.consents.push(c);
      persist();
      return c;
    },
    revoke: (userId: string) => {
      load().consents.filter((c) => c.userId === userId && !c.revokedAt).forEach((c) => (c.revokedAt = now()));
      persist();
    },
  },

  policies: {
    get: (university: string): Policy => {
      const s = load();
      let p = s.policies.find((x) => x.university === university);
      if (!p) {
        p = { ...s.policies[0], university, updatedAt: now(), updatedBy: undefined };
        s.policies.push(p);
      }
      if (p.researchCopilot === undefined) p.researchCopilot = false;
      return p;
    },
    update: (university: string, patch: Partial<Policy>, updatedBy: string) => {
      const p = db.policies.get(university);
      Object.assign(p, patch, { university, updatedAt: now(), updatedBy });
      persist();
      return p;
    },
  },

  notifications: {
    getByUser: (userId: string) => load().notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    getUnreadCount: (userId: string) => load().notifications.filter((n) => n.userId === userId && !n.read).length,
    create: (data: Omit<Notification, "id" | "createdAt" | "read">) => {
      const n: Notification = { ...data, id: uid("notif"), createdAt: now(), read: false };
      load().notifications.push(n);
      persist();
      return n;
    },
    markRead: (userId: string, id?: string) => {
      load()
        .notifications.filter((n) => n.userId === userId && (!id || n.id === id))
        .forEach((n) => (n.read = true));
      persist();
    },
  },

  library: {
    list: (university: string) => load().researchDatabases.filter((d) => d.university === university).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name)),
    findById: (id: string) => load().researchDatabases.find((d) => d.id === id),
    create: (data: Omit<ResearchDatabase, "id" | "createdAt" | "updatedAt" | "opens">) => {
      const d: ResearchDatabase = { ...data, id: uid("rdb"), opens: 0, createdAt: now(), updatedAt: now() };
      load().researchDatabases.push(d);
      persist();
      return d;
    },
    update: (id: string, patch: Partial<ResearchDatabase>) => {
      const d = load().researchDatabases.find((x) => x.id === id);
      if (!d) return null;
      Object.assign(d, patch, { id: d.id, university: d.university, updatedAt: now() });
      persist();
      return d;
    },
    remove: (id: string) => {
      const s = load();
      s.researchDatabases = s.researchDatabases.filter((d) => d.id !== id);
      persist();
    },
    recordOpen: (id: string) => {
      const d = load().researchDatabases.find((x) => x.id === id);
      if (d) {
        d.opens += 1;
        persist();
      }
    },
    settings: (university: string): LibrarySettings => load().librarySettings.find((x) => x.university === university) || { university, updatedAt: now() },
    updateSettings: (university: string, patch: Partial<LibrarySettings>) => {
      const s = load();
      let x = s.librarySettings.find((l) => l.university === university);
      if (!x) {
        x = { university, updatedAt: now() };
        s.librarySettings.push(x);
      }
      Object.assign(x, patch, { university, updatedAt: now() });
      persist();
      return x;
    },
  },

  sources: {
    list: (thesisId: string) => load().sources.filter((s) => s.thesisId === thesisId).sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    findById: (id: string) => load().sources.find((s) => s.id === id),
    create: (data: Omit<ThesisSource, "id" | "addedAt">) => {
      const s: ThesisSource = { ...data, id: uid("src"), addedAt: now() };
      load().sources.push(s);
      persist();
      return s;
    },
    update: (id: string, patch: Partial<ThesisSource>) => {
      const s = load().sources.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, patch, { id: s.id, thesisId: s.thesisId });
      persist();
      return s;
    },
    remove: (id: string) => {
      const st = load();
      st.sources = st.sources.filter((s) => s.id !== id);
      persist();
    },
  },

  sourceChunks: {
    listBySource: (sourceId: string) => load().sourceChunks.filter((c) => c.sourceId === sourceId).sort((a, b) => a.index - b.index),
    listByThesis: (thesisId: string) => load().sourceChunks.filter((c) => c.thesisId === thesisId),
    replaceForSource: (sourceId: string, chunks: Omit<SourceChunk, "id">[]) => {
      const s = load();
      s.sourceChunks = s.sourceChunks.filter((c) => c.sourceId !== sourceId);
      const created = chunks.map((c) => ({ ...c, id: uid("chk") }));
      s.sourceChunks.push(...created);
      persist();
      return created;
    },
    removeForSource: (sourceId: string) => {
      const s = load();
      s.sourceChunks = s.sourceChunks.filter((c) => c.sourceId !== sourceId);
      persist();
    },
  },

  reviewRuns: {
    list: (thesisId: string) => load().reviewRuns.filter((r) => r.thesisId === thesisId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: (data: Omit<ReviewRun, "id" | "createdAt">) => {
      const r: ReviewRun = { ...data, id: uid("rev"), createdAt: now() };
      load().reviewRuns.push(r);
      persist();
      return r;
    },
  },

  snapshots: {
    list: (thesisId: string, tabId?: string) => load().snapshots.filter((s) => s.thesisId === thesisId && (!tabId || s.tabId === tabId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    latest: (thesisId: string, tabId: string) => load().snapshots.filter((s) => s.thesisId === thesisId && s.tabId === tabId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    create: (data: Omit<Snapshot, "id" | "createdAt">) => {
      const s = load();
      const snap: Snapshot = { ...data, id: uid("snap"), createdAt: now() };
      s.snapshots.push(snap);
      // keep memory bounded per thesis
      const mine = s.snapshots.filter((x) => x.thesisId === data.thesisId);
      if (mine.length > 600) {
        const drop = new Set(mine.slice(0, mine.length - 600).map((x) => x.id));
        s.snapshots = s.snapshots.filter((x) => !drop.has(x.id));
      }
      persist();
      return snap;
    },
  },

  declarations: {
    list: (thesisId: string) => load().declarations.filter((d) => d.thesisId === thesisId).sort((a, b) => b.version - a.version),
    create: (data: Omit<Declaration, "id" | "createdAt" | "version">) => {
      const list = load().declarations.filter((d) => d.thesisId === data.thesisId);
      const d: Declaration = { ...data, id: uid("decl"), version: list.length + 1, createdAt: now() };
      load().declarations.push(d);
      persist();
      return d;
    },
    update: (id: string, patch: Partial<Declaration>) => {
      const d = load().declarations.find((x) => x.id === id);
      if (!d) return null;
      Object.assign(d, patch, { id: d.id, thesisId: d.thesisId });
      persist();
      return d;
    },
  },

  evidenceChecks: {
    list: (thesisId: string) => load().evidenceChecks.filter((e) => e.thesisId === thesisId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: (data: Omit<EvidenceCheck, "id" | "createdAt">) => {
      const e: EvidenceCheck = { ...data, id: uid("evd"), createdAt: now() };
      load().evidenceChecks.push(e);
      persist();
      return e;
    },
  },

  languagePrefs: {
    get: (thesisId: string): LanguagePrefs => load().languagePrefs.find((p) => p.thesisId === thesisId) || { thesisId, language: "auto", mutedCategories: [], mutedRules: [], dictionary: [], updatedAt: now() },
    update: (thesisId: string, patch: Partial<LanguagePrefs>) => {
      const s = load();
      let p = s.languagePrefs.find((x) => x.thesisId === thesisId);
      if (!p) {
        p = { thesisId, language: "auto", mutedCategories: [], mutedRules: [], dictionary: [], updatedAt: now() };
        s.languagePrefs.push(p);
      }
      Object.assign(p, patch, { thesisId, updatedAt: now() });
      persist();
      return p;
    },
  },

  leads: {
    list: () => load().leads.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: (data: Omit<Lead, "id" | "createdAt">) => {
      const l: Lead = { ...data, id: uid("lead"), createdAt: now() };
      load().leads.push(l);
      persist();
      return l;
    },
  },

  aiAccess: {
    models: (university: string) => load().institutionModels.filter((m) => m.university === university).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label)),
    findModel: (id: string) => load().institutionModels.find((m) => m.id === id),
    createModel: (data: Omit<InstitutionModel, "id" | "createdAt" | "updatedAt">) => {
      const s = load();
      const m: InstitutionModel = { ...data, id: uid("im"), createdAt: now(), updatedAt: now() };
      if (m.isDefault) s.institutionModels.filter((x) => x.university === m.university).forEach((x) => (x.isDefault = false));
      s.institutionModels.push(m);
      persist();
      return m;
    },
    updateModel: (id: string, patch: Partial<InstitutionModel>) => {
      const s = load();
      const m = s.institutionModels.find((x) => x.id === id);
      if (!m) return null;
      if (patch.isDefault) s.institutionModels.filter((x) => x.university === m.university).forEach((x) => (x.isDefault = false));
      Object.assign(m, patch, { id: m.id, university: m.university, updatedAt: now() });
      persist();
      return m;
    },
    removeModel: (id: string) => {
      const s = load();
      s.institutionModels = s.institutionModels.filter((m) => m.id !== id);
      persist();
    },
    funding: (university: string): AIFunding => {
      const s = load();
      let f = s.aiFunding.find((x) => x.university === university);
      if (!f) {
        f = { university, institutionPays: false, currency: "EUR", usdRate: 0.86, monthlyBudget: 0, perStudentMonthly: 0, atLimit: "block", alertPercent: 80, updatedAt: now() };
        s.aiFunding.push(f);
      }
      return f;
    },
    updateFunding: (university: string, patch: Partial<AIFunding>, updatedBy?: string) => {
      const f = db.aiAccess.funding(university);
      Object.assign(f, patch, { university, updatedAt: now(), updatedBy: updatedBy ?? f.updatedBy });
      persist();
      return f;
    },
    /** Institution-paid interactions since the start of the current month (UTC). */
    monthUsage: (university: string, userId?: string) => {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      const since = start.toISOString();
      const ids = new Set(load().users.filter((u) => u.university === university).map((u) => u.id));
      return load().interactions.filter((i) => i.billedTo === "institution" && i.timestamp >= since && ids.has(i.userId) && (!userId || i.userId === userId));
    },
  },

};

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
