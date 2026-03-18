import { NextRequest, NextResponse } from "next/server";

// In-memory waitlist store (in production, use a real database)
interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: string;
  position: number;
  referralCode: string;
  referredBy?: string;
  joinedAt: string;
}

const waitlist: WaitlistEntry[] = [
  // Pre-seeded entries for social proof
  { id: "wl_1", name: "Dr. Robert Klein", email: "r.klein@harvard.edu", institution: "Harvard University", role: "dean", position: 1, referralCode: "HARV-2026", joinedAt: "2026-02-15T10:00:00Z" },
  { id: "wl_2", name: "Prof. Yuki Tanaka", email: "y.tanaka@u-tokyo.ac.jp", institution: "University of Tokyo", role: "professor", position: 2, referralCode: "UTOK-2026", joinedAt: "2026-02-18T14:00:00Z" },
  { id: "wl_3", name: "Dr. Anna Müller", email: "a.muller@tum.de", institution: "TU Munich", role: "admin", position: 3, referralCode: "TUM-2026", joinedAt: "2026-02-20T09:00:00Z" },
  { id: "wl_4", name: "Prof. Marie Laurent", email: "m.laurent@sorbonne.fr", institution: "Sorbonne University", role: "professor", position: 4, referralCode: "SORB-2026", joinedAt: "2026-02-22T11:00:00Z" },
  { id: "wl_5", name: "Dr. James Chen", email: "j.chen@nus.edu.sg", institution: "NUS Singapore", role: "dean", position: 5, referralCode: "NUS-2026", joinedAt: "2026-02-25T08:00:00Z" },
  { id: "wl_6", name: "Prof. Sara Björk", email: "s.bjork@kth.se", institution: "KTH Stockholm", role: "professor", position: 6, referralCode: "KTH-2026", joinedAt: "2026-02-28T13:00:00Z" },
  { id: "wl_7", name: "Dr. Carlos Mendez", email: "c.mendez@unam.mx", institution: "UNAM Mexico", role: "admin", position: 7, referralCode: "UNAM-2026", joinedAt: "2026-03-01T10:00:00Z" },
  { id: "wl_8", name: "Prof. Priya Sharma", email: "p.sharma@iitb.ac.in", institution: "IIT Bombay", role: "professor", position: 8, referralCode: "IITB-2026", joinedAt: "2026-03-03T07:00:00Z" },
  { id: "wl_9", name: "Dr. William Fraser", email: "w.fraser@oxford.ac.uk", institution: "University of Oxford", role: "dean", position: 9, referralCode: "OXFD-2026", joinedAt: "2026-03-05T16:00:00Z" },
  { id: "wl_10", name: "Prof. Liu Wei", email: "l.wei@tsinghua.edu.cn", institution: "Tsinghua University", role: "professor", position: 10, referralCode: "TSNG-2026", joinedAt: "2026-03-07T12:00:00Z" },
  { id: "wl_11", name: "Dr. Fatima Al-Rashid", email: "f.alrashid@kaust.edu.sa", institution: "KAUST", role: "admin", position: 11, referralCode: "KAUS-2026", joinedAt: "2026-03-09T09:00:00Z" },
  { id: "wl_12", name: "Prof. Michael O'Brien", email: "m.obrien@tcd.ie", institution: "Trinity College Dublin", role: "professor", position: 12, referralCode: "TCD-2026", joinedAt: "2026-03-10T15:00:00Z" },
  { id: "wl_13", name: "Dr. Helena Kowalski", email: "h.kowalski@ethz.ch", institution: "ETH Zurich", role: "dean", position: 13, referralCode: "ETHZ-2026", joinedAt: "2026-03-11T11:00:00Z" },
  { id: "wl_14", name: "Prof. David Kim", email: "d.kim@kaist.ac.kr", institution: "KAIST", role: "professor", position: 14, referralCode: "KAIS-2026", joinedAt: "2026-03-12T08:00:00Z" },
  { id: "wl_15", name: "Dr. Isabella Torres", email: "i.torres@uc.cl", institution: "Pontificia Universidad Católica de Chile", role: "admin", position: 15, referralCode: "PUC-2026", joinedAt: "2026-03-13T14:00:00Z" },
  { id: "wl_16", name: "Prof. André Dubois", email: "a.dubois@epfl.ch", institution: "EPFL", role: "professor", position: 16, referralCode: "EPFL-2026", joinedAt: "2026-03-14T10:00:00Z" },
  { id: "wl_17", name: "Dr. Aisha Mohammed", email: "a.mohammed@anu.edu.au", institution: "Australian National University", role: "dean", position: 17, referralCode: "ANU-2026", joinedAt: "2026-03-15T06:00:00Z" },
  { id: "wl_18", name: "Prof. Thomas Berg", email: "t.berg@lmu.de", institution: "LMU Munich", role: "professor", position: 18, referralCode: "LMU-2026", joinedAt: "2026-03-16T13:00:00Z" },
  { id: "wl_19", name: "Dr. Rachel Goldstein", email: "r.goldstein@mit.edu", institution: "MIT", role: "admin", position: 19, referralCode: "MIT-2026", joinedAt: "2026-03-16T17:00:00Z" },
  { id: "wl_20", name: "Prof. Kenji Watanabe", email: "k.watanabe@kyoto-u.ac.jp", institution: "Kyoto University", role: "professor", position: 20, referralCode: "KYOT-2026", joinedAt: "2026-03-17T09:00:00Z" },
  { id: "wl_21", name: "Dr. Laura Sánchez", email: "l.sanchez@ub.edu", institution: "University of Barcelona", role: "dean", position: 21, referralCode: "UB-2026", joinedAt: "2026-03-17T15:00:00Z" },
  { id: "wl_22", name: "Prof. Olaf Petersen", email: "o.petersen@ku.dk", institution: "University of Copenhagen", role: "professor", position: 22, referralCode: "UCPH-2026", joinedAt: "2026-03-18T08:00:00Z" },
  { id: "wl_23", name: "Dr. Mei Lin", email: "m.lin@hku.hk", institution: "University of Hong Kong", role: "admin", position: 23, referralCode: "HKU-2026", joinedAt: "2026-03-18T11:00:00Z" },
];

