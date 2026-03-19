#!/usr/bin/env npx ts-node
/**
 * Firestore Seed Script
 *
 * Seeds the Firestore database with demo data matching the in-memory db.
 *
 * Usage:
 *   1. Set environment variables (FIREBASE_PROJECT_ID, etc.) or
 *      set FIREBASE_SERVICE_ACCOUNT_KEY to path of your service account JSON
 *   2. Run: npx ts-node scripts/seed-firestore.ts
 *
 * This will populate Firestore collections:
 *   users, theses, notifications, feedback, meetings, milestones,
 *   writingSnapshots, writingReports, pasteEvents, rubrics,
 *   readerReactions, aiChatLogs, featureToggles, researchPapers
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (serviceAccountPath) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else if (projectId) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  } else {
    admin.initializeApp({ projectId });
  }
} else {
  console.error("ERROR: Set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY");
  process.exit(1);
}

const db = admin.firestore();

// ============================================================
// Demo data (matches src/lib/db.ts)
// ============================================================

const users = [
  { id: "usr_1", email: "jane.cooper@stanford.edu", password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", name: "Jane Cooper", role: "student", university: "Stanford University", avatar: "JC", createdAt: "2024-09-01T00:00:00Z" },
  { id: "usr_2", email: "admin@stanford.edu", password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", name: "Dr. Sarah Mitchell", role: "admin", university: "Stanford University", avatar: "SM", createdAt: "2024-01-01T00:00:00Z" },
  { id: "usr_3", email: "marie.dupont@sorbonne.fr", password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", name: "Marie Dupont", role: "student", university: "Sorbonne University", avatar: "MD", createdAt: "2024-09-15T00:00:00Z" },
  { id: "usr_4", email: "prof.williams@stanford.edu", password: "$2a$10$XQxBj1DGDlpOI/YqgXmQxOZvGjCH1WPo0XrVELGk1IVUbSMqP1Sbe", name: "Prof. James Williams", role: "professor", university: "Stanford University", avatar: "JW", createdAt: "2024-01-15T00:00:00Z" },
];

const theses = [
  {
    id: "thesis_1", title: "Machine Learning Applications in Climate Change Prediction Models",
    description: "Exploring the use of deep learning architectures for improving climate prediction accuracy at regional scales.",
    studentId: "usr_1", professorId: "usr_4", status: "in_progress",
    content: `# Machine Learning Applications in Climate Change Prediction Models\n\n## Abstract\n\nClimate change represents one of the most significant challenges of our era. This thesis explores the application of modern machine learning techniques, particularly deep learning architectures, to improve the accuracy of climate change prediction models at regional scales.\n\n## 1. Introduction\n\nThe increasing availability of climate data from satellites, weather stations, and ocean sensors has created unprecedented opportunities for data-driven approaches to climate modeling.`,
    wordCount: 2847, aiUsagePercent: 12, integrityScore: 94,
    deadline: "2026-06-15T00:00:00Z", createdAt: "2025-10-01T00:00:00Z", updatedAt: "2026-03-12T00:00:00Z",
    sessions: [],
  },
  {
    id: "thesis_2", title: "Blockchain-Based Academic Credential Verification Systems",
    description: "A decentralized approach to verifying academic credentials using blockchain technology.",
    studentId: "usr_1", professorId: "usr_4", status: "draft",
    content: "# Blockchain-Based Academic Credential Verification Systems\n\n## Abstract\n\nThis thesis proposes a novel blockchain-based system for verifying academic credentials...",
    wordCount: 520, aiUsagePercent: 5, integrityScore: 98,
    deadline: "2026-08-01T00:00:00Z", createdAt: "2026-01-15T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z",
    sessions: [],
  },
  {
    id: "thesis_3", title: "L'impact de l'intelligence artificielle sur l'éducation supérieure en France",
    description: "Analyse des transformations induites par l'IA dans le système universitaire français.",
    studentId: "usr_3", professorId: "usr_4", status: "under_review",
    content: "# L'impact de l'intelligence artificielle sur l'éducation supérieure en France\n\n## Résumé\n\nCette thèse examine les profondes transformations...",
    wordCount: 15200, aiUsagePercent: 8, integrityScore: 96,
    deadline: "2026-05-01T00:00:00Z", createdAt: "2025-09-01T00:00:00Z", updatedAt: "2026-03-08T00:00:00Z",
    sessions: [],
  },
];

const featureToggles = [
  { id: "ft_1", name: "writing_playback", description: "Writing Process Playback", category: "monitoring", enabled: true },
  { id: "ft_2", name: "writing_report", description: "Writing Report", category: "monitoring", enabled: true },
  { id: "ft_3", name: "paste_detection", description: "Paste Detection", category: "monitoring", enabled: true },
  { id: "ft_4", name: "citation_finder", description: "Citation Finder", category: "ai_tools", enabled: true },
  { id: "ft_5", name: "smart_proofreader", description: "Smart Proofreader", category: "writing_tools", enabled: true },
  { id: "ft_6", name: "academic_paraphraser", description: "Academic Paraphraser", category: "writing_tools", enabled: true },
  { id: "ft_7", name: "rubric_evaluator", description: "Rubric Evaluator", category: "evaluation", enabled: true },
  { id: "ft_8", name: "reader_reactions", description: "Reader Reactions", category: "evaluation", enabled: false },
  { id: "ft_9", name: "ai_chat_activity", description: "AI Chat Activity Report", category: "monitoring", enabled: true },
];

const researchPapers = [
  { id: "rp_1", thesisId: "thesis_1", title: "Deep learning and process understanding for data-driven Earth system science", authors: "Reichstein, M., Camps-Valls, G., Stevens, B., et al.", year: 2019, journal: "Nature", volume: "566(7743)", pages: "195-204", doi: "10.1038/s41586-019-0912-1", abstract: "Machine learning approaches are increasingly used to extract patterns and insights from geospatial data.", addedAt: "2025-11-01T00:00:00Z" },
  { id: "rp_2", thesisId: "thesis_1", title: "Can deep learning beat numerical weather prediction?", authors: "Schultz, M.G., Betancourt, C., Gong, B., et al.", year: 2021, journal: "Phil. Trans. R. Soc. A", volume: "379(2194)", pages: "20200097", doi: "10.1098/rsta.2020.0097", abstract: "Reviews deep learning applications in weather prediction.", addedAt: "2025-11-15T00:00:00Z" },
  { id: "rp_3", thesisId: "thesis_1", title: "Pangu-Weather: A 3D high-resolution model for fast and accurate global weather forecast", authors: "Bi, K., Xie, L., Zhang, H., et al.", year: 2023, journal: "Nature", volume: "619", pages: "533-538", doi: "10.1038/s41586-023-06185-3", abstract: "3D deep learning model for global weather prediction.", addedAt: "2025-12-01T00:00:00Z" },
  { id: "rp_4", thesisId: "thesis_1", title: "GraphCast: Learning skillful medium-range global weather forecasting", authors: "Lam, R., Sanchez-Gonzalez, A., et al.", year: 2023, journal: "Science", volume: "382(6677)", pages: "1416-1421", doi: "10.1126/science.adi2336", abstract: "ML-based weather forecasting model outperforming operational systems.", addedAt: "2025-12-10T00:00:00Z" },
  { id: "rp_5", thesisId: "thesis_1", title: "Climate informatics: accelerating discovering in climate science with machine learning", authors: "Monteleoni, C., Schmidt, G.A., McQuade, S.", year: 2013, journal: "Computing in Science & Engineering", volume: "15(5)", pages: "32-40", doi: "10.1109/MCSE.2013.50", abstract: "ML and data mining techniques for climate science.", addedAt: "2026-01-05T00:00:00Z" },
  { id: "rp_6", thesisId: "thesis_1", title: "Neural General Circulation Models for Weather and Climate", authors: "Schneider, T., et al.", year: 2023, journal: "Nature Reviews Earth & Environment", volume: "4", pages: "1-14", doi: "10.1038/s43017-023-00489-0", abstract: "Neural GCMs combine traditional climate models with ML.", addedAt: "2026-01-20T00:00:00Z" },
];

const notifications = [
  { id: "notif_1", userId: "usr_1", title: "Deadline Reminder", message: "Your thesis deadline is approaching.", type: "deadline", read: false, createdAt: "2026-03-14T08:00:00Z" },
  { id: "notif_2", userId: "usr_1", title: "Review Feedback", message: "Prof. Williams left comments on your methodology section.", type: "info", read: false, createdAt: "2026-03-13T15:30:00Z" },
];

const feedback = [
  { id: "fb_1", thesisId: "thesis_1", studentId: "usr_1", professorId: "usr_4", section: "Chapter 2 - Literature Review", message: "Could you review section 2.1?", status: "reviewed", response: "Good coverage overall.", createdAt: "2026-03-08T10:00:00Z", respondedAt: "2026-03-09T14:30:00Z" },
  { id: "fb_2", thesisId: "thesis_1", studentId: "usr_1", professorId: "usr_4", section: "Chapter 3 - Methodology", message: "Is the architecture sound?", status: "pending", createdAt: "2026-03-14T09:00:00Z" },
];

const milestones = [
  { id: "ms_1", thesisId: "thesis_1", professorId: "usr_4", title: "Literature Review Complete", description: "Complete literature review chapter.", dueDate: "2026-03-25T23:59:00Z", expectations: "Minimum 30 peer-reviewed sources.", hasFeedback: true, status: "in_progress", createdAt: "2025-10-01T00:00:00Z" },
  { id: "ms_2", thesisId: "thesis_1", professorId: "usr_4", title: "Methodology & Experimental Design", description: "Define methodology.", dueDate: "2026-04-15T23:59:00Z", expectations: "Describe CNN-LSTM architecture.", hasFeedback: true, status: "upcoming", createdAt: "2025-10-01T00:00:00Z" },
];

// ============================================================
// Seed function
// ============================================================

async function seedCollection(name: string, data: Array<{ id: string } & Record<string, unknown>>) {
  const batch = db.batch();
  for (const item of data) {
    const { id, ...rest } = item;
    batch.set(db.collection(name).doc(id), rest);
  }
  await batch.commit();
  console.log(`  Seeded ${data.length} documents in '${name}'`);
}

async function seed() {
  console.log("Seeding Firestore...\n");

  await seedCollection("users", users);
  await seedCollection("theses", theses);
  await seedCollection("notifications", notifications);
  await seedCollection("feedback", feedback);
  await seedCollection("milestones", milestones);
  await seedCollection("featureToggles", featureToggles);
  await seedCollection("researchPapers", researchPapers);

  console.log("\nDone! Firestore has been seeded with demo data.");
  console.log("\nNote: You can also create Firebase Auth users for the demo accounts:");
  console.log("  - jane.cooper@stanford.edu (student)");
  console.log("  - admin@stanford.edu (admin)");
  console.log("  - prof.williams@stanford.edu (professor)");
  console.log("  - marie.dupont@sorbonne.fr (student)");
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
