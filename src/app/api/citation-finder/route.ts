import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Simulated citation finder - in production, this would call a real academic search API
const mockCitations = [
  { title: "Deep learning and process understanding for data-driven Earth system science", authors: "Reichstein, M., Camps-Valls, G., Stevens, B., et al.", year: 2019, journal: "Nature", volume: "566(7743)", pages: "195-204", doi: "10.1038/s41586-019-0912-1" },
  { title: "Can deep learning beat numerical weather prediction?", authors: "Schultz, M.G., Betancourt, C., Gong, B., et al.", year: 2021, journal: "Phil. Trans. R. Soc. A", volume: "379(2194)", pages: "20200097", doi: "10.1098/rsta.2020.0097" },
  { title: "Pangu-Weather: A 3D high-resolution model for fast and accurate global weather forecast", authors: "Bi, K., Xie, L., Zhang, H., et al.", year: 2023, journal: "Nature", volume: "619", pages: "533-538", doi: "10.1038/s41586-023-06185-3" },
  { title: "GraphCast: Learning skillful medium-range global weather forecasting", authors: "Lam, R., Sanchez-Gonzalez, A., Willson, M., et al.", year: 2023, journal: "Science", volume: "382(6677)", pages: "1416-1421", doi: "10.1126/science.adi2336" },
  { title: "Climate informatics: accelerating discovering in climate science with machine learning", authors: "Monteleoni, C., Schmidt, G.A., McQuade, S.", year: 2013, journal: "Computing in Science & Engineering", volume: "15(5)", pages: "32-40", doi: "10.1109/MCSE.2013.50" },
];

function formatCitation(c: typeof mockCitations[0], style: string) {
  if (style === "apa") return `${c.authors} (${c.year}). ${c.title}. *${c.journal}*, *${c.volume}*, ${c.pages}. https://doi.org/${c.doi}`;
  if (style === "mla") return `${c.authors.split(",")[0]}, et al. "${c.title}." *${c.journal}* ${c.volume} (${c.year}): ${c.pages}.`;
  return `${c.authors}, "${c.title}," *${c.journal}*, vol. ${c.volume}, pp. ${c.pages}, ${c.year}.`;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { query, style = "apa" } = body;
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  // Simulate search relevance
  const queryLower = query.toLowerCase();
  const results = mockCitations
    .filter((c) => c.title.toLowerCase().includes(queryLower) || c.authors.toLowerCase().includes(queryLower) || queryLower.includes("climate") || queryLower.includes("weather") || queryLower.includes("deep learning"))
    .map((c) => ({ ...c, formatted: formatCitation(c, style), relevanceScore: Math.random() * 0.3 + 0.7 }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  return NextResponse.json({ citations: results, style, query });
}