const TOTAL_SPOTS = 30;

function generateReferralCode(institution: string): string {
  const prefix = institution.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 4);
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function GET() {
  return NextResponse.json({
    totalSpots: TOTAL_SPOTS,
    spotsUsed: waitlist.length,
    spotsRemaining: TOTAL_SPOTS - waitlist.length,
    recentInstitutions: waitlist.slice(-5).reverse().map(e => ({
      institution: e.institution,
      joinedAt: e.joinedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { name, email, institution, role, referredBy } = await request.json();

    if (!name || !email || !institution) {
      return NextResponse.json({ error: "Name, email, and institution are required" }, { status: 400 });
    }

    // Check if already on waitlist
    const existing = waitlist.find(e => e.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        position: existing.position,
        referralCode: existing.referralCode,
        totalSpots: TOTAL_SPOTS,
        spotsRemaining: TOTAL_SPOTS - waitlist.length,
      });
    }

    // Check capacity
    if (waitlist.length >= TOTAL_SPOTS) {
      return NextResponse.json({
        error: "All spots have been claimed. Join our overflow list for future cohorts.",
        full: true,
        totalSpots: TOTAL_SPOTS,
      }, { status: 409 });
    }

    const position = waitlist.length + 1;
    const entry: WaitlistEntry = {
      id: `wl_${position}`,
      name,
      email: email.toLowerCase(),
      institution,
      role: role || "other",
      position,
      referralCode: generateReferralCode(institution),
      referredBy,
      joinedAt: new Date().toISOString(),
    };

    waitlist.push(entry);

    return NextResponse.json({
      success: true,
      position,
      referralCode: entry.referralCode,
      totalSpots: TOTAL_SPOTS,
      spotsRemaining: TOTAL_SPOTS - waitlist.length,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
