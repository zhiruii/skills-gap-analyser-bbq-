import { NextRequest, NextResponse } from 'next/server';
import Exa from 'exa-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const exa = new Exa(process.env.EXA_API_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const projectsRaw = fs.readFileSync(path.join(process.cwd(), 'data/projects.json'), 'utf8');
const projects: { section: string; name: string; link: string }[] = JSON.parse(projectsRaw);
const projectsText = projects.map(p => `[${p.section}] ${p.name} — ${p.link}`).join('\n');

// In-memory rate limiter (per IP, 3 requests per minute)
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;

const MAX_ROLE_LEN = 200;
const MAX_PROFILE_LEN = 5000;

function normalize(skill: string) {
  return skill.toLowerCase().trim();
}

const SYNONYMS: Record<string, string> = {
  // SQL variants
  'microsoft sql server': 'sql', 'postgresql': 'sql', 'mysql': 'sql',
  'ms sql': 'sql', 'sqlite': 'sql', 'nosql': 'nosql',
  // Excel variants
  'excel macros': 'excel', 'microsoft excel': 'excel', 'ms excel': 'excel',
  // ETL variants
  'etl pipelines': 'etl', 'etl/elt': 'etl', 'elt': 'etl',
  // Visualisation variants
  'data visualization tools': 'data visualization', 'visualization tools': 'data visualization',
  'data visualisation': 'data visualization', 'visualisation tools': 'data visualization',
  // ML variants
  'machine learning algorithms': 'machine learning', 'ml': 'machine learning',
  'ml models': 'machine learning',
  // Snowflake variants
  'snowflake cortex': 'snowflake', 'snowflake-ml-python': 'snowflake',
  // Python variants
  'python scripting': 'python', 'python programming': 'python',
  'front-end python libraries': 'python',
  // Power Platform
  'power query': 'power bi', 'power automate': 'power platform',
  // JS/TS
  'js': 'javascript', 'ts': 'typescript',
  'node': 'node.js', 'nodejs': 'node.js',
  'react.js': 'react', 'reactjs': 'react',
  'vue.js': 'vue', 'vuejs': 'vue',
  // LLM variants
  'llms': 'llm', 'llm apis': 'llm', 'large language models': 'llm',
  'generative ai': 'generative ai (genai)', 'genai': 'generative ai (genai)',
  'generative ai (genai)': 'generative ai (genai)',
  // NLP
  'natural language processing': 'nlp',
  // Cloud/big data
  'databricks': 'databricks', 'apache spark': 'spark', 'apache flink': 'flink',
  'hadoop': 'hadoop',
  // Pandas/numpy
  'pandas': 'pandas', 'numpy': 'numpy',
};

// Preferred display names for canonical keys (acronyms etc.)
const DISPLAY_NAMES: Record<string, string> = {
  'sql': 'SQL', 'nosql': 'NoSQL', 'etl': 'ETL', 'nlp': 'NLP',
  'llm': 'LLM', 'ml': 'ML', 'ai': 'AI', 'genai': 'GenAI',
  'generative ai (genai)': 'Generative AI', 'power bi': 'Power BI',
  'power platform': 'Power Platform', 'r': 'R',
  'node.js': 'Node.js', 'next.js': 'Next.js', 'vue': 'Vue',
  'javascript': 'JavaScript', 'typescript': 'TypeScript',
  'rest apis': 'REST APIs', 'rest api': 'REST APIs',
  'graphql': 'GraphQL', 'postgresql': 'PostgreSQL',
  'mysql': 'MySQL', 'mongodb': 'MongoDB', 'aws': 'AWS',
  'gcp': 'GCP', 'ci/cd': 'CI/CD', 'html/css': 'HTML/CSS',
  'html': 'HTML', 'css': 'CSS', 'api': 'API',
};

function canonicalize(skill: string): string {
  const key = normalize(skill);
  return SYNONYMS[key] ?? key;
}

