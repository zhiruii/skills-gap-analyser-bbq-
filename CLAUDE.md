## Project Status (as of 2026-06-27)

### File Structure
```
sup-hackathon/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       └── route.ts        ← PRODUCTION: full pipeline (Steps 1–5) in one POST route
│   ├── page.tsx                ← placeholder, teammate handles UI
│   ├── layout.tsx
│   └── globals.css
├── data/
│   ├── projects.json           ← scraped from practical-tutorials/project-based-learning README
│   ├── test_resume.pdf         ← Li Zhirui's resume (test subject 1)
│   └── test_resume_2.pdf       ← test subject 2
├── scripts/
│   ├── test-exa.mjs            ← dev tool: test Pipeline 1 only (Exa + extraction + aggregation)
│   ├── test-gap.mjs            ← dev tool: test Pipeline 1 + 2 (adds LLM gap analysis)
│   └── test-roadmap.mjs        ← dev tool: test Pipeline 1 + 2 + 3 (full pipeline with roadmap)
├── .env.local                  ← EXA_API_KEY, OPENAI_API_KEY (never committed)
└── .gitignore
```

### Pipelines Completed

**Pipeline 1 — Market Signal (DONE, tested)**
- Exa `searchAndContents` with 60-day date filter + job board domain whitelist
- 10 parallel `gpt-4o-mini` calls (Prompt 1) extract `{ skill, context }` per posting
- Aggregation: per-posting deduplication, synonym normalisation, frequency filter (≥3/10), cap at top 20
- Output: `aggregatedSkills[]` with `skill`, `frequency`, `contexts[]`, `receipts[]` (company, URL, verbatim quote)

**Pipeline 2 — Gap Analysis (DONE, tested)**
- Model: `gpt-4o` (upgraded from mini for reliable instruction-following)
- Input: role + extracted PDF resume text + aggregated skills from Pipeline 1
- Output: gap table with `match` (full/partial/missing), `evidence` (specific quotes/metrics from resume), `receipts[]`
- Resume ingested via `pdf-parse` — user uploads PDF, text extracted server-side
- Prompt instructs model to cite exact metrics, technique names, and numbers from resume (not generic descriptions)

**Pipeline 3 — Roadmap (DONE, tested)**
- Model: `gpt-4o` | `temperature: 0` | `max_tokens: 3000`
- Input: role + resume text + gap table (partial/missing only, sorted by frequency desc) + `data/projects.json` as flat text
- Output: JSON array of cards, one per partial/missing skill, each with: `skill`, `frequency`, `match`, `closeTheGap`, `learnIt`, `whyFastestPath`, `resumeBullet`
  - closeTheGap: for partial — acknowledge existing evidence, state specific extension to add. For missing — suggest one specific project at the depth contexts describe. Reference projects.json where genuinely relevant.
  - learnIt: one free resource, named explicitly with specific link or course name. Never "search YouTube", never paid.
  - whyFastestPath: one sentence connecting gap to something already in their profile.
  - resumeBullet: past-tense, names the specific project, contains a concrete outcome or metric, no placeholders. Reads as a real CV line.
- Strict constraints: never suggest building something already in profile (cross-check evidence fields), resume bullet must feel earned with plausible specific outcome, no timelines or weekly schedules, output only cards with no preamble
- JSON parse error handling: strip markdown fences, try-catch with raw output logging, fallback to empty array
- Rationale for gpt-4o: roadmap is the most visible output to judges — model must cross-reference resume evidence, market contexts, and projects.json together to produce genuinely personalised guidance. gpt-4o-mini is not consistent enough for this level of reasoning.

### Key Implementation Decisions
- `gpt-4o` for Prompt 2 (gap analysis) — `gpt-4o-mini` failed to follow multi-part evidence instructions reliably
- `gpt-4o-mini` for Prompt 1 ×10 (extraction) — simpler task, cost matters at 10× parallel
- 60-day Exa date filter — 30 days too thin for niche roles, 60 days balances recency vs volume
- `includeDomains` whitelist on Exa — prevents personal portfolios/resumes being returned as job postings
- PDF resume upload via `multipart/form-data` — better UX than text paste
- Streaming (SSE) to be added to route for loading state — not yet implemented
- Test scripts in `scripts/` are dev-only, not part of production build

