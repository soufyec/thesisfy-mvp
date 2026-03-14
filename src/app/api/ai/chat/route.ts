import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are Thesisfy AI, an academic writing assistant powered by Claude. Your role is to help students with their thesis writing while maintaining academic integrity.

Rules you MUST follow:
1. NEVER write entire sections or paragraphs for students. Instead, help them develop their own ideas.
2. You can help with: brainstorming, outlining, explaining concepts, improving grammar, suggesting structure, finding logical gaps, and providing feedback on drafts.
3. You CANNOT: write original content, generate full paragraphs to be copied, or do the student's research for them.
4. Always encourage critical thinking and original analysis.
5. When asked to "write this for me", redirect to helping them structure their own thoughts.
6. Be supportive, pedagogical, and constructive.
7. Reference academic writing best practices.
8. Help with citations format (APA, MLA, Chicago, etc.) when asked.

You are transparent about being AI. All interactions are logged as part of Thesisfy's integrity monitoring system. This transparency is a feature, not a limitation.`;

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
      ? `${SYSTEM_PROMPT}\n\nCurrent thesis context:\nTitle: ${thesisContext.title}\nCurrent section: ${thesisContext.currentSection || "Not specified"}\nWord count: ${thesisContext.wordCount || 0}`
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

  if (lastMessage.includes("write") && (lastMessage.includes("for me") || lastMessage.includes("paragraph") || lastMessage.includes("section"))) {
    response = `I appreciate you reaching out! However, as your academic integrity assistant, I can't write content directly for you. Instead, let me help you develop your ideas:

1. **What's your main argument?** Let's start by clarifying your thesis statement for this section.
2. **What evidence do you have?** We can organize your research into a logical flow.
3. **Structure suggestion:** I can help you create an outline that guides your writing.

Would you like to start with any of these approaches? Remember, the goal is to strengthen YOUR voice and ideas.`;
  } else if (lastMessage.includes("outline") || lastMessage.includes("structure")) {
    response = `Great question about structure! Here's a common approach for academic thesis sections:

**Recommended Section Structure:**
1. **Opening statement** - Introduce the topic and its relevance (2-3 sentences)
2. **Context/Background** - Situate your argument within existing literature
3. **Your argument/analysis** - Present your original contribution
4. **Evidence & support** - Back up your claims with data/citations
5. **Transition** - Connect to the next section

**Tips:**
- Each paragraph should have one clear idea
- Use topic sentences to guide your reader
- Ensure logical flow between paragraphs

Would you like me to help you outline a specific section of your thesis?`;
  } else if (lastMessage.includes("citation") || lastMessage.includes("reference") || lastMessage.includes("apa") || lastMessage.includes("mla")) {
    response = `I'd be happy to help with citations! Here are the main formats:

**APA 7th Edition (most common in sciences):**
- In-text: (Author, Year, p. X)
- Reference: Author, A. A. (Year). *Title of work*. Publisher.

**MLA 9th Edition (humanities):**
- In-text: (Author Page)
- Works Cited: Author. "Title." *Source*, vol., no., Year, pp.

**Chicago (history, arts):**
- Footnote style or Author-Date style available

Which citation style does your university require? I can help you format specific references.`;
  } else if (lastMessage.includes("hello") || lastMessage.includes("hi") || lastMessage.includes("hola")) {
    response = `Hello! I'm Thesisfy AI, your academic writing assistant. I'm here to help you with your thesis work while maintaining academic integrity.

I can help you with:
- **Brainstorming** ideas and arguments
- **Structuring** your thesis sections
- **Reviewing** your drafts for clarity and logic
- **Citation** formatting (APA, MLA, Chicago)
- **Improving** grammar and academic tone
- **Identifying** logical gaps in your arguments

What would you like to work on today?`;
  } else if (lastMessage.includes("grammar") || lastMessage.includes("review") || lastMessage.includes("feedback")) {
    response = `I'd love to help review your writing! Please share the paragraph or section you'd like feedback on, and I'll provide:

1. **Clarity check** - Is your meaning clear?
2. **Academic tone** - Is the language appropriate?
3. **Grammar & syntax** - Any errors to fix?
4. **Logical flow** - Does the argument progress well?
5. **Suggestions** - Ways to strengthen your writing

Just paste the text you'd like me to review!`;
  } else {
    response = `That's an interesting question! Let me help you think through this.

When approaching academic writing, consider:

1. **Clarity of argument** - What specific claim are you making?
2. **Evidence base** - What research supports your position?
3. **Critical analysis** - How does this connect to broader themes in your field?

Could you share more about the specific aspect of your thesis you're working on? The more context you provide, the better I can assist you in developing your own arguments and analysis.

Remember: I'm here to guide your thinking, not to think for you. That's what makes your thesis genuinely yours!`;
  }

  return NextResponse.json({
    message: response,
    usage: { inputTokens: 0, outputTokens: 0 },
    demo: true,
  });
}
