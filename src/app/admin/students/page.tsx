"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


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
    <DashboardLayout navItems={adminNavItems}>
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