---

## Key Law: Security First
Even though this is a hackathon project, treat it like a real product. Security and cost-safety are never an afterthought to bolt on later — they must be considered at every step of building, not just at the end.
Specifically, always keep in mind:
- API keys (Exa, OpenAI) must never be exposed to the browser/client — they only ever live in server-side code (`.env.local`, API routes), never in client components or responses sent to the browser.
- Every public-facing API route must have abuse protection: rate limiting (per IP) so no one can spam requests and rack up API costs on our behalf.
- All user input (role string, profile/resume text) must be length-capped and validated server-side before being sent to Exa or an LLM — uncapped input is an uncapped cost.
- Every LLM call must have a `max_tokens` cap so a runaway response can't balloon cost.
- Beyond code-level protections, hard dollar spending caps should be set directly in the OpenAI and Exa billing dashboards — this is the real backstop against any bug or oversight in our own rate-limiting code.
This principle applies to every feature added going forward: if a new feature calls an external paid API, it ships with these protections from the start, not after.

## Context
Build2026 — 12-hour in-person hackathon, VC and sponsor judges on the ground.
Track: Future of Work.
Tech partners: OpenAI (Codex), Exa, Cursor, Zo Computer.
Prizes: Top 3 cash prizes (>$900), >$5000 in credits.

## What We Submitted When Asked "What Do You Want to Build"
We're building a career gap analyser for CS students targeting tech internships and entry-level roles — grounded in live market data, not generic advice.

The problem: you don't know what you lack for that dream role, and the advice you get is too vague to act on. Most tools scan one job posting for keyword matches. We analyse ten at once, and we go deeper than keywords.

Here's how it works: the user inputs a target role and pastes their profile. The agent queries Exa to fetch 10 real, current job postings. An LLM reads each posting and extracts not just what skills are required, but what each role expects you to do with them. Our code aggregates that signal across all 10 postings by frequency. A second LLM call compares the aggregated market expectations against the user's specific projects, certifications, and experience — judging not just whether a word appears in their resume, but whether they've demonstrated the depth the market actually expects. A final LLM call generates a personalised roadmap grounded in what they already have.

The output isn't "learn SQL." It's "SQL appears in 9 of 10 postings expecting CTEs and window functions — your data project shows basic queries, so extend it with an analytical layer to close this gap specifically."

This fits squarely in the Future of Work track. The core insight is that a single posting is noise; ten postings is signal. And keyword presence is noise; demonstrated depth is signal. We extract both layers and turn them into something a student can act on today.

## What We Are Building
A career gap analyser specifically for tech students and CS graduates targeting tech internships and entry-level roles. The user inputs a target role and pastes their resume or profile. The agent fetches 10 live job postings via Exa, extracts what the market actually expects, and compares that against the user's specific experience — projects, certifications, internships. The output is a skills match table and a personalised roadmap to close the gaps.

This is not a keyword matcher. It extracts what each role expects you to DO with each tool, aggregates that signal across 10 postings, and judges the user's fit based on evidence in their profile — not just whether a word appears in their resume.

One-sentence pitch: "We analyse 10 live job postings to tell you exactly what the market wants, where your resume stands against that signal, and what to build this weekend to close the gap."

Key differentiator over tools like Jobscan: Jobscan matches keywords. We extract expected usage depth per skill from multiple postings, assess it against the user's demonstrated project experience, and produce a personalised roadmap grounded in what they already have.

## What Makes This Defensible (Keep This in Mind Throughout)
A power user with the right prompts could approximate what we do manually. That is true and we don't pretend otherwise. But two things genuinely don't replicate in a ChatGPT session:

**Live data, not model memory.** The job market is volatile. What a data analyst role required two years ago is not what it requires today. We fetch 10 real postings at query time, every run. The signal is current because the data is current — not because the model thinks it is. No amount of prompting a static model gives you this.

**Verifiable receipts, not advice you have to trust.** Every claim in our output comes with a real company name, a real quote, and a link the user can click. That is the difference between advice you have to trust and advice you can verify. In a world where models hallucinate confidently, showing the receipts is what makes us trustworthy.

