// Firestore database service layer
// Mirrors the in-memory db API but uses Cloud Firestore
import { getAdminFirestore, isFirebaseAdminConfigured } from "./firebase-admin";
import type {
  User, Thesis, WritingSession, FeedbackRequest, Meeting,
  Milestone, WritingSnapshot, WritingReport, PasteEvent,
  Rubric, ReaderReaction, AIChatLog, FeatureToggle, ResearchPaper,
} from "./db";
import { db as memoryDb } from "./db";

function getDb() {
  return getAdminFirestore();
}

// Helper to convert Firestore doc to typed object
function docToData<T>(doc: FirebaseFirestore.DocumentSnapshot): T | undefined {
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as T;
}

// ============================================================
// Firestore-backed database operations (async versions of db.*)
// ============================================================

export const firestoreDb = {
  users: {
    findByEmail: async (email: string): Promise<Omit<User, "password"> & { password?: string } | undefined> => {
      const snap = await getDb().collection("users").where("email", "==", email).limit(1).get();
      if (snap.empty) return undefined;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as User;
    },
    findById: async (id: string): Promise<Omit<User, "password"> | undefined> => {
      const doc = await getDb().collection("users").doc(id).get();
      if (!doc.exists) return undefined;
      const data = doc.data() as User;
      const { password: _, id: _id, ...userWithoutPassword } = data;
      return { ...userWithoutPassword, id: doc.id } as Omit<User, "password">;
    },
    getAll: async () => {
      const snap = await getDb().collection("users").get();
      return snap.docs.map((d) => {
        const { password: _, id: _id, ...user } = d.data() as User;
        return { ...user, id: d.id };
      });
    },
    create: async (user: User) => {
      await getDb().collection("users").doc(user.id).set(user);
      return user;
    },
  },

  theses: {
    findById: async (id: string): Promise<Thesis | undefined> => {
      const doc = await getDb().collection("theses").doc(id).get();
      return docToData<Thesis>(doc);
    },
    getByStudent: async (studentId: string): Promise<Thesis[]> => {
      const snap = await getDb().collection("theses").where("studentId", "==", studentId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thesis));
    },
    getByProfessor: async (profId: string): Promise<Thesis[]> => {
      const snap = await getDb().collection("theses").where("professorId", "==", profId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thesis));
    },
    getAll: async (): Promise<Thesis[]> => {
      const snap = await getDb().collection("theses").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thesis));
    },
    getStats: async () => {
      const theses = await firestoreDb.theses.getAll();
      return {
        total: theses.length,
        inProgress: theses.filter((t) => t.status === "in_progress").length,
        underReview: theses.filter((t) => t.status === "under_review").length,
        approved: theses.filter((t) => t.status === "approved").length,
        avgIntegrity: theses.length > 0 ? Math.round(theses.reduce((sum, t) => sum + t.integrityScore, 0) / theses.length) : 0,
        avgAiUsage: theses.length > 0 ? Math.round(theses.reduce((sum, t) => sum + t.aiUsagePercent, 0) / theses.length) : 0,
      };
    },
    create: async (thesis: Thesis) => {
      await getDb().collection("theses").doc(thesis.id).set(thesis);
      return thesis;
    },
    update: async (id: string, data: Partial<Thesis>) => {
      const ref = getDb().collection("theses").doc(id);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updateData = { ...data, updatedAt: new Date().toISOString() };
      await ref.update(updateData);
      return { id, ...doc.data(), ...updateData } as Thesis;
    },
  },

  notifications: {
    getByUser: async (userId: string) => {
      const snap = await getDb().collection("notifications").where("userId", "==", userId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    getUnreadCount: async (userId: string) => {
      const snap = await getDb().collection("notifications").where("userId", "==", userId).where("read", "==", false).get();
      return snap.size;
    },
  },

  feedback: {
    getAll: async () => {
      const snap = await getDb().collection("feedback").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackRequest));
    },
    getByStudent: async (studentId: string) => {
      const snap = await getDb().collection("feedback").where("studentId", "==", studentId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackRequest));
    },
    getByProfessor: async (professorId: string) => {
      const snap = await getDb().collection("feedback").where("professorId", "==", professorId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackRequest));
    },
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("feedback").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackRequest));
    },
    findById: async (id: string) => {
      const doc = await getDb().collection("feedback").doc(id).get();
      return docToData<FeedbackRequest>(doc);
    },
    create: async (fb: FeedbackRequest) => {
      await getDb().collection("feedback").doc(fb.id).set(fb);
      return fb;
    },
  },

  meetings: {
    getAll: async () => {
      const snap = await getDb().collection("meetings").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting));
    },
    getByStudent: async (studentId: string) => {
      const snap = await getDb().collection("meetings").where("studentId", "==", studentId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting));
    },
    getByProfessor: async (professorId: string) => {
      const snap = await getDb().collection("meetings").where("professorId", "==", professorId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting));
    },
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("meetings").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting));
    },
    findById: async (id: string) => {
      const doc = await getDb().collection("meetings").doc(id).get();
      return docToData<Meeting>(doc);
    },
    create: async (m: Meeting) => {
      await getDb().collection("meetings").doc(m.id).set(m);
      return m;
    },
  },

  milestones: {
    getAll: async () => {
      const snap = await getDb().collection("milestones").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Milestone));
    },
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("milestones").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Milestone));
    },
    getByProfessor: async (professorId: string) => {
      const snap = await getDb().collection("milestones").where("professorId", "==", professorId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Milestone));
    },
    findById: async (id: string) => {
      const doc = await getDb().collection("milestones").doc(id).get();
      return docToData<Milestone>(doc);
    },
    create: async (m: Milestone) => {
      await getDb().collection("milestones").doc(m.id).set(m);
      return m;
    },
  },

  writingSnapshots: {
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("writingSnapshots").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WritingSnapshot));
    },
    getBySession: async (sessionId: string) => {
      const snap = await getDb().collection("writingSnapshots").where("sessionId", "==", sessionId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WritingSnapshot));
    },
    create: async (snapshot: WritingSnapshot) => {
      await getDb().collection("writingSnapshots").doc(snapshot.id).set(snapshot);
      return snapshot;
    },
  },

  writingReports: {
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("writingReports").where("thesisId", "==", thesisId).limit(1).get();
      if (snap.empty) return undefined;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as WritingReport;
    },
    getAll: async () => {
      const snap = await getDb().collection("writingReports").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WritingReport));
    },
  },

  pasteEvents: {
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("pasteEvents").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PasteEvent));
    },
    getBySession: async (sessionId: string) => {
      const snap = await getDb().collection("pasteEvents").where("sessionId", "==", sessionId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PasteEvent));
    },
    create: async (event: PasteEvent) => {
      await getDb().collection("pasteEvents").doc(event.id).set(event);
      return event;
    },
  },

  rubrics: {
    getAll: async () => {
      const snap = await getDb().collection("rubrics").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Rubric));
    },
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("rubrics").where("thesisId", "==", thesisId).limit(1).get();
      if (snap.empty) return undefined;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Rubric;
    },
    getByProfessor: async (professorId: string) => {
      const snap = await getDb().collection("rubrics").where("professorId", "==", professorId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Rubric));
    },
    findById: async (id: string) => {
      const doc = await getDb().collection("rubrics").doc(id).get();
      return docToData<Rubric>(doc);
    },
    create: async (r: Rubric) => {
      await getDb().collection("rubrics").doc(r.id).set(r);
      return r;
    },
  },

  readerReactions: {
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("readerReactions").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReaderReaction));
    },
    getBySection: async (thesisId: string, section: string) => {
      const snap = await getDb().collection("readerReactions")
        .where("thesisId", "==", thesisId)
        .where("section", "==", section)
        .limit(1).get();
      if (snap.empty) return undefined;
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as ReaderReaction;
    },
  },

  aiChatLogs: {
    getAll: async () => {
      const snap = await getDb().collection("aiChatLogs").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIChatLog));
    },
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("aiChatLogs").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIChatLog));
    },
    getByStudent: async (studentId: string) => {
      const snap = await getDb().collection("aiChatLogs").where("studentId", "==", studentId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIChatLog));
    },
    getByCategory: async (category: string) => {
      const snap = await getDb().collection("aiChatLogs").where("category", "==", category).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AIChatLog));
    },
  },

  researchPapers: {
    getByThesis: async (thesisId: string) => {
      const snap = await getDb().collection("researchPapers").where("thesisId", "==", thesisId).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ResearchPaper));
    },
    findById: async (id: string) => {
      const doc = await getDb().collection("researchPapers").doc(id).get();
      return docToData<ResearchPaper>(doc);
    },
    create: async (paper: ResearchPaper) => {
      await getDb().collection("researchPapers").doc(paper.id).set(paper);
      return paper;
    },
  },

  featureToggles: {
    getAll: async () => {
      const snap = await getDb().collection("featureToggles").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeatureToggle));
    },
    getEnabled: async () => {
      const snap = await getDb().collection("featureToggles").where("enabled", "==", true).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeatureToggle));
    },
    isEnabled: async (name: string) => {
      const snap = await getDb().collection("featureToggles").where("name", "==", name).limit(1).get();
      if (snap.empty) return false;
      return (snap.docs[0].data() as FeatureToggle).enabled;
    },
    toggle: async (id: string, enabled: boolean) => {
      const ref = getDb().collection("featureToggles").doc(id);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      await ref.update({ enabled });
      return { id, ...doc.data(), enabled } as FeatureToggle;
    },
  },
};

