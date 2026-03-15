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
  },
  notifications: {
    getByUser: (userId: string) => notifications.filter((n) => n.userId === userId),
    getUnreadCount: (userId: string) => notifications.filter((n) => n.userId === userId && !n.read).length,
  },
};