These two properties are not cosmetic — they should inform every design and build decision:
- The live Exa fetch is the core product. The loading state should make this visible ("Fetching live job postings from Grab, DBS, Sea Group..."), not hide it.
- Market receipts are not a UI flourish. They are the trust mechanism. Every skill row must surface them. If the receipts break, the product's credibility breaks with them.
- The architectural personalisation (structured evidence passed into every LLM call, not generic prompting) is what separates our output from a ChatGPT session — build every prompt and every call with this constraint enforced, not added later.

If a judge asks how we're different from a GPT wrapper, the 30-second answer is: live data, and receipts you can click. Everything else supports those two points.

## Pre-Hackathon Prep (Done Before the Event)
The following should be completed before hackathon day. Writing submission code in advance is not permitted — but these are preparation steps, not submission code.

1. API keys obtained and tested: `EXA_API_KEY`, `OPENAI_API_KEY`
2. Node.js, npm, Next.js confirmed installed on the machine being used
3. `exa-js` SDK and `openai` SDK installed and import tested
4. Prompts for all 3 LLM calls are written and tested in ChatGPT/Claude with realistic sample inputs — see prompt section below
5. Project-based-learning repo README scraped, cleaned, and saved as `data/projects.json` — Actually to be done during the actual day

## Product Definition
A web app. User inputs:
- Target role (text field) e.g. "data analyst intern fintech Singapore"
- Their profile (text area) — resume paste, skills list, or project descriptions

User sees:
- A radar chart: visual overview of their skill coverage vs. market expectation — the shape of the gap at a glance
- A skills match table: every skill the market requires, frequency across postings, match level (full / partial / missing), market receipts (real quotes from real companies with links), and personalised reasoning referencing their actual projects by name
- A personalised roadmap: one card per gap, grounded in what they already have, with a specific action, a free resource, and a ready-to-paste resume bullet

## Complete Agent Pipeline

```
User inputs role + profile
        ↓
Exa fetches 10 live job postings (full text)
        ↓
×10 LLM calls in parallel (Promise.all)
Each call extracts { skill, context } pairs from one posting
        ↓
Your code aggregates across all 10 results:
- Count frequency per skill (case-normalised)
- Collect all context strings per skill
- Track source attribution per skill: company name, URL, and verbatim quote from the Exa result (stored as receipts[], passed directly to the UI — not generated by any LLM)
- Filter out skills appearing in fewer than 3/10 postings
- Cap at top 20 skills by frequency
        ↓
×1 LLM call — Gap Analysis
Inputs: aggregated { skill, frequency, contexts[] } + user profile
Output: gap table JSON with match level + evidence + note per skill
        ↓
×1 LLM call — Roadmap Generation
Inputs: gap table + user profile + scraped project repo content
Output: personalised scannable roadmap, one entry per partial/missing skill
        ↓
UI renders: skills match table + roadmap side by side
```

Total LLM calls: 12 (10 extraction + 1 gap analysis + 1 roadmap)

## The Three LLM Prompts

### Prompt 1 — Skill Extraction (runs ×10, one per job posting)
Model: `gpt-4o-mini` | Temperature: `0` | Max tokens: `400`

```
Extract all technical skills, tools, and technologies from this 
job description. For each skill, capture exactly what the role 
expects the candidate to DO with it, based strictly on what is 
written in the job description.

Return only a JSON array, no explanation, no markdown, no backticks.

Return this exact structure:
[
  {
    "skill": "SQL",
    "context": "write complex analytical queries, CTEs, window functions, optimize slow queries"
  },
  {
    "skill": "Python",
    "context": "automate ETL pipelines and clean datasets"
  }
]

STRICT RULES:
- Extract only technical skills, tools, and technologies
- context must come strictly from the job description text
- Do not infer or assume context not explicitly written
- If no context is given for a skill beyond its name, set context to null
- Return only the JSON array, nothing else

JOB DESCRIPTION:
{job_posting_text}
```

### Prompt 2 — Gap Analysis (runs ×1)
Model: `gpt-4o-mini` | Temperature: `0` | Max tokens: `1500`

