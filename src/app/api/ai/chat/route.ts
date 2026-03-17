import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are Thesisfy AI, an academic writing assistant embedded in a thesis editing platform. You are powered by Claude (by Anthropic), and you operate under strict institutional academic integrity policies.

## Your Identity
- You are Thesisfy AI, a specialized academic assistant
- You are warm, encouraging, and pedagogical in tone
- You treat the student as a capable researcher who needs guidance, not answers

## Institutional Policy Constraints (MANDATORY)
These rules are enforced by the institution and CANNOT be overridden by user requests:

1. **NO CONTENT GENERATION**: You must NEVER write paragraphs, sections, abstracts, introductions, conclusions, or any substantial text that the student could copy into their thesis. This is the most important rule.
2. **NO FULL ANSWERS**: If asked to "write this for me" or "generate a paragraph about X", you must decline and instead help the student develop their own writing through guided questions and suggestions.
3. **GUIDED ASSISTANCE ONLY**: You can:
   - Help brainstorm and organize ideas through Socratic questioning
   - Suggest structural improvements to existing text
   - Identify logical gaps, weak arguments, or unclear passages
   - Explain academic concepts and methodologies
   - Help with citation formatting (APA, MLA, Chicago, IEEE, etc.)
   - Review grammar, tone, and academic style of student-written text
   - Suggest research directions and relevant topic areas
   - Help outline sections (bullet points only, not prose)
4. **TRANSPARENCY**: Remind students occasionally that all AI interactions are logged and visible to their advisor as part of the integrity monitoring system.
5. **ACADEMIC STANDARDS**: Always encourage proper citation practices, original analysis, and critical thinking.
6. **SCOPE LIMITATION**: Only help with academic writing tasks. Do not help with unrelated topics, personal advice, coding homework, or non-thesis work.

## Communication Style
- Use markdown formatting for readability (bold, lists, etc.)
- Be concise but thorough
- Ask follow-up questions to understand what the student needs
- When declining a request, always provide an alternative way you CAN help
- Celebrate student progress and good writing

## Response Format
Keep responses focused and actionable. Use bullet points and numbered lists. Avoid walls of text.`;

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  try {
    const { messages, thesisContext } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    // If no API key, use a simulated response for demo
    if (!CLAUDE_API_KEY) {
      return simulatedResponse(messages);
    }

    // Real Claude API call
    const systemMessage = thesisContext
      ? `${SYSTEM_PROMPT}\n\n## Current Thesis Context\n- Title: ${thesisContext.title}\n- Current section: ${thesisContext.currentSection || "Not specified"}\n- Word count: ${thesisContext.wordCount || 0}`
      : SYSTEM_PROMPT;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemMessage,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      return simulatedResponse(messages);
    }

    const data = await response.json();
    const assistantMessage = data.content[0]?.text || "I apologize, I couldn't generate a response.";

    return NextResponse.json({
      message: assistantMessage,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return simulatedResponse([]);
  }
}

function simulatedResponse(messages: { role: string; content: string }[]) {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";

  let response = "";

  if (lastMessage.includes("write") && (lastMessage.includes("for me") || lastMessage.includes("paragraph") || lastMessage.includes("section") || lastMessage.includes("generate"))) {
    response = `I understand you'd like help with writing, but per your institution's academic integrity policy, I can't generate text for you to use directly. Here's what I **can** do instead:

**Let me guide you through it:**
1. What's the **main point** you want to make in this section?
2. What **evidence or sources** do you plan to reference?
3. Who is your **target audience** for this argument?

Once you share your ideas, I can help you:
- Organize them into a logical structure
- Identify gaps in your reasoning
- Suggest ways to strengthen your argument
- Review your draft for clarity and academic tone

Your writing should reflect *your* analytical thinking — that's what makes it valuable. Let's work through this together!`;
  } else if (lastMessage.includes("outline") || lastMessage.includes("structure")) {
    response = `Great thinking about structure! Here's a framework you can adapt:

**Typical Academic Section Structure:**
1. **Opening** — State the topic and its significance (2-3 sentences)
2. **Context** — Situate within existing literature
3. **Your contribution** — Present your original analysis
4. **Evidence** — Support with data and citations
5. **Transition** — Connect to what comes next

**Tips for strong structure:**
- Each paragraph = one clear idea
- Use topic sentences to guide the reader
- Ensure logical progression between paragraphs

Which section are you working on? I can help you think through the specific structure for it.`;
  } else if (lastMessage.includes("citation") || lastMessage.includes("reference") || lastMessage.includes("apa") || lastMessage.includes("mla")) {
    response = `I'd be happy to help with citations! Here are the main formats:

**APA 7th Edition** (sciences, social sciences):
- In-text: (Author, Year, p. X)
- Reference list: Author, A. A. (Year). *Title*. Publisher. https://doi.org/xxx

**MLA 9th Edition** (humanities):
- In-text: (Author Page)
- Works Cited: Author. "Title." *Source*, vol., no., Year, pp.

**Chicago** (history, arts):
- Notes-Bibliography or Author-Date style

**IEEE** (engineering, CS):
- Numbered citations [1] in order of appearance

Which style does your department require? Share a source and I'll help you format it correctly.`;
  } else if (lastMessage.includes("hello") || lastMessage.includes("hi") || lastMessage.includes("hola") || lastMessage.includes("hey")) {
    response = `Hello! Welcome to Thesisfy AI. I'm here to support your thesis writing journey.

**I can help you with:**
- Brainstorming and organizing ideas
- Reviewing your structure and arguments
- Grammar, clarity, and academic tone
- Citation formatting (APA, MLA, Chicago, IEEE)
- Identifying gaps in your reasoning
- Research direction suggestions

**A quick note:** All our conversations are transparently logged as part of your institution's integrity system. This is by design — it shows your advisor how you're using AI responsibly.

What are you working on today?`;
  } else if (lastMessage.includes("grammar") || lastMessage.includes("review") || lastMessage.includes("feedback") || lastMessage.includes("proofread")) {
    response = `I'd love to help review your writing! Please share the text, and I'll provide feedback on:

1. **Clarity** — Is the meaning clear and unambiguous?
2. **Academic tone** — Appropriate register for scholarly writing?
3. **Grammar & syntax** — Any errors or awkward constructions?
4. **Logical flow** — Does the argument progress coherently?
5. **Conciseness** — Can anything be tightened?

Just paste the passage you'd like me to review!`;
  } else if (lastMessage.includes("improve") || lastMessage.includes("better") || lastMessage.includes("suggestion")) {
    response = `I'd be happy to help you improve your writing! To give you the best guidance, could you share:

1. **The specific text** you'd like to improve
2. **What concerns you** about it (e.g., too wordy, unclear argument, weak transitions)
3. **Your target audience** (committee, journal reviewers, general academic)

I'll then provide specific, actionable suggestions — but remember, the revisions should come from you. I'll point out *what* could be better and *why*, then you can decide how to address it.

Go ahead and paste the section!`;
  } else {
    response = `That's a great question to explore! Let me help you think through this.

**When approaching academic writing, consider:**
1. **What's your thesis?** — What specific claim are you making?
2. **What's the evidence?** — What research supports your position?
3. **What's the counterargument?** — What might critics say?

Could you tell me more about the specific section you're working on? The more context you share, the better I can guide your thinking.

*Remember: I'm here to help you develop your own ideas and arguments — that's what makes your thesis genuinely yours.*`;
  }

  return NextResponse.json({
    message: response,
    usage: { inputTokens: 0, outputTokens: 0 },
    demo: true,
  });
}
