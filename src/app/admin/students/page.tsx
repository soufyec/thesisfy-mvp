"use client";

import DashboardLayout from "@/components/DashboardLayout";

const navItems = [
  {
    label: "Overview",
    href: "/admin",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    label: "All Theses",
    href: "/admin/theses",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  },
  {
    label: "Students",
    href: "/admin/students",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    label: "Integrity Flags",
    href: "/admin/flags",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  },
  {
    label: "AI Policies",
    href: "/admin/policies",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  },
];

const students = [
  {
    id: "usr_1",
    name: "Jane Cooper",
    email: "jane.cooper@stanford.edu",
    university: "Stanford University",
    theses: 2,
    avgIntegrity: 96,
    avgAiUsage: 9,
    status: "active",
    lastActive: "2 hours ago",
  },
  {
    id: "usr_3",
    name: "Marie Dupont",
    email: "marie.dupont@sorbonne.fr",
    university: "Sorbonne University",
    theses: 1,
    avgIntegrity: 96,
    avgAiUsage: 8,
    status: "active",
    lastActive: "6 days ago",
  },
];

export default function StudentsPage() {
  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Students</h1>
            <p className="text-gray-500 mt-1">Manage student accounts and monitor their progress.</p>
          </div>
          <button className="btn-primary">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Invite Students
          </button>
        </div>

        <div className="grid gap-4">
          {students.map((student) => (
            <div key={student.id} className="card p-6 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-semibold">
                    {student.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <h3 className="font-semibold">{student.name}</h3>
                    <div className="text-sm text-gray-500">{student.email}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{student.university} &middot; Last active {student.lastActive}</div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-lg font-bold">{student.theses}</div>
                    <div className="text-xs text-gray-400">Theses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{student.avgIntegrity}%</div>
                    <div className="text-xs text-gray-400">Integrity</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{student.avgAiUsage}%</div>
                    <div className="text-xs text-gray-400">AI Usage</div>
                  </div>
                  <div className="badge-success">{student.status}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
