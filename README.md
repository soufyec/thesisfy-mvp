# Thesisfy.edu MVP

**Academic integrity through AI regulation, not detection. The anti-Turnitin.**

Thesisfy monitors the writing process in real-time instead of trying to detect AI after submission. Students can use AI tools transparently within defined boundaries, and professors see a complete integrity profile based on actual writing behavior.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Frontend**: React 18, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI Integration**: Claude API (Anthropic) with fallback to simulated responses
- **Auth**: JWT-based with httpOnly cookies
- **Deployment**: Vercel

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Demo Accounts

| Role      | Email                        | Password |
|-----------|------------------------------|----------|
| Student   | jane.cooper@stanford.edu     | demo123  |
| Student   | marie.dupont@sorbonne.fr     | demo123  |
| Professor | prof.williams@stanford.edu   | demo123  |
| Admin     | admin@stanford.edu           | admin123 |

## Features

### Landing Page
- Hero section with animated stats
- Feature showcase with 6 key differentiators
- Turnitin vs Thesisfy comparison table
- How it works (3-step process)
- Pricing plans (Starter/Department/Enterprise)
- Responsive design with mobile menu

### Student Dashboard
- Overview with thesis stats and integrity scores
- Active thesis highlight with progress tracking
- Full thesis list with circular progress indicators
- Writing analytics (weekly activity, AI usage breakdown)
- AI Assistant (Claude-powered chat with academic guardrails)
- Thesis editor with integrated AI panel and session monitoring

### Admin/Professor Dashboard
- Institution-wide metrics (theses, integrity, students, flags)
- AI usage distribution visualization
- All theses overview with filtering
- Student management with enrollment
- Integrity flags review system
- AI policy configuration (usage limits, permitted tools, monitoring)

### AI Integration
- Claude-powered academic writing assistant
- System prompt enforcing academic integrity rules
- Fallback to intelligent simulated responses when no API key
- Context-aware responses based on thesis content
- Transparent logging of all AI interactions

## Deploy to Vercel

1. Push this repository to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Set environment variables:
   - `JWT_SECRET` (required)
   - `ANTHROPIC_API_KEY` (optional, for live AI)
4. Deploy

## Environment Variables

| Variable         | Required | Description                              |
|------------------|----------|------------------------------------------|
| JWT_SECRET       | Yes      | Secret key for JWT token signing         |
| ANTHROPIC_API_KEY| No       | Anthropic API key for Claude integration |
| CLAUDE_MODEL     | No       | Claude model ID (defaults to Sonnet)     |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Login page
│   ├── dashboard/                  # Student area
│   │   ├── page.tsx                # Student dashboard
│   │   ├── theses/page.tsx         # Thesis list
│   │   ├── ai-chat/page.tsx        # AI assistant chat
│   │   ├── analytics/page.tsx      # Writing analytics
│   │   └── editor/[id]/page.tsx    # Thesis editor
│   ├── admin/                      # Admin/Professor area
│   │   ├── page.tsx                # Admin dashboard
│   │   ├── theses/page.tsx         # All theses
│   │   ├── students/page.tsx       # Student management
│   │   ├── flags/page.tsx          # Integrity flags
│   │   └── policies/page.tsx       # AI policies
│   └── api/                        # API routes
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── auth/me/route.ts
│       ├── theses/route.ts
│       ├── theses/[id]/route.ts
│       ├── stats/route.ts
│       └── ai/chat/route.ts
├── components/
│   └── DashboardLayout.tsx         # Shared dashboard layout
└── lib/
    ├── auth.ts                     # Authentication helpers
    └── db.ts                       # In-memory database
```