```
You are a precise technical recruiter assessing how well a 
candidate's profile matches what the market expects for their 
target role. Your assessment must be grounded strictly in 
evidence from their profile. Never infer, assume, or give 
benefit of the doubt.

TARGET ROLE:
{role}

USER'S CURRENT PROFILE:
{profile}

Read the profile carefully before assessing anything:
- For each project: infer only skills clearly and directly 
  demonstrated by what is described
- For each certification or course: credit only skills that 
  qualification explicitly covers
- For each job or internship: credit only skills explicitly 
  mentioned in that experience
- Vague descriptions do not count as evidence

MARKET SKILL REQUIREMENTS (aggregated from {n} live job postings):
{aggregated_skills}

Format of each skill entry passed in:
{
  "skill": "SQL",
  "frequency": "9/10",
  "contexts": [
    "write complex analytical queries and CTEs",
    "window functions and query optimization",
    "basic reporting pulls",
    "design warehouse schemas"
  ]
}

YOUR TASK:
For each skill in the market requirements:
1. Read all context strings to understand what depth and usage 
   the market expects
2. Look for direct evidence of that skill in the user profile
3. Judge how well the user's demonstrated experience meets 
   what the market collectively expects
4. Assign one of three match levels:

- "full": user clearly demonstrates this skill at the depth 
  and usage the market expects based on contexts
- "partial": user has foundational exposure or a related skill 
  but not the specific depth, tool, or usage the contexts indicate.
  Examples: knows basic SQL but not CTEs or window functions when 
  contexts ask for them; knows matplotlib but not Tableau; knows 
  Python basics but not ETL automation
- "missing": no evidence of this skill anywhere in the profile

Return this exact JSON structure:
[
  {
    "skill": "SQL",
    "frequency": "9/10",
    "match": "missing",
    "note": null,
    "evidence": null
  },
  {
    "skill": "Python",
    "frequency": "8/10",
    "match": "full",
    "note": null,
    "evidence": "Demonstrated through pandas and numpy in the Spotify Analysis Project and the NLP Resume Classifier. ETL automation in the classifier aligns directly with what postings expect."
  },
  {
    "skill": "Tableau",
    "frequency": "6/10",
    "match": "partial",
    "note": "Postings expect Tableau specifically for business dashboards and stakeholder reporting — the Spotify Analysis Project uses matplotlib, which demonstrates the same visualisation logic but is a different tool.",
    "evidence": "Spotify Analysis Project uses matplotlib for data visualisation, showing the underlying skill but not the specific tool the market requires."
  }
]

STRICT RULES:
- Every skill from market requirements must appear in output
- Base every judgment strictly on profile evidence provided
- Do not credit skills from vague or unclear descriptions
- Do not assume a related skill means the target skill is known
- Do not give credit for a skill because a related one exists
- evidence field: required for full and partial, null for missing — must name the specific project or experience from the profile, never describe it generically
- note field: required for partial only, null for full and missing
- note must reference specific contexts from postings to explain 
  exactly what depth the market expects that the user lacks
- Return only the JSON array, nothing else
```

### Prompt 3 — Roadmap Generation (runs ×1)
Model: `gpt-4o-mini` | Temperature: `0` | Max tokens: `2500`

```
You are a career coach building a personalised action plan for 
a CS student. Every recommendation must be grounded in their 
specific existing projects, experiences, and skills. Never give 
generic advice that ignores what they already have. Never 
suggest building something they have already built.

TARGET ROLE:
{role}

USER'S CURRENT PROFILE:
{profile}

SKILL GAP ANALYSIS (from {n} live job postings):
{gap_table}

Each entry contains:
- skill: the technology or tool
- frequency: how often it appears across postings
- match: partial or missing
- note: for partial matches, exactly what depth they lack 
  and what the market expects
- evidence: for partial matches, what they already have

Read every note and evidence field before writing anything. 
Your roadmap must reflect what this specific person has, 
not a generic CS student.

CURATED PROJECT IDEAS FOR REFERENCE:
{scraped_repo_content}
Use these where genuinely relevant with their specific link. 
If nothing fits naturally, draw from your own knowledge. 
Do not force a reference.

YOUR TASK:
For each skill where match is "partial" or "missing", 
produce exactly this format:

[SKILL NAME] — [X/10] postings — [partial/missing]

Close the gap:
For partial: reference the evidence field — acknowledge what 
they already have, then say specifically what to add to their 
existing project to demonstrate the missing depth.
For missing: suggest one specific project to build that directly 
demonstrates this skill at the level the contexts describe.
One sentence. Name the specific project or extension.

Learn it:
One free resource. Name it explicitly and specifically.
No generic suggestions like "search YouTube for tutorials."

Why this is your fastest path:
One sentence connecting this gap to something already in their 
profile. For partial matches, reference what they already have 
from the evidence field and explain why that makes closing this 
gap faster than starting from scratch.

Resume bullet (copy once done):
One achievement-framed sentence the user can paste directly into 
their CV once the suggested project is complete. Past tense. 
Specific to the project named in "Close the gap." No placeholder 
text. Should read as a real CV line, not a template.

---

STRICT RULES:
- Only generate entries for partial and missing skills
- Read evidence and note fields before writing each entry
- For partial: always acknowledge existing evidence before 
  stating what is still needed
- For missing: suggest projects at the depth level the 
  aggregated contexts imply, not beginner level if the 
  market expects intermediate or advanced usage
- Never suggest building something already in their profile
- Never recommend paid resources when free ones exist
- Never suggest timelines, phases, or weekly schedules
- Resume bullet must be past tense, name the specific project 
  from "Close the gap," and contain no placeholder text
- If repo content has a directly relevant project cite it 
  with its specific link
- Output only the roadmap entries, no preamble, no summary, 
  no closing remarks
```