function toDisplayName(canonical: string): string {
  if (DISPLAY_NAMES[canonical]) return DISPLAY_NAMES[canonical];
  return canonical.replace(/\b\w/g, c => c.toUpperCase());
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const now = Date.now();
  const rl = rateLimit.get(ip);
  if (rl && now < rl.resetAt) {
    if (rl.count >= RATE_LIMIT) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }
    rl.count++;
  } else {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const role = String(formData.get('role') ?? '').trim().slice(0, MAX_ROLE_LEN);
  const resumeFile = formData.get('resume');

  if (!role) {
    return NextResponse.json({ error: 'role is required' }, { status: 400 });
  }
  if (!resumeFile || !(resumeFile instanceof Blob)) {
    return NextResponse.json({ error: 'resume file is required' }, { status: 400 });
  }

  // Extract text from PDF
  let profile: string;
  try {
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const parsed = await pdfParse(buffer);
    profile = parsed.text.trim().slice(0, MAX_PROFILE_LEN);
  } catch {
    return NextResponse.json({ error: 'Failed to parse resume PDF' }, { status: 400 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Could not extract text from resume' }, { status: 400 });
  }

  // ── Step 1: Fetch 10 live job postings via Exa ──────────────────────────
  let postings: Awaited<ReturnType<typeof exa.searchAndContents>>['results'];
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const startDate = sixtyDaysAgo.toISOString().split('T')[0];

    const exaRes = await exa.searchAndContents(role, {
      numResults: 10,
      type: 'neural',
      startPublishedDate: startDate,
      includeDomains: [
        'jobs.linkedin.com', 'jobstreet.com', 'indeed.com', 'glassdoor.com',
        'mycareersfuture.gov.sg', 'internsg.com', 'jobs.lever.co',
        'builtin.com', 'careers.google.com', 'sg.prosple.com',
        'efinancialcareers.ie', 'jobsdb.com', 'sgcareersfuture.com',
      ],
      contents: { text: { maxCharacters: 4000 } },
    });
    postings = exaRes.results;
  } catch (err) {
    console.error('Exa error:', err);
    return NextResponse.json({ error: 'Failed to fetch job postings' }, { status: 502 });
  }

  // ── Step 2: Extract skills from each posting in parallel (Prompt 1) ──────
  type ExtractionResult = {
    company: string;
    url: string;
    skills: { skill: string; context: string | null }[];
  };

  const extractionResults: ExtractionResult[] = await Promise.all(
    postings.map(async (posting): Promise<ExtractionResult> => {
      const company = posting.title ?? posting.url;
      const url = posting.url;
      const text = (posting as typeof posting & { text?: string }).text ?? '';

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Extract all technical skills, tools, and technologies from this job description. For each skill, capture exactly what the role expects the candidate to DO with it, based strictly on what is written in the job description.

Return only a JSON array, no explanation, no markdown, no backticks.

Return this exact structure:
[
  {
    "skill": "SQL",
    "context": "write complex analytical queries, CTEs, window functions, optimize slow queries"
  }
]

STRICT RULES:
- Extract only technical skills, tools, and technologies
- context must come strictly from the job description text
- Do not infer or assume context not explicitly written
- If no context is given for a skill beyond its name, set context to null
- Return only the JSON array, nothing else

JOB DESCRIPTION:
${text}`,
          }],
        });

        const raw = completion.choices[0]?.message?.content ?? '';
        try {
          const parsed = JSON.parse(raw);
          return { company, url, skills: Array.isArray(parsed) ? parsed : [] };
        } catch {
          console.error('Prompt 1 parse error for', url, '\nRaw:', raw);
          return { company, url, skills: [] };
        }
      } catch (err) {
        console.error('Prompt 1 API error for', url, err);
        return { company, url, skills: [] };
      }
    })
  );

  // ── Step 3: Aggregate across all 10 postings ─────────────────────────────
  type AggEntry = {
    skill: string;         // display name (canonical, title-cased)
    count: number;         // number of unique postings containing this skill
    seenInPostings: Set<string>;
    contexts: string[];
    receipts: { company: string; url: string; quote: string }[];
  };

  const agg = new Map<string, AggEntry>();

  for (const result of extractionResults) {
    const seenThisPosting = new Set<string>();
    for (const { skill, context } of result.skills) {
      const key = canonicalize(skill);
      // Only count each skill once per posting
      if (seenThisPosting.has(key)) continue;
      seenThisPosting.add(key);

      if (!agg.has(key)) {
        agg.set(key, { skill: toDisplayName(key), count: 0, seenInPostings: new Set(), contexts: [], receipts: [] });
      }
      const entry = agg.get(key)!;
      entry.count++;
      entry.seenInPostings.add(result.url);
      const validContext = context && context !== 'null' && context.length >= 15 ? context : null;
      if (validContext) {
        entry.contexts.push(validContext);
        if (entry.receipts.length < 3) {
          entry.receipts.push({ company: result.company, url: result.url, quote: validContext });
        }
      }
    }
  }

  const aggregatedSkills = Array.from(agg.values())
    .filter(e => e.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(e => ({
      skill: e.skill,
      frequency: `${e.count}/10`,
      contexts: e.contexts,
      receipts: e.receipts,
    }));

  const n = postings.length;

  // ── Step 4: Gap analysis (Prompt 2) ──────────────────────────────────────
  let gapTable: {
    skill: string;
    frequency: string;
    match: 'full' | 'partial' | 'missing';
    note: string | null;
    evidence: string | null;
  }[] = [];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a precise technical recruiter assessing how well a candidate's profile matches what the market expects for their target role. Your assessment must be grounded strictly in evidence from their profile. Never infer, assume, or give benefit of the doubt.

TARGET ROLE:
${role}

USER'S CURRENT PROFILE:
${profile}

Read the profile carefully before assessing anything. Check ALL of these sections:
1. Projects — infer only skills clearly and directly demonstrated by what is described
2. Technical Skills section — ANY skill explicitly listed here counts as at minimum "partial", even without a project. The candidate claims it but has not demonstrated the full depth the market expects. Do NOT mark a skill as "missing" if it appears in the Technical Skills section.
3. Experience / internships — credit only skills explicitly mentioned
- Vague descriptions do not count as evidence for "full" — but a bare listing in Technical Skills is enough for "partial"

MARKET SKILL REQUIREMENTS (aggregated from ${n} live job postings):
${JSON.stringify(aggregatedSkills.map(s => ({
  skill: s.skill,
  frequency: s.frequency,
  contexts: s.contexts,
})), null, 2)}

YOUR TASK:
For each skill in the market requirements:
1. Read all context strings to understand what depth and usage the market expects
2. Look for direct evidence of that skill in the user profile
3. Judge how well the user's demonstrated experience meets what the market collectively expects
4. Assign one of three match levels:

- "full": user clearly demonstrates this skill at the depth and usage the market expects
- "partial": user has foundational exposure or a related skill but not the specific depth, tool, or usage the contexts indicate
- "missing": no evidence of this skill anywhere in the profile

Return this exact JSON structure:
[
  {
    "skill": "SQL",
    "frequency": "9/10",
    "match": "missing",
    "note": null,
    "evidence": null
  }
]

STRICT RULES:
- Every skill from market requirements must appear in output
- Base every judgment strictly on profile evidence provided
- evidence field: required for full and partial, null for missing — write 1-2 sentences grounded in the exact words, numbers, and techniques from the resume. Quote specific metrics (e.g. "87.5% validation accuracy", "0.65 mAP"), specific method names (e.g. "fine-tuned MobileNetV2 via transfer learning"), and specific outcomes. Do not paraphrase generically — if the resume says "15% relative mAP improvement", say that. For full: explain exactly what in the resume meets the market expectation at the required depth. For partial: explain what specific evidence exists and precisely what depth is still missing compared to what the contexts require.
- note field: null for all — use evidence to carry all reasoning
- Return only the JSON array, nothing else`,
      }],
    });

    const raw = (completion.choices[0]?.message?.content ?? '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    try {
      const parsed = JSON.parse(raw);
      gapTable = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error('Prompt 2 parse error\nRaw:', raw);
      gapTable = [];
    }
  } catch (err) {
    console.error('Prompt 2 API error:', err);
  }

  // Attach receipts from aggregation to each gap table row
  const receiptsMap = Object.fromEntries(
    aggregatedSkills.map(s => [canonicalize(s.skill), s.receipts])
  );
  const gapTableWithReceipts = gapTable.map(row => ({
    ...row,
    receipts: receiptsMap[canonicalize(row.skill)] ?? [],
  }));

  // ── Step 5: Roadmap (Prompt 3) ────────────────────────────────────────────
  let roadmap: {
    skill: string;
    frequency: string;
    match: 'partial' | 'missing';
    closeTheGap: string;
    learnIt: string;
    whyFastestPath: string;
    resumeBullet: string;
  }[] = [];

  const gaps = gapTableWithReceipts
    .filter(r => r.match === 'partial' || r.match === 'missing')
    .sort((a, b) => {
      const freqA = parseInt(a.frequency) || 0;
      const freqB = parseInt(b.frequency) || 0;
      return freqB - freqA;
    });

  if (gaps.length > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are a career coach building a personalised action plan for a CS student. Every recommendation must be grounded in their specific existing projects, experiences, and skills. Never give generic advice that ignores what they already have. Never suggest building something they have already built.

TARGET ROLE:
${role}

USER'S CURRENT PROFILE:
${profile}

SKILL GAP ANALYSIS (from ${n} live job postings):
${JSON.stringify(gaps.map(({ skill, frequency, match, note, evidence }) => ({ skill, frequency, match, note, evidence })), null, 2)}

Each entry contains:
- skill: the technology or tool
- frequency: how often it appears across postings
- match: partial or missing
- note: for partial matches, exactly what depth they lack and what the market expects
- evidence: for partial matches, what they already have

Read every note and evidence field before writing anything. Your roadmap must reflect what this specific person has, not a generic CS student.

CURATED PROJECT IDEAS FOR REFERENCE:
${projectsText}
Use these where genuinely relevant with their specific link. If nothing fits naturally, draw from your own knowledge. Do not force a reference.

YOUR TASK:
For each skill where match is "partial" or "missing", return a JSON object with these fields.

Return only a JSON array, no explanation, no markdown, no backticks.

[
  {
    "skill": "Tableau",
    "frequency": "6/10",
    "match": "partial",
    "closeTheGap": "Your Spotify Analysis Project already demonstrates strong data visualisation logic in matplotlib — rebuild that dashboard in Tableau Public, connecting to your existing cleaned dataset, to demonstrate the specific tool the market requires.",
    "learnIt": "Tableau Public free training — 'Getting Started' path on Tableau's official site (free, ~3 hours)",
    "whyFastestPath": "You already think in visualisation layers from your matplotlib work — this is a tool switch, not a concept switch, so you can focus on Tableau syntax rather than learning data viz from scratch.",
    "resumeBullet": "Rebuilt Spotify listening analysis dashboard in Tableau, visualising 12 months of streaming data across artist, genre, and time-of-day dimensions for stakeholder presentation."
  }
]

STRICT RULES:
- Only generate entries for partial and missing skills
- Read evidence and note fields before writing each entry
- For partial: always acknowledge existing evidence in closeTheGap before stating what is still needed. Reference the specific project or experience from the evidence field.
- For missing: suggest one specific project to build at the depth level the aggregated contexts imply, not beginner level if the market expects intermediate or advanced usage
- Never suggest building something already in their profile — cross-check the evidence fields across ALL skills before writing each closeTheGap
- closeTheGap must be one specific, actionable sentence. Name the specific project or extension.
- learnIt: one free resource, named explicitly with specific course or resource name. Never "search YouTube for tutorials." Never recommend paid resources when free ones exist.
- whyFastestPath: one sentence connecting this gap to something already in their profile. For partial matches, reference what they already have from the evidence field and explain why that makes closing this gap faster than starting from scratch.
- resumeBullet: past tense, achievement-framed, names the specific project from closeTheGap, contains a concrete outcome or metric, no placeholders. Must read as a real CV line, not a template. Should feel earned with a plausible specific outcome.
- If curated project ideas have a directly relevant project, cite it with its specific link in closeTheGap
- Never suggest timelines, phases, or weekly schedules
- Return only the JSON array, nothing else`,
        }],
      });

      const raw = (completion.choices[0]?.message?.content ?? '').replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        roadmap = Array.isArray(parsed) ? parsed : [];
      } catch {
        console.error('Prompt 3 parse error\nRaw:', raw);
        roadmap = [];
      }
    } catch (err) {
      console.error('Prompt 3 API error:', err);
    }
  }

  return NextResponse.json({
    postings: postings.map(p => ({ title: p.title, url: p.url })),
    aggregatedSkills,
    gapTable: gapTableWithReceipts,
    roadmap,
  });
}
