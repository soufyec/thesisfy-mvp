// In-memory database for MVP demo purposes
// In production, replace with PostgreSQL/Prisma

export interface User {
  id: string;
  email: string;
  password: string; // hashed
  name: string;
  role: "student" | "professor" | "admin";
  university: string;
  avatar?: string;
  createdAt: string;
}

export interface Thesis {
  id: string;
  title: string;
  description: string;
  studentId: string;
  professorId?: string;
  status: "draft" | "in_progress" | "under_review" | "revision_requested" | "approved" | "submitted";
  content: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  sessions: WritingSession[];
}

export interface WritingSession {
  id: string;
  thesisId: string;
  startedAt: string;
  endedAt?: string;
  wordsWritten: number;
  aiAssists: number;
  keystrokes: number;
  pasteEvents: number;
  integrityFlags: IntegrityFlag[];
}

export interface IntegrityFlag {
  id: string;
  type: "bulk_paste" | "ai_generation" | "style_inconsistency" | "rapid_typing" | "external_source";
  severity: "low" | "medium" | "high";
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "deadline";
  read: boolean;
  createdAt: string;
}

export interface FeedbackRequest {
  id: string;
  thesisId: string;
  studentId: string;
  professorId: string;
  section: string;
  message: string;
  status: "pending" | "reviewed" | "resolved";
  response?: string;
  createdAt: string;
  respondedAt?: string;
}

export interface Meeting {
  id: string;
  thesisId: string;
  studentId: string;
  professorId: string;
  title: string;
  description: string;
  proposedDate: string;
  duration: number; // minutes
  status: "pending" | "confirmed" | "declined" | "completed";
  location?: string;
  calendarLink?: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  thesisId: string;
  professorId: string;
  title: string;
  description: string;
  dueDate: string;
  expectations: string;
  hasFeedback: boolean;
  status: "upcoming" | "in_progress" | "completed" | "overdue";
  createdAt: string;
}