## Aggregation Logic (Step Between Prompt 1 and Prompt 2)
Run this in your own code — no LLM call needed.

- Normalize each skill to lowercase for counting, but preserve the original casing for display (track the first-seen original string per normalized key)
- Count how many of the 10 postings each skill appears in
- Collect all context strings per skill into a list — these get passed raw to Prompt 2 so the LLM synthesizes the signal itself
- Filter out skills appearing in fewer than 3 of 10 postings — keeps the table focused on real market signal, not niche one-off requirements
- Cap at the top 20 skills by frequency before passing to Prompt 2

Also track source attribution per skill: for each context string collected, store the company name, URL, and verbatim quote from the Exa result it came from. These are stored as `receipts[]` on each aggregated skill entry and passed directly to the frontend to render as market evidence — the LLM does not generate them. Cap at 3 receipts per skill for display (highest-frequency sources first).

Synonyms (e.g. "SQL" vs "Microsoft SQL Server") will count as separate skills under simple exact-match counting. A small synonym dictionary applied before counting improves accuracy; treat as a nice-to-have rather than a blocker for a working demo.

## Pre-Scraped Project Repo
Source: https://github.com/practical-tutorials/project-based-learning (README only, not linked destinations)

Scrape the README markdown once before the hackathon. Parse it into a flat JSON list using section headings as loose skill context. Store at `data/projects.json`. Each entry needs: name, link, and section (the language or topic heading it appeared under).

This file is loaded at server startup and injected as `{scraped_repo_content}` into Prompt 3. The LLM reasons over it to find relevant projects — no tagging or skill mapping needed. If the repo has nothing relevant for a given gap, the LLM falls back to its own knowledge.

The repo is strong on: web apps, ML/deep learning, data science, bots, computer vision.
The repo is thin on: SQL, Excel, Tableau, dbt.
For gaps the repo does not cover, the LLM generates specific free resource recommendations from its own knowledge. This is expected and fine.

## JSON Parsing — Critical
Every one of the 12 LLM calls returns JSON. A single malformed response breaks that stage silently if not handled. Wrap every JSON parse in try-catch and log the raw model response on failure — a truncated or malformed response is diagnosable when you can see the raw output, but looks like the pipeline produced nothing if you let it fail silently. Return a safe fallback value (empty array), never let a parse error propagate as an empty result.

A low-content Exa posting (cookie banners, navigation only) should produce an empty array `[]` from Prompt 1 — that is correct behaviour, not an error. The aggregation step handles sparse results naturally.

## Exa Integration Notes
Use the `exa-js` SDK (not the Python `exa_py` SDK).

Call `exa.searchAndContents(role, {...})` and request `contents: { text: { maxCharacters: 4000 } }` — use `text` not `highlights`. Extraction needs the full job description body, not a short query-relevant excerpt.

Some postings will return low-content pages because career sites render their content client-side (the page returns only navigation, cookie banners, footers). Prompt 1 handles this gracefully by returning `[]` — design the extraction step to tolerate low-content results rather than trying to eliminate them at the source.