// ============================================================
// Smart database accessor: uses Firestore when configured,
// falls back to in-memory db for demo/development
// ============================================================

export function useFirestore(): boolean {
  return isFirebaseAdminConfigured();
}

// Get the appropriate database (async Firestore or sync in-memory wrapped in promises)
export function getDatabase() {
  if (useFirestore()) {
    return firestoreDb;
  }

  // Wrap synchronous in-memory db calls in promises for API compatibility
  return {
    users: {
      findByEmail: async (email: string) => memoryDb.users.findByEmail(email),
      findById: async (id: string) => memoryDb.users.findById(id),
      getAll: async () => memoryDb.users.getAll(),
      create: async (user: User) => { /* in-memory doesn't support create */ return user; },
    },
    theses: {
      findById: async (id: string) => memoryDb.theses.findById(id),
      getByStudent: async (studentId: string) => memoryDb.theses.getByStudent(studentId),
      getByProfessor: async (profId: string) => memoryDb.theses.getByProfessor(profId),
      getAll: async () => memoryDb.theses.getAll(),
      getStats: async () => memoryDb.theses.getStats(),
      create: async (thesis: Thesis) => memoryDb.theses.create(thesis),
      update: async (id: string, data: Partial<Thesis>) => memoryDb.theses.update(id, data),
    },
    notifications: {
      getByUser: async (userId: string) => memoryDb.notifications.getByUser(userId),
      getUnreadCount: async (userId: string) => memoryDb.notifications.getUnreadCount(userId),
    },
    feedback: {
      getAll: async () => memoryDb.feedback.getAll(),
      getByStudent: async (studentId: string) => memoryDb.feedback.getByStudent(studentId),
      getByProfessor: async (professorId: string) => memoryDb.feedback.getByProfessor(professorId),
      getByThesis: async (thesisId: string) => memoryDb.feedback.getByThesis(thesisId),
      findById: async (id: string) => memoryDb.feedback.findById(id),
      create: async (fb: FeedbackRequest) => memoryDb.feedback.create(fb),
    },
    meetings: {
      getAll: async () => memoryDb.meetings.getAll(),
      getByStudent: async (studentId: string) => memoryDb.meetings.getByStudent(studentId),
      getByProfessor: async (professorId: string) => memoryDb.meetings.getByProfessor(professorId),
      getByThesis: async (thesisId: string) => memoryDb.meetings.getByThesis(thesisId),
      findById: async (id: string) => memoryDb.meetings.findById(id),
      create: async (m: Meeting) => memoryDb.meetings.create(m),
    },
    milestones: {
      getAll: async () => memoryDb.milestones.getAll(),
      getByThesis: async (thesisId: string) => memoryDb.milestones.getByThesis(thesisId),
      getByProfessor: async (professorId: string) => memoryDb.milestones.getByProfessor(professorId),
      findById: async (id: string) => memoryDb.milestones.findById(id),
      create: async (m: Milestone) => memoryDb.milestones.create(m),
    },
    writingSnapshots: {
      getByThesis: async (thesisId: string) => memoryDb.writingSnapshots.getByThesis(thesisId),
      getBySession: async (sessionId: string) => memoryDb.writingSnapshots.getBySession(sessionId),
      create: async (snapshot: WritingSnapshot) => memoryDb.writingSnapshots.create(snapshot),
    },
    writingReports: {
      getByThesis: async (thesisId: string) => memoryDb.writingReports.getByThesis(thesisId),
      getAll: async () => memoryDb.writingReports.getAll(),
    },
    pasteEvents: {
      getByThesis: async (thesisId: string) => memoryDb.pasteEvents.getByThesis(thesisId),
      getBySession: async (sessionId: string) => memoryDb.pasteEvents.getBySession(sessionId),
      create: async (event: PasteEvent) => memoryDb.pasteEvents.create(event),
    },
    rubrics: {
      getAll: async () => memoryDb.rubrics.getAll(),
      getByThesis: async (thesisId: string) => memoryDb.rubrics.getByThesis(thesisId),
      getByProfessor: async (professorId: string) => memoryDb.rubrics.getByProfessor(professorId),
      findById: async (id: string) => memoryDb.rubrics.findById(id),
      create: async (r: Rubric) => memoryDb.rubrics.create(r),
    },
    readerReactions: {
      getByThesis: async (thesisId: string) => memoryDb.readerReactions.getByThesis(thesisId),
      getBySection: async (thesisId: string, section: string) => memoryDb.readerReactions.getBySection(thesisId, section),
    },
    aiChatLogs: {
      getAll: async () => memoryDb.aiChatLogs.getAll(),
      getByThesis: async (thesisId: string) => memoryDb.aiChatLogs.getByThesis(thesisId),
      getByStudent: async (studentId: string) => memoryDb.aiChatLogs.getByStudent(studentId),
      getByCategory: async (category: string) => memoryDb.aiChatLogs.getByCategory(category),
    },
    researchPapers: {
      getByThesis: async (thesisId: string) => memoryDb.researchPapers.getByThesis(thesisId),
      findById: async (id: string) => memoryDb.researchPapers.findById(id),
      create: async (paper: ResearchPaper) => memoryDb.researchPapers.create(paper),
    },
    featureToggles: {
      getAll: async () => memoryDb.featureToggles.getAll(),
      getEnabled: async () => memoryDb.featureToggles.getEnabled(),
      isEnabled: async (name: string) => memoryDb.featureToggles.isEnabled(name),
      toggle: async (id: string, enabled: boolean) => memoryDb.featureToggles.toggle(id, enabled),
    },
  };
}
