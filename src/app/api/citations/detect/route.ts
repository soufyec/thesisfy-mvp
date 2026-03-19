import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { selectedText, thesisId, citationStyle = "apa" } = body;

  if (!selectedText || !thesisId) {
    return NextResponse.json({ error: "selectedText and thesisId are required" }, { status: 400 });
  }

  const database = getDatabase();
  const papers = await database.researchPapers.getByThesis(thesisId);
  if (papers.length === 0) {
    return NextResponse.json({ error: "No research papers connected to this thesis" }, { status: 404 });
  }

  const papersContext = papers.map((p, i) => (
    `[${i + 1}] ${p.authors} (${p.year}). "${p.title}." ${p.journal}${p.volume ? `, ${p.volume}` : ""}${p.pages ? `, pp. ${p.pages}` : ""}.${p.abstract ? ` Abstract: ${p.abstract}` : ""}`
  )).join("\n\n");

  const prompt = `You are a citation detection assistant. Given a selected passage from a thesis and a list of research papers connected to it, determine which paper(s) the passage most likely references or should cite.

## Connected Research Papers:
${papersContext}

## Selected Passage:
"${selectedText}"

## Citation Style: ${citationStyle.toUpperCase()}

## Instructions:
1. Analyze the selected passage and determine which of the connected papers it most likely references.
2. Consider: topic overlap, methodology mentions, author names, concepts, findings, and years mentioned.
3. Return your answer as JSON with this exact structure:
{
  "matches": [
    {
      "paperId": <index number from the list, 1-based>,
      "confidence": <0.0 to 1.0>,
      "reason": "<brief explanation of why this paper matches>"
    }
  ],
  "suggestedInlineCitation": "<the inline citation text to insert, e.g. (Reichstein et al., 2019)>",
  "suggestedPosition": "after"
}

Only include papers with confidence > 0.3. Sort by confidence descending. Return ONLY the JSON, no other text.`;

  if (CLAUDE_API_KEY) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content[0]?.text || "";
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const enrichedMatches = (result.matches || []).map((m: { paperId: number; confidence: number; reason: string }) => {
              const paper = papers[m.paperId - 1];
              return {
                ...m,
                paper: paper ? {
                  id: paper.id,
                  title: paper.title,
                  authors: paper.authors,
                  year: paper.year,
                  journal: paper.journal,
                } : null,
              };
            });
            return NextResponse.json({
              matches: enrichedMatches,
              suggestedInlineCitation: result.suggestedInlineCitation,
              suggestedPosition: result.suggestedPosition || "after",
              selectedText,
            });
          }
        } catch {
          // Fall through to simulated response
        }
      }
    } catch {
      // Fall through to simulated response
    }
  }

  // Simulated response for demo
  return simulatedDetection(selectedText, papers, citationStyle);
}

function simulatedDetection(
  selectedText: string,
  papers: Array<{ id: string; title: string; authors: string; year: number; journal: string; volume?: string; pages?: string; abstract?: string }>,
  style: string
) {
  const textLower = selectedText.toLowerCase();
  const matches: Array<{
    paperId: number;
    confidence: number;
    reason: string;
    paper: {
      id: string;
      title: string;
      authors: string;
      year: number;
      journal: string;
    };
  }> = [];

  papers.forEach((paper, index) => {
    let confidence = 0;
    const reasons: string[] = [];

    // Check author name mentions
    const authorLastNames = paper.authors.split(",").map(a => a.trim().split(" ").pop()?.toLowerCase() || "");
    for (const name of authorLastNames) {
      if (name && textLower.includes(name)) {
        confidence += 0.4;
        reasons.push(`Author "${name}" is mentioned`);
      }
    }

    // Check year mention
    if (textLower.includes(paper.year.toString())) {
      confidence += 0.2;
      reasons.push(`Year ${paper.year} is mentioned`);
    }

    // Check topic keywords
    const titleWords = paper.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const matchingKeywords = titleWords.filter(w => textLower.includes(w));
    if (matchingKeywords.length > 0) {
      confidence += Math.min(0.3, matchingKeywords.length * 0.1);
      reasons.push(`Topic keywords match: ${matchingKeywords.slice(0, 3).join(", ")}`);
    }

    // Check abstract overlap
    if (paper.abstract) {
      const abstractWords = paper.abstract.toLowerCase().split(/\s+/).filter(w => w.length > 5);
      const overlapCount = abstractWords.filter(w => textLower.includes(w)).length;
      if (overlapCount > 3) {
        confidence += Math.min(0.2, overlapCount * 0.03);
        reasons.push("Content overlaps with paper abstract");
      }
    }

    if (confidence > 0.3) {
      matches.push({
        paperId: index + 1,
        confidence: Math.min(confidence, 1.0),
        reason: reasons.join("; "),
        paper: {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          journal: paper.journal,
        },
      });
    }
  });

  // If no strong matches, suggest the most relevant paper by topic
  if (matches.length === 0) {
    const keywords = ["climate", "weather", "deep learning", "neural", "prediction", "machine learning", "cnn", "lstm", "gcm", "forecast"];
    let bestIdx = 0;
    let bestScore = 0;
    papers.forEach((paper, i) => {
      const combined = (paper.title + " " + (paper.abstract || "")).toLowerCase();
      const score = keywords.filter(k => textLower.includes(k) && combined.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });

    if (bestScore > 0) {
      const paper = papers[bestIdx];
      matches.push({
        paperId: bestIdx + 1,
        confidence: Math.min(0.5, bestScore * 0.15 + 0.2),
        reason: "Topic keywords match the selected passage",
        paper: {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          journal: paper.journal,
        },
      });
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);

  const topMatch = matches[0];
  let suggestedCitation = "";
  if (topMatch) {
    const firstAuthor = topMatch.paper.authors.split(",")[0].trim().split(" ").pop();
    const hasMultiple = topMatch.paper.authors.includes(",");
    if (style === "apa") {
      suggestedCitation = hasMultiple
        ? `(${firstAuthor} et al., ${topMatch.paper.year})`
        : `(${firstAuthor}, ${topMatch.paper.year})`;
    } else if (style === "mla") {
      suggestedCitation = hasMultiple
        ? `(${firstAuthor} et al. ${topMatch.paper.year})`
        : `(${firstAuthor} ${topMatch.paper.year})`;
    } else {
      suggestedCitation = `[${topMatch.paperId}]`;
    }
  }

  return NextResponse.json({
    matches,
    suggestedInlineCitation: suggestedCitation,
    suggestedPosition: "after",
    selectedText,
    demo: true,
  });
}