Run all 10 extraction calls in parallel (Promise.all), not sequentially — there is no reason to wait on each call one at a time.

## Front-End Design & Output
Personalisation is the product's core differentiator. Every element the judge sees should make that tangible — real company names, real quotes, and reasoning that names the user's actual projects. A generic-looking output loses the whole point.

### Radar Chart
Sits at the top of the results page before the table. Two overlapping polygons on the same axes:
- Axes = top 8 skills by frequency
- "Market expects" polygon = outer boundary (axis length = frequency weight, normalised to 1.0)
- "Your coverage" polygon = inner (full=1.0, partial=0.5, missing=0)

The shape of the gap is visible in one glance. This is the visual hook for the demo — put it first.

### Skills Match Table
Sorted by frequency descending. Color-coded rows: green (full), amber (partial), red (missing). Default collapsed view:
```
SKILL       FREQ    MATCH
SQL         9/10    ● Missing
Tableau     6/10    ◐ Partial
Python      8/10    ✓ Full
```

Clicking a row expands two panels:

**MARKET RECEIPTS** — 2–3 verbatim quotes from real Exa results, each with company name and a clickable link to the actual posting. These come from `receipts[]` in the aggregated data, not generated by the LLM:
```
Grab — "Strong proficiency in SQL including window functions and CTEs required" → [link]
Sea Group — "Design and maintain data warehouse schemas using SQL" → [link]
```

**WHY YOU'RE MARKED [MISSING / PARTIAL / FULL]** — the `evidence` and `note` fields from Prompt 2, rendered as readable prose. Must reference the user's actual project names:
```
[Missing]  Your Spotify Analysis Project uses pandas for the same data 
           manipulation logic — but no SQL appears anywhere in your profile.

[Partial]  Your Spotify Analysis Project shows strong visualisation logic 
           in matplotlib. The market expects Tableau for business dashboards 
           specifically — same skill, different tool.
```

### Roadmap Cards
One card per partial or missing skill, sorted by frequency. Four sections per card:
```
TABLEAU — 6/10 postings — partial

WHY THIS SUGGESTION
  You already built data visualisations in your Spotify Analysis Project using 
  matplotlib. The visualisation thinking is there — this is a tool switch, not 
  a concept switch. DBS and Shopee specifically want Tableau for business dashboards.

CLOSE THE GAP
  Rebuild your Spotify Analysis Project dashboard in Tableau Public, connecting 
  to your existing cleaned dataset.

LEARN IT
  Tableau Public free training — "Getting Started" path (~3 hours, free)

RESUME BULLET (copy once done)
  "Rebuilt Spotify listening analysis dashboard in Tableau, visualising 12 months 
  of streaming data across artist, genre and time-of-day dimensions for 
  stakeholder presentation"
```

The resume bullet is the product's final value-add: the user walks away knowing exactly what to build, how to learn it, and what to write on their CV when it's done. No other tool does this.

## Hackathon Day Roadmap

### Hours 1-2 — Pipeline end to end in terminal
This is the most important thing to get right before anything else. Get each step producing clean output before moving on. Do not build UI yet.

Set up the project first:
- Next.js project initialized (TypeScript, Tailwind, App Router)
- `.env.local` with `EXA_API_KEY` and `OPENAI_API_KEY`
- Basic API route at `/api/analyze`

Then work through each step in order. Do not move to the next step until the current one is producing clean output.

**Step 1 — Verify Exa returns real, readable job posting text.**
Use the `exa-js` SDK (not the Python SDK) with a hardcoded role string. Call `exa.searchAndContents` with `contents: { text: { maxCharacters: 4000 } }` — request `text`, not `highlights`. Some postings will return low-content pages (nav, cookie banners, footers) because career sites render client-side. Do not try to filter these out at the Exa call level — design the extraction step to handle them gracefully instead.

**Step 2 — Verify Prompt 1 returns clean `{ skill, context }` JSON from one posting.**
Use `gpt-4o-mini` at `temperature: 0`. Cap `max_tokens` at 400 — a skill list never needs more than a few hundred tokens. A low-content posting should return an empty array `[]` — that is the correct output, not a failure case requiring special handling. If the response is not valid JSON, log the raw model output immediately so the failure is diagnosable rather than looking like the pipeline produced nothing.