export interface WritingSnapshot {
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

export interface WritingReport {
  id: string;
  thesisId: string;
  generatedAt: string;
  totalWritingTime: number; // minutes
  totalSessions: number;
  wordsPerSession: number[];
  pasteEvents: PasteEvent[];
  aiUsageSummary: { category: string; count: number; percentage: number }[];
  keystrokePatterns: { hour: number; keystrokes: number }[];
  integrityScore: number;
}

export interface PasteEvent {
  id: string;
  thesisId: string;
  sessionId: string;
  timestamp: string;
  wordCount: number;
  content: string;
  wasModified: boolean;
  modificationPercent: number;
  sourceHint?: string;
}

export interface Rubric {
  id: string;
  thesisId: string;
  professorId: string;
  title: string;
  criteria: RubricCriterion[];
  createdAt: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  currentScore?: number;
  aiEvaluation?: string;
  weight: number;
}

export interface ReaderReaction {
  id: string;
  thesisId: string;
  section: string;
  reactions: { type: string; message: string; severity: "info" | "warning" | "suggestion" }[];
  generatedAt: string;
}

export interface AIChatLog {
  id: string;
  thesisId: string;
  studentId: string;
  sessionId: string;
  timestamp: string;
  userMessage: string;
  assistantMessage: string;
  category: "brainstorming" | "grammar" | "structure" | "research" | "citations" | "paraphrase" | "proofreading" | "other";
  tokensUsed: number;
}

export interface ResearchPaper {
  id: string;
  thesisId: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  volume?: string;
  pages?: string;
  doi?: string;
  abstract?: string;
  addedAt: string;
}

export interface FeatureToggle {
  id: string;
  name: string;
  description: string;
  category: "writing_tools" | "ai_tools" | "monitoring" | "evaluation";
  enabled: boolean;
}

// Demo data
const users: User[] = [
  {
    id: "usr_1",
    email: "jane.cooper@stanford.edu",
    password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", // demo123
    name: "Jane Cooper",
    role: "student",
    university: "Stanford University",
    avatar: "JC",
    createdAt: "2024-09-01T00:00:00Z",
  },
  {
    id: "usr_2",
    email: "admin@stanford.edu",
    password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", // admin123
    name: "Dr. Sarah Mitchell",
    role: "admin",
    university: "Stanford University",
    avatar: "SM",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "usr_3",
    email: "marie.dupont@sorbonne.fr",
    password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", // demo123
    name: "Marie Dupont",
    role: "student",
    university: "Sorbonne University",
    avatar: "MD",
    createdAt: "2024-09-15T00:00:00Z",
  },
  {
    id: "usr_4",
    email: "prof.williams@stanford.edu",
    password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", // demo123
    name: "Prof. James Williams",
    role: "professor",
    university: "Stanford University",
    avatar: "JW",
    createdAt: "2024-01-15T00:00:00Z",
  },
];

const theses: Thesis[] = [
  {
    id: "thesis_1",
    title: "Machine Learning Applications in Climate Change Prediction Models",
    description: "Exploring the use of deep learning architectures for improving climate prediction accuracy at regional scales.",
    studentId: "usr_1",
    professorId: "usr_4",
    status: "in_progress",
    content: `# Machine Learning Applications in Climate Change Prediction Models

## Abstract

Climate change represents one of the most significant challenges of our era. This thesis explores the application of modern machine learning techniques, particularly deep learning architectures, to improve the accuracy of climate change prediction models at regional scales.

## 1. Introduction

The increasing availability of climate data from satellites, weather stations, and ocean sensors has created unprecedented opportunities for data-driven approaches to climate modeling. Traditional physics-based models, while valuable, often struggle to capture the complex nonlinear interactions that govern regional climate patterns.

This research aims to bridge the gap between traditional climate science and modern machine learning by developing hybrid models that leverage the strengths of both approaches. We focus specifically on regional precipitation patterns and temperature anomalies in the Western United States.

## 2. Literature Review

### 2.1 Traditional Climate Models
General Circulation Models (GCMs) have been the backbone of climate prediction for decades. These models solve the fundamental equations of fluid dynamics and thermodynamics on a three-dimensional grid covering the Earth's surface and atmosphere.

### 2.2 Machine Learning in Climate Science
Recent advances in deep learning have shown promising results in weather forecasting and climate prediction. Convolutional Neural Networks (CNNs) have been particularly effective at capturing spatial patterns in climate data.

## 3. Methodology

Our approach combines a pre-trained climate model with a neural network correction layer. The architecture consists of:

1. **Data preprocessing pipeline**: Handling missing values, normalization, and spatial interpolation
2. **Feature extraction**: Using CNNs to extract relevant spatial features from climate data
3. **Temporal modeling**: Applying LSTM networks to capture long-term dependencies
4. **Hybrid integration**: Combining physics-based predictions with ML corrections

## 4. Preliminary Results

Initial experiments show a 23% improvement in regional temperature prediction accuracy compared to standalone GCM models. The hybrid approach is particularly effective for extreme weather events, where traditional models tend to underperform.`,
    wordCount: 2847,
    aiUsagePercent: 12,
    integrityScore: 94,
    deadline: "2026-06-15T00:00:00Z",
    createdAt: "2025-10-01T00:00:00Z",
    updatedAt: "2026-03-12T00:00:00Z",
    sessions: [
      {
        id: "sess_1",
        thesisId: "thesis_1",
        startedAt: "2026-03-12T09:00:00Z",
        endedAt: "2026-03-12T11:30:00Z",
        wordsWritten: 450,
        aiAssists: 3,
        keystrokes: 4200,
        pasteEvents: 2,
        integrityFlags: [],
      },
      {
        id: "sess_2",
        thesisId: "thesis_1",
        startedAt: "2026-03-10T14:00:00Z",
        endedAt: "2026-03-10T16:00:00Z",
        wordsWritten: 380,
        aiAssists: 5,
        keystrokes: 3800,
        pasteEvents: 1,
        integrityFlags: [
          {
            id: "flag_1",
            type: "style_inconsistency",
            severity: "low",
            description: "Minor style variation detected in paragraph 3 of section 2.2",
            timestamp: "2026-03-10T15:23:00Z",
            resolved: true,
          },
        ],
      },
    ],
  },
  {
    id: "thesis_2",
    title: "Blockchain-Based Academic Credential Verification Systems",
    description: "A decentralized approach to verifying academic credentials using blockchain technology.",
    studentId: "usr_1",
    professorId: "usr_4",
    status: "draft",
    content: "# Blockchain-Based Academic Credential Verification Systems\n\n## Abstract\n\nThis thesis proposes a novel blockchain-based system for verifying academic credentials...",
    wordCount: 520,
    aiUsagePercent: 5,
    integrityScore: 98,
    deadline: "2026-08-01T00:00:00Z",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    sessions: [],
  },
  {
    id: "thesis_3",
    title: "L'impact de l'intelligence artificielle sur l'éducation supérieure en France",
    description: "Analyse des transformations induites par l'IA dans le système universitaire français.",
    studentId: "usr_3",
    professorId: "usr_4",
    status: "under_review",
    content: "# L'impact de l'intelligence artificielle sur l'éducation supérieure en France\n\n## Résumé\n\nCette thèse examine les profondes transformations que l'intelligence artificielle apporte au paysage de l'enseignement supérieur en France...",
    wordCount: 15200,
    aiUsagePercent: 8,
    integrityScore: 96,
    deadline: "2026-05-01T00:00:00Z",
    createdAt: "2025-09-01T00:00:00Z",
    updatedAt: "2026-03-08T00:00:00Z",
    sessions: [],
  },
];

const notifications: Notification[] = [
  {
    id: "notif_1",
    userId: "usr_1",
    title: "Deadline Reminder",
    message: "Your thesis 'ML in Climate Change' deadline is in 93 days.",
    type: "deadline",
    read: false,
    createdAt: "2026-03-14T08:00:00Z",
  },
  {
    id: "notif_2",
    userId: "usr_1",
    title: "Review Feedback",
    message: "Prof. Williams left comments on your methodology section.",
    type: "info",
    read: false,
    createdAt: "2026-03-13T15:30:00Z",
  },
  {
    id: "notif_3",
    userId: "usr_1",
    title: "Integrity Score Updated",
    message: "Your integrity score for 'ML in Climate Change' increased to 94%.",
    type: "success",
    read: true,
    createdAt: "2026-03-12T12:00:00Z",
  },
];

const feedbackRequests: FeedbackRequest[] = [
  {
    id: "fb_1",
    thesisId: "thesis_1",
    studentId: "usr_1",
    professorId: "usr_4",
    section: "Chapter 2 - Literature Review",
    message: "I'm not sure if my coverage of traditional climate models is comprehensive enough. Could you review section 2.1 and suggest any key papers I might be missing?",
    status: "reviewed",
    response: "Good coverage overall. I'd suggest adding references to the IPCC AR6 models and the recent work by Schneider et al. (2023) on neural GCMs. Also consider discussing the limitations of parameterization in traditional models.",
    createdAt: "2026-03-08T10:00:00Z",
    respondedAt: "2026-03-09T14:30:00Z",
  },
  {
    id: "fb_2",
    thesisId: "thesis_1",
    studentId: "usr_1",
    professorId: "usr_4",
    section: "Chapter 3 - Methodology",
    message: "I've outlined my hybrid approach combining CNNs with LSTM networks. Is the architecture sound? Should I consider transformer-based alternatives?",
    status: "pending",
    createdAt: "2026-03-14T09:00:00Z",
  },
  {
    id: "fb_3",
    thesisId: "thesis_3",
    studentId: "usr_3",
    professorId: "usr_4",
    section: "Chapitre 1 - Introduction",
    message: "J'aimerais avoir votre avis sur la problématique de recherche. Est-elle suffisamment ciblée?",
    status: "pending",
    createdAt: "2026-03-12T11:00:00Z",
  },
];

const meetings: Meeting[] = [
  {
    id: "meet_1",
    thesisId: "thesis_1",
    studentId: "usr_1",
    professorId: "usr_4",
    title: "Methodology Review Session",
    description: "Discuss the hybrid ML approach and review preliminary results from the CNN-LSTM architecture.",
    proposedDate: "2026-03-20T14:00:00Z",
    duration: 45,
    status: "confirmed",
    location: "Office 312, Gates Building",
    calendarLink: "https://calendar.google.com",
    createdAt: "2026-03-13T08:00:00Z",
  },
  {
    id: "meet_2",
    thesisId: "thesis_1",
    studentId: "usr_1",
    professorId: "usr_4",
    title: "Mid-semester Progress Check",
    description: "General progress review and timeline adjustment for remaining chapters.",
    proposedDate: "2026-04-05T10:00:00Z",
    duration: 30,
    status: "pending",
    createdAt: "2026-03-15T09:00:00Z",
  },
  {
    id: "meet_3",
    thesisId: "thesis_3",
    studentId: "usr_3",
    professorId: "usr_4",
    title: "Revue de structure de la thèse",
    description: "Discuter de la structure globale et de l'avancement des chapitres.",
    proposedDate: "2026-03-22T11:00:00Z",
    duration: 60,
    status: "pending",
    createdAt: "2026-03-14T16:00:00Z",
  },
];

const milestones: Milestone[] = [
  {
    id: "ms_1",
    thesisId: "thesis_1",
    professorId: "usr_4",
    title: "Literature Review Complete",
    description: "Complete and submit the full literature review chapter.",
    dueDate: "2026-03-25T23:59:00Z",
    expectations: "Minimum 30 peer-reviewed sources. Cover traditional climate models, ML applications in climate science, and hybrid approaches. Include a gap analysis showing where your research fits.",
    hasFeedback: true,
    status: "in_progress",
    createdAt: "2025-10-01T00:00:00Z",
  },
  {
    id: "ms_2",
    thesisId: "thesis_1",
    professorId: "usr_4",
    title: "Methodology & Experimental Design",
    description: "Define and document the complete methodology including data sources, model architecture, and evaluation metrics.",
    dueDate: "2026-04-15T23:59:00Z",
    expectations: "Clearly describe the CNN-LSTM architecture, training data pipeline, hyperparameter selection strategy, and baseline models for comparison. Include reproducibility details.",
    hasFeedback: true,
    status: "upcoming",
    createdAt: "2025-10-01T00:00:00Z",
  },
  {
    id: "ms_3",
    thesisId: "thesis_1",
    professorId: "usr_4",
    title: "Experimental Results & Analysis",
    description: "Run experiments and present results with statistical analysis.",
    dueDate: "2026-05-15T23:59:00Z",
    expectations: "Present results with confidence intervals. Compare against at least 3 baseline methods. Include ablation studies for key architectural decisions.",
    hasFeedback: false,
    status: "upcoming",
    createdAt: "2025-10-01T00:00:00Z",
  },
  {
    id: "ms_4",
    thesisId: "thesis_1",
    professorId: "usr_4",
    title: "Final Draft Submission",
    description: "Submit the complete thesis draft for final review.",
    dueDate: "2026-06-01T23:59:00Z",
    expectations: "Complete thesis with all chapters, properly formatted references, and abstract. Minimum 20,000 words. All figures and tables must have captions and be referenced in text.",
    hasFeedback: true,
    status: "upcoming",
    createdAt: "2025-10-01T00:00:00Z",
  },
  {
    id: "ms_5",
    thesisId: "thesis_3",
    professorId: "usr_4",
    title: "Revue de littérature",
    description: "Soumettre la revue de littérature complète.",
    dueDate: "2026-03-20T23:59:00Z",
    expectations: "Couvrir les principaux travaux sur l'IA dans l'éducation en France et à l'international. Minimum 25 sources académiques.",
    hasFeedback: true,
    status: "completed",
    createdAt: "2025-09-01T00:00:00Z",
  },
];

const writingSnapshots: WritingSnapshot[] = [
  { id: "snap_1", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:05:00Z", action: "typed", position: 0, content: "Climate change represents one of the most significant challenges", wordCount: 10, },
  { id: "snap_2", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:12:00Z", action: "typed", position: 65, content: " of our era. This thesis explores the application of modern machine learning techniques", wordCount: 14, },
  { id: "snap_3", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:25:00Z", action: "pasted", position: 800, content: "General Circulation Models (GCMs) have been the backbone of climate prediction for decades. These models solve the fundamental equations of fluid dynamics and thermodynamics on a three-dimensional grid.", wordCount: 31, metadata: { pasteSize: 31, pasteModified: true, sourceHint: "Wikipedia - General Circulation Model" } },
  { id: "snap_4", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:45:00Z", action: "typed", position: 1200, content: "Recent advances in deep learning have shown promising results in weather forecasting", wordCount: 12, },
  { id: "snap_5", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T10:05:00Z", action: "ai_insert", position: 1500, content: "[Suggested restructuring of methodology section outline]", wordCount: 6, },
  { id: "snap_6", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T10:30:00Z", action: "deleted", position: 400, content: "", wordCount: 0, metadata: { deletedText: "an outdated paragraph about early climate models" } },
  { id: "snap_7", thesisId: "thesis_1", sessionId: "sess_2", timestamp: "2026-03-10T14:10:00Z", action: "typed", position: 1800, content: "Our approach combines a pre-trained climate model with a neural network correction layer", wordCount: 14, },
  { id: "snap_8", thesisId: "thesis_1", sessionId: "sess_2", timestamp: "2026-03-10T14:35:00Z", action: "pasted", position: 2200, content: "Convolutional Neural Networks (CNNs) have been particularly effective at capturing spatial patterns in climate data, as demonstrated by Reichstein et al. (2019) and Weyn et al. (2020).", wordCount: 27, metadata: { pasteSize: 27, pasteModified: false, sourceHint: "Research notes document" } },
  { id: "snap_9", thesisId: "thesis_1", sessionId: "sess_2", timestamp: "2026-03-10T15:15:00Z", action: "typed", position: 2600, content: "The hybrid integration layer combines physics-based predictions with ML corrections using an attention mechanism", wordCount: 15, },
];

const writingReports: WritingReport[] = [
  {
    id: "wr_1",
    thesisId: "thesis_1",
    generatedAt: "2026-03-13T00:00:00Z",
    totalWritingTime: 270,
    totalSessions: 8,
    wordsPerSession: [450, 380, 520, 310, 280, 430, 490, 360],
    pasteEvents: [
      { id: "pe_1", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:25:00Z", wordCount: 31, content: "General Circulation Models (GCMs) have been the backbone...", wasModified: true, modificationPercent: 35, sourceHint: "Wikipedia - General Circulation Model" },
      { id: "pe_2", thesisId: "thesis_1", sessionId: "sess_2", timestamp: "2026-03-10T14:35:00Z", wordCount: 27, content: "Convolutional Neural Networks (CNNs) have been particularly...", wasModified: false, modificationPercent: 0, sourceHint: "Research notes document" },
      { id: "pe_3", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T10:45:00Z", wordCount: 12, content: "data-driven approaches to climate modeling...", wasModified: true, modificationPercent: 60, sourceHint: "Own draft v1" },
    ],
    aiUsageSummary: [
      { category: "Brainstorming", count: 8, percentage: 30 },
      { category: "Grammar & Style", count: 6, percentage: 22 },
      { category: "Structure Help", count: 5, percentage: 19 },
      { category: "Research Guidance", count: 4, percentage: 15 },
      { category: "Citations", count: 3, percentage: 11 },
      { category: "Proofreading", count: 1, percentage: 3 },
    ],
    keystrokePatterns: [
      { hour: 9, keystrokes: 1200 }, { hour: 10, keystrokes: 1800 }, { hour: 11, keystrokes: 1400 },
      { hour: 14, keystrokes: 900 }, { hour: 15, keystrokes: 1600 }, { hour: 16, keystrokes: 800 },
    ],
    integrityScore: 94,
  },
];

const pasteEvents: PasteEvent[] = [
  { id: "pe_1", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T09:25:00Z", wordCount: 31, content: "General Circulation Models (GCMs) have been the backbone of climate prediction for decades. These models solve the fundamental equations of fluid dynamics and thermodynamics on a three-dimensional grid.", wasModified: true, modificationPercent: 35, sourceHint: "Wikipedia - General Circulation Model" },
  { id: "pe_2", thesisId: "thesis_1", sessionId: "sess_2", timestamp: "2026-03-10T14:35:00Z", wordCount: 27, content: "Convolutional Neural Networks (CNNs) have been particularly effective at capturing spatial patterns in climate data, as demonstrated by Reichstein et al. (2019) and Weyn et al. (2020).", wasModified: false, modificationPercent: 0, sourceHint: "Research notes document" },
  { id: "pe_3", thesisId: "thesis_1", sessionId: "sess_1", timestamp: "2026-03-12T10:45:00Z", wordCount: 12, content: "data-driven approaches to climate modeling that leverage both observational data and physical constraints", wasModified: true, modificationPercent: 60, sourceHint: "Own draft v1" },
];

const rubrics: Rubric[] = [
  {
    id: "rub_1",
    thesisId: "thesis_1",
    professorId: "usr_4",
    title: "ML Climate Prediction Thesis Rubric",
    criteria: [
      { id: "rc_1", name: "Literature Review Quality", description: "Comprehensive coverage of existing work, proper citations, identifies research gaps", maxScore: 20, currentScore: 16, aiEvaluation: "Good coverage of traditional models and ML approaches. Consider adding more recent 2025-2026 papers on foundation models for weather prediction.", weight: 20 },
      { id: "rc_2", name: "Methodology Rigor", description: "Clear description of methods, reproducibility, justification of choices", maxScore: 25, currentScore: 18, aiEvaluation: "Architecture is well-described but lacks ablation study plan. Hyperparameter selection strategy needs more detail.", weight: 25 },
      { id: "rc_3", name: "Writing Quality", description: "Clarity, structure, academic tone, grammar", maxScore: 15, currentScore: 13, aiEvaluation: "Strong academic writing. Minor issues with transition paragraphs between sections 2 and 3.", weight: 15 },
      { id: "rc_4", name: "Technical Depth", description: "Depth of analysis, mathematical formulations, implementation details", maxScore: 25, currentScore: 15, aiEvaluation: "Good mathematical foundations. CNN architecture details are strong. LSTM temporal modeling section needs more depth on sequence length selection.", weight: 25 },
      { id: "rc_5", name: "Results & Discussion", description: "Statistical analysis, comparison with baselines, interpretation", maxScore: 15, currentScore: 8, aiEvaluation: "Preliminary results are promising. Needs confidence intervals, statistical tests, and more baseline comparisons.", weight: 15 },
    ],
    createdAt: "2025-10-15T00:00:00Z",
  },
];

const readerReactions: ReaderReaction[] = [
  {
    id: "rr_1",
    thesisId: "thesis_1",
    section: "Abstract",
    reactions: [
      { type: "clarity", message: "The abstract clearly states the problem and approach. Well-structured.", severity: "info" },
      { type: "missing_info", message: "Consider adding specific metrics or results to give readers a preview of your findings.", severity: "suggestion" },
    ],
    generatedAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "rr_2",
    thesisId: "thesis_1",
    section: "Chapter 2 - Literature Review",
    reactions: [
      { type: "strength", message: "The distinction between GCMs and ML approaches is clearly presented.", severity: "info" },
      { type: "gap", message: "A reader might wonder about transformer-based weather models (e.g., Pangu-Weather, GraphCast) which are not discussed.", severity: "warning" },
      { type: "flow", message: "The transition from section 2.1 to 2.2 feels abrupt. Consider a bridging paragraph.", severity: "suggestion" },
    ],
    generatedAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "rr_3",
    thesisId: "thesis_1",
    section: "Chapter 3 - Methodology",
    reactions: [
      { type: "question", message: "A reviewer would likely ask: why CNN-LSTM instead of a transformer architecture?", severity: "warning" },
      { type: "strength", message: "The 4-step pipeline is well-organized and easy to follow.", severity: "info" },
      { type: "missing_info", message: "What dataset will be used? Expected size and time range should be specified.", severity: "warning" },
      { type: "suggestion", message: "Consider adding a diagram of the hybrid architecture for visual clarity.", severity: "suggestion" },
    ],
    generatedAt: "2026-03-15T10:00:00Z",
  },
];

const aiChatLogs: AIChatLog[] = [
  { id: "acl_1", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_1", timestamp: "2026-03-12T09:08:00Z", userMessage: "What are the key differences between GCMs and statistical downscaling?", assistantMessage: "GCMs operate on physical principles solving fluid dynamics equations on a global grid, while statistical downscaling uses empirical relationships...", category: "research", tokensUsed: 450 },
  { id: "acl_2", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_1", timestamp: "2026-03-12T09:30:00Z", userMessage: "Can you help me outline the methodology section?", assistantMessage: "Here's a suggested outline for your methodology: 1) Data Collection & Preprocessing, 2) Feature Engineering...", category: "structure", tokensUsed: 380 },
  { id: "acl_3", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_1", timestamp: "2026-03-12T10:00:00Z", userMessage: "Check this paragraph for grammar and clarity", assistantMessage: "The paragraph is generally well-written. A few suggestions: 1) 'data which is' → 'data that are' (academic convention)...", category: "grammar", tokensUsed: 290 },
  { id: "acl_4", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_2", timestamp: "2026-03-10T14:15:00Z", userMessage: "Help me brainstorm evaluation metrics for climate prediction", assistantMessage: "Key evaluation metrics for climate prediction models include: RMSE for temperature, Brier Score for precipitation probability...", category: "brainstorming", tokensUsed: 520 },
  { id: "acl_5", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_2", timestamp: "2026-03-10T15:00:00Z", userMessage: "What's the proper APA citation for Reichstein et al 2019 nature paper?", assistantMessage: "Reichstein, M., Camps-Valls, G., Stevens, B., Jung, M., Denzler, J., Carvalhais, N., & Prabhat. (2019). Deep learning and process understanding for data-driven Earth system science. Nature, 566(7743), 195-204.", category: "citations", tokensUsed: 200 },
  { id: "acl_6", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_2", timestamp: "2026-03-10T15:30:00Z", userMessage: "Can you rephrase this in a more academic tone: 'The model works pretty well for extreme weather'", assistantMessage: "Here are some academic alternatives: 'The model demonstrates particularly robust performance in predicting extreme weather events'...", category: "paraphrase", tokensUsed: 180 },
  { id: "acl_7", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_1", timestamp: "2026-03-12T10:20:00Z", userMessage: "Find me relevant papers about hybrid ML-physics climate models", assistantMessage: "Here are key papers on hybrid approaches: 1) Schneider et al. (2023) - Neural General Circulation Models...", category: "research", tokensUsed: 600 },
  { id: "acl_8", thesisId: "thesis_1", studentId: "usr_1", sessionId: "sess_1", timestamp: "2026-03-12T11:00:00Z", userMessage: "Proofread section 2.2 for any issues", assistantMessage: "Section 2.2 review: Found 3 minor issues: 1) Comma splice in paragraph 2, 2) 'which' should be 'that' in a restrictive clause...", category: "proofreading", tokensUsed: 340 },
];

const featureToggles: FeatureToggle[] = [
  { id: "ft_1", name: "writing_playback", description: "Writing Process Playback — Replay the student's entire writing process step by step", category: "monitoring", enabled: true },
  { id: "ft_2", name: "writing_report", description: "Writing Report — Auto-generated report with writing metrics, paste events, and session data", category: "monitoring", enabled: true },
  { id: "ft_3", name: "paste_detection", description: "Paste Detection — Detect and analyze copy/paste events with source hints and modification tracking", category: "monitoring", enabled: true },
  { id: "ft_4", name: "citation_finder", description: "Citation Finder — AI-powered academic source search with formatted citations (APA, MLA, Chicago)", category: "ai_tools", enabled: true },
  { id: "ft_5", name: "smart_proofreader", description: "Smart Proofreader — Inline grammar, clarity, and academic tone corrections in the editor", category: "writing_tools", enabled: true },
  { id: "ft_6", name: "academic_paraphraser", description: "Academic Paraphraser — Rephrase text to match academic tone and style while preserving meaning", category: "writing_tools", enabled: true },
  { id: "ft_7", name: "rubric_evaluator", description: "Rubric Evaluator — AI evaluates thesis progress against professor-defined rubrics", category: "evaluation", enabled: true },
  { id: "ft_8", name: "reader_reactions", description: "Reader Reactions — AI predicts how evaluators might interpret and react to each section", category: "evaluation", enabled: false },
  { id: "ft_9", name: "ai_chat_activity", description: "AI Chat Activity Report — Detailed logs and categorized summary of all AI interactions", category: "monitoring", enabled: true },
];

const researchPapers: ResearchPaper[] = [
  {
    id: "rp_1",
    thesisId: "thesis_1",
    title: "Deep learning and process understanding for data-driven Earth system science",
    authors: "Reichstein, M., Camps-Valls, G., Stevens, B., Jung, M., Denzler, J., Carvalhais, N., & Prabhat",
    year: 2019,
    journal: "Nature",
    volume: "566(7743)",
    pages: "195-204",
    doi: "10.1038/s41586-019-0912-1",
    abstract: "Machine learning approaches are increasingly used to extract patterns and insights from the ever-increasing stream of geospatial data, but current approaches may not be optimal when dealing with spatial and temporal richness of Earth system data.",
    addedAt: "2025-11-01T00:00:00Z",
  },
  {
    id: "rp_2",
    thesisId: "thesis_1",
    title: "Can deep learning beat numerical weather prediction?",
    authors: "Schultz, M.G., Betancourt, C., Gong, B., Kleinert, F., Langguth, M., Leufen, L.H., Mozaffari, A., & Stadtler, S.",
    year: 2021,
    journal: "Phil. Trans. R. Soc. A",
    volume: "379(2194)",
    pages: "20200097",
    doi: "10.1098/rsta.2020.0097",
    abstract: "This paper reviews the state of the art in applying deep learning to weather prediction and asks whether data-driven approaches can outperform traditional numerical weather prediction models.",
    addedAt: "2025-11-15T00:00:00Z",
  },
  {
    id: "rp_3",
    thesisId: "thesis_1",
    title: "Pangu-Weather: A 3D high-resolution model for fast and accurate global weather forecast",
    authors: "Bi, K., Xie, L., Zhang, H., Chen, X., Gu, X., & Tian, Q.",
    year: 2023,
    journal: "Nature",
    volume: "619",
    pages: "533-538",
    doi: "10.1038/s41586-023-06185-3",
    abstract: "We introduce Pangu-Weather, a 3D deep learning model for global weather prediction that provides fast and accurate forecasts using 3D neural networks and hierarchical temporal aggregation.",
    addedAt: "2025-12-01T00:00:00Z",
  },
  {
    id: "rp_4",
    thesisId: "thesis_1",
    title: "GraphCast: Learning skillful medium-range global weather forecasting",
    authors: "Lam, R., Sanchez-Gonzalez, A., Willson, M., Wirber, P., Fortunato, M., Alet, F., Ravuri, S., Ewalds, T., et al.",
    year: 2023,
    journal: "Science",
    volume: "382(6677)",
    pages: "1416-1421",
    doi: "10.1126/science.adi2336",
    abstract: "GraphCast is a machine learning-based weather forecasting model that outperforms the world's best deterministic operational medium-range weather forecasting system.",
    addedAt: "2025-12-10T00:00:00Z",
  },
  {
    id: "rp_5",
    thesisId: "thesis_1",
    title: "Climate informatics: accelerating discovering in climate science with machine learning",
    authors: "Monteleoni, C., Schmidt, G.A., & McQuade, S.",
    year: 2013,
    journal: "Computing in Science & Engineering",
    volume: "15(5)",
    pages: "32-40",
    doi: "10.1109/MCSE.2013.50",
    abstract: "This paper reviews how machine learning and data mining techniques can accelerate discovery in climate science through improved predictions and pattern recognition.",
    addedAt: "2026-01-05T00:00:00Z",
  },
  {
    id: "rp_6",
    thesisId: "thesis_1",
    title: "Neural General Circulation Models for Weather and Climate",
    authors: "Schneider, T., Behera, S., Boccaletti, G., Deser, C., Emanuel, K., Ferrari, R., Leung, L.R., Lin, N., & Wills, R.C.",
    year: 2023,
    journal: "Nature Reviews Earth & Environment",
    volume: "4",
    pages: "1-14",
    doi: "10.1038/s43017-023-00489-0",
    abstract: "Neural GCMs combine traditional climate models with machine learning to improve parameterization of subgrid-scale processes, offering a promising path for next-generation climate models.",
    addedAt: "2026-01-20T00:00:00Z",
  },
];

// Database operations
export const db = {
  users: {
    findByEmail: (email: string) => users.find((u) => u.email === email),
    findById: (id: string) => users.find((u) => u.id === id),
    getAll: () => users.map(({ password: _, ...user }) => user),
    getByUniversity: (uni: string) => users.filter((u) => u.university === uni).map(({ password: _, ...u }) => u),
  },
  theses: {
    findById: (id: string) => theses.find((t) => t.id === id),
    getByStudent: (studentId: string) => theses.filter((t) => t.studentId === studentId),
    getByProfessor: (profId: string) => theses.filter((t) => t.professorId === profId),
    getAll: () => theses,
    getStats: () => ({
      total: theses.length,
      inProgress: theses.filter((t) => t.status === "in_progress").length,
      underReview: theses.filter((t) => t.status === "under_review").length,
      approved: theses.filter((t) => t.status === "approved").length,
      avgIntegrity: Math.round(theses.reduce((sum, t) => sum + t.integrityScore, 0) / theses.length),
      avgAiUsage: Math.round(theses.reduce((sum, t) => sum + t.aiUsagePercent, 0) / theses.length),
    }),
    create: (thesis: Thesis) => { theses.push(thesis); return thesis; },
    update: (id: string, data: Partial<Thesis>) => {
      const thesis = theses.find((t) => t.id === id);
      if (!thesis) return undefined;
      Object.assign(thesis, data, { updatedAt: new Date().toISOString() });
      return thesis;
    },
  },
  notifications: {
    getByUser: (userId: string) => notifications.filter((n) => n.userId === userId),
    getUnreadCount: (userId: string) => notifications.filter((n) => n.userId === userId && !n.read).length,
  },
  feedback: {
    getAll: () => feedbackRequests,
    getByStudent: (studentId: string) => feedbackRequests.filter((f) => f.studentId === studentId),
    getByProfessor: (professorId: string) => feedbackRequests.filter((f) => f.professorId === professorId),
    getByThesis: (thesisId: string) => feedbackRequests.filter((f) => f.thesisId === thesisId),
    findById: (id: string) => feedbackRequests.find((f) => f.id === id),
    create: (fb: FeedbackRequest) => { feedbackRequests.push(fb); return fb; },
  },
  meetings: {
    getAll: () => meetings,
    getByStudent: (studentId: string) => meetings.filter((m) => m.studentId === studentId),
    getByProfessor: (professorId: string) => meetings.filter((m) => m.professorId === professorId),
    getByThesis: (thesisId: string) => meetings.filter((m) => m.thesisId === thesisId),
    findById: (id: string) => meetings.find((m) => m.id === id),
    create: (m: Meeting) => { meetings.push(m); return m; },
  },
  milestones: {
    getAll: () => milestones,
    getByThesis: (thesisId: string) => milestones.filter((m) => m.thesisId === thesisId),
    getByProfessor: (professorId: string) => milestones.filter((m) => m.professorId === professorId),
    findById: (id: string) => milestones.find((m) => m.id === id),
    create: (m: Milestone) => { milestones.push(m); return m; },
  },
  writingSnapshots: {
    getByThesis: (thesisId: string) => writingSnapshots.filter((s) => s.thesisId === thesisId),
    getBySession: (sessionId: string) => writingSnapshots.filter((s) => s.sessionId === sessionId),
    create: (snapshot: WritingSnapshot) => { writingSnapshots.push(snapshot); return snapshot; },
  },
  writingReports: {
    getByThesis: (thesisId: string) => writingReports.find((r) => r.thesisId === thesisId),
    getAll: () => writingReports,
  },
  pasteEvents: {
    getByThesis: (thesisId: string) => pasteEvents.filter((p) => p.thesisId === thesisId),
    getBySession: (sessionId: string) => pasteEvents.filter((p) => p.sessionId === sessionId),
    create: (event: PasteEvent) => { pasteEvents.push(event); return event; },
  },
  rubrics: {
    getAll: () => rubrics,
    getByThesis: (thesisId: string) => rubrics.find((r) => r.thesisId === thesisId),
    getByProfessor: (professorId: string) => rubrics.filter((r) => r.professorId === professorId),
    findById: (id: string) => rubrics.find((r) => r.id === id),
    create: (r: Rubric) => { rubrics.push(r); return r; },
  },
  readerReactions: {
    getByThesis: (thesisId: string) => readerReactions.filter((r) => r.thesisId === thesisId),
    getBySection: (thesisId: string, section: string) => readerReactions.find((r) => r.thesisId === thesisId && r.section === section),
  },
  aiChatLogs: {
    getAll: () => aiChatLogs,
    getByThesis: (thesisId: string) => aiChatLogs.filter((l) => l.thesisId === thesisId),
    getByStudent: (studentId: string) => aiChatLogs.filter((l) => l.studentId === studentId),
    getByCategory: (category: string) => aiChatLogs.filter((l) => l.category === category),
  },
  researchPapers: {
    getByThesis: (thesisId: string) => researchPapers.filter((p) => p.thesisId === thesisId),
    findById: (id: string) => researchPapers.find((p) => p.id === id),
    create: (paper: ResearchPaper) => { researchPapers.push(paper); return paper; },
  },
  featureToggles: {
    getAll: () => featureToggles,
    getEnabled: () => featureToggles.filter((f) => f.enabled),
    isEnabled: (name: string) => featureToggles.find((f) => f.name === name)?.enabled ?? false,
    toggle: (id: string, enabled: boolean) => {
      const ft = featureToggles.find((f) => f.id === id);
      if (ft) ft.enabled = enabled;
      return ft;
    },
  },
};