**Step 3 — Wire the parallel extraction loop across all 10 postings.**
Run all 10 calls with `Promise.all`, not sequentially. There is no reason to wait on each call one at a time.

**Step 4 — Verify aggregation produces correct `{ skill, frequency, contexts[] }` output.**
Normalize to lowercase for counting, preserve original casing for display (track first-seen original string per normalized key). Apply the minimum frequency filter (3/10) and cap at top 20 before passing anything to Prompt 2. Synonyms ("SQL" vs "Microsoft SQL Server") will count separately under exact-match — a small synonym dictionary improves accuracy but treat it as a nice-to-have, not a blocker for a working demo.

**Step 5 — Verify Prompt 2 returns clean gap table JSON with match/evidence/note fields.**
Pass only the top 20 aggregated skills — do not pass the full list. Set `max_tokens` to 1500; a response cut off mid-object will fail JSON parsing and look like an empty result. Log the raw response on parse failure so you can see whether the output was truncated or malformed. Never let a JSON parse failure propagate silently as an empty result.

**Step 6 — Verify Prompt 3 returns a readable, personalised roadmap.**
Set `max_tokens` to 2000. Confirm the output references specific things from the test profile, not generic advice. Same JSON parse error handling applies — log raw output on failure, return safe fallback.

Test input to use throughout:
```
Role: "data analyst intern fintech Singapore"
Profile: [a real teammate's actual skills, projects, and experience]
```

By end of Hour 2: hitting `/api/analyze` returns full gap table + roadmap JSON. No UI needed yet.

### Hours 3-4 — Basic UI connected to backend
Build the minimum frontend that connects to the now-working backend:
- Text input for role
- Text area for profile
- Submit button calling `/api/analyze`
- Results rendering the gap table and roadmap from returned JSON
- Loading state showing pipeline progress ("Fetching job postings → Extracting skills → Analysing your profile → Building roadmap") — latency will be 15–20 seconds, the loading state is not optional

Doesn't need to look good yet. The goal: open the browser, type a role, paste a profile, click submit, see a gap table and roadmap.

Run the real demo input through the full pipeline. Save the output to `data/fallback.json`. This is your insurance if anything breaks on stage.

### Hours 5-6 — Align team and divide work
Walk teammates through the working pipeline before dividing. Do not assume they have seen any of it.

- Person 1 — prompt tuning and pipeline reliability (the traps in Hours 1-2 are your checklist)
- Person 2 — UI polish and skills table visualization
- Person 3 — pitch deck (one slide per section: problem, insight, how it works, demo, market)

### Hours 7-9 — Build
Pipeline:
- Ensure JSON parse failures are caught and logged everywhere
- Confirm empty Exa postings produce `[]` and do not break the loop
- Confirm gap table includes all skills (full, partial, missing) not just gaps
- Fix synonym normalization if time allows

UI (this determines placing — make it genuinely good):
- See Front-End Design & Output section for component specs, layout, and examples
- Radar chart at the top — the visual hook
- Skills match table: expandable rows with market receipts (real quotes + company + link) and personalised reasoning naming specific projects
- Roadmap cards: one per gap, four sections each including resume bullet
- The personalisation is the differentiator — every piece of reasoning must name the user's actual projects, not describe them generically

Pitch:
- Problem: one slide, one sentence ("you don't know what you lack and the advice you get is too vague to act on")
- Insight: one slide ("one posting is noise, ten postings is signal — and keyword presence is noise, demonstrated depth is signal")
- How it works: one slide, the pipeline diagram
- Demo: live, with fallback JSON ready
- Market: one slide

### Hours 10-11 — Integrate, polish, demo prep
Merge all work. Run real demo input on the deployed version. Fix what breaks. Do not add features. Practice pitch out loud twice minimum. Agree who presents each section. Pre-type the demo input into the form — no live typing on stage.

### Hour 12 — Buffer
Do not build. Eat something.

## The One Thing That Determines Placing
The skills match table. Make it visually memorable. A judge who sees a clean color-coded table showing "SQL — 9/10 postings — missing" and "Python — 8/10 postings — you have this" in five seconds understands the entire product. That is what they will remember when voting. Everything else supports that moment.
