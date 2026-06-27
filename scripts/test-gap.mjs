import Exa from 'exa-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

config({ path: resolve(process.cwd(), '.env.local') });

const exa = new Exa(process.env.EXA_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROLE = 'software engineer intern Singapore';

// Read resume from PDF
const pdfBuffer = readFileSync(resolve(process.cwd(), 'data/test_resume_2.pdf'));
const pdfData = await pdfParse(pdfBuffer);
const PROFILE = pdfData.text.trim();
console.log(`\n[0] Resume extracted (${PROFILE.length} chars)\n`);

const SYNONYMS = {
  'microsoft sql server': 'sql', 'postgresql': 'sql', 'mysql': 'sql', 'ms sql': 'sql',
  'excel macros': 'excel', 'microsoft excel': 'excel', 'ms excel': 'excel',
  'etl pipelines': 'etl', 'etl/elt': 'etl', 'elt': 'etl',
  'data visualization tools': 'data visualization', 'visualization tools': 'data visualization',
  'data visualisation': 'data visualization', 'visualisation tools': 'data visualization',
  'machine learning algorithms': 'machine learning', 'ml': 'machine learning', 'ml models': 'machine learning',
  'snowflake cortex': 'snowflake', 'snowflake-ml-python': 'snowflake',
  'python scripting': 'python', 'python programming': 'python', 'front-end python libraries': 'python',
  'power query': 'power bi', 'power automate': 'power platform',
  'js': 'javascript', 'ts': 'typescript', 'node': 'node.js', 'nodejs': 'node.js',
  'react.js': 'react', 'reactjs': 'react', 'vue.js': 'vue', 'vuejs': 'vue',
  'llms': 'llm', 'llm apis': 'llm', 'large language models': 'llm',
  'generative ai': 'generative ai (genai)', 'genai': 'generative ai (genai)',
  'natural language processing': 'nlp',
  'apache spark': 'spark', 'apache flink': 'flink',
  'rest apis': 'rest apis', 'rest api': 'rest apis',
};

const DISPLAY_NAMES = {
  'sql': 'SQL', 'nosql': 'NoSQL', 'etl': 'ETL', 'nlp': 'NLP',
  'llm': 'LLM', 'power bi': 'Power BI', 'power platform': 'Power Platform',
  'javascript': 'JavaScript', 'typescript': 'TypeScript',
  'rest apis': 'REST APIs', 'graphql': 'GraphQL', 'aws': 'AWS', 'gcp': 'GCP',
  'ci/cd': 'CI/CD', 'r': 'R', 'node.js': 'Node.js',
};

function canonicalize(skill) {
  const key = skill.toLowerCase().trim();
  return SYNONYMS[key] ?? key;
}

function toDisplay(canonical) {
  return DISPLAY_NAMES[canonical] ?? canonical.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Pipeline 1: Exa + extraction + aggregation ─────────────────────────────
console.log(`\n[1] Fetching job postings for: "${ROLE}"\n`);

const sixtyDaysAgo = new Date();
sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
const startDate = sixtyDaysAgo.toISOString().split('T')[0];

const exaRes = await exa.searchAndContents(ROLE, {
  numResults: 10,
  type: 'neural',
  startPublishedDate: startDate,
  includeDomains: [
    'linkedin.com', 'jobstreet.com', 'indeed.com', 'glassdoor.com',
    'mycareersfuture.gov.sg', 'internsg.com', 'jobs.lever.co',
    'builtin.com', 'careers.google.com', 'sg.prosple.com',
    'efinancialcareers.ie', 'jobsdb.com', 'sgcareersfuture.com',
  ],
  contents: { text: { maxCharacters: 4000 } },
});

const postings = exaRes.results;
console.log(`Got ${postings.length} postings (after ${startDate}):`);
postings.forEach((p, i) => console.log(`  ${i + 1}. ${p.title ?? p.url}`));

console.log('\n[2] Extracting skills...\n');
const extractionResults = await Promise.all(
  postings.map(async (posting) => {
    const text = posting.text ?? '';
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 800,
        messages: [{ role: 'user', content: `Extract all technical skills, tools, and technologies from this job description. For each skill, capture exactly what the role expects the candidate to DO with it.

Return only a JSON array, no explanation, no markdown, no backticks.
[{ "skill": "SQL", "context": "write complex queries and CTEs" }]

STRICT RULES:
- Extract only technical skills, tools, technologies
- context must come strictly from the job description text
- If no context given, set context to null
- Return only the JSON array

JOB DESCRIPTION:
${text}` }],
      });
      const raw = res.choices[0]?.message?.content ?? '';
      try {
        const skills = JSON.parse(raw);
        console.log(`  ✓ ${posting.title?.split('|')[0].trim() ?? posting.url} → ${skills.length} skills`);
        return { company: posting.title ?? posting.url, url: posting.url, skills: Array.isArray(skills) ? skills : [] };
      } catch {
        console.error(`  ✗ Parse error for ${posting.url}\n    Raw: ${raw.slice(0, 80)}`);
        return { company: posting.title ?? posting.url, url: posting.url, skills: [] };
      }
    } catch (err) {
      console.error(`  ✗ API error: ${err.message}`);
      return { company: posting.title ?? posting.url, url: posting.url, skills: [] };
    }
  })
);

console.log('\n[3] Aggregating...\n');
const agg = new Map();
for (const result of extractionResults) {
  const seenThisPosting = new Set();
  for (const { skill, context } of result.skills) {
    const key = canonicalize(skill);
    if (seenThisPosting.has(key)) continue;
    seenThisPosting.add(key);
    if (!agg.has(key)) agg.set(key, { skill: toDisplay(key), count: 0, contexts: [], receipts: [] });
    const entry = agg.get(key);
    entry.count++;
    const validContext = context && context !== 'null' && context.length >= 15 ? context : null;
    if (validContext) {
      entry.contexts.push(validContext);
      if (entry.receipts.length < 3) entry.receipts.push({ company: result.company, url: result.url, quote: validContext });
    }
  }
}

const aggregatedSkills = Array.from(agg.values())
  .filter(e => e.count >= 3)
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

console.log(`Aggregated ${aggregatedSkills.length} skills (≥3/10):`);
aggregatedSkills.forEach(e => console.log(`  ${String(e.count).padStart(2)}/10  ${e.skill}`));

// ── Pipeline 2: Gap analysis (Prompt 2) ───────────────────────────────────
console.log('\n[4] Running gap analysis against resume...\n');

const prompt2Input = aggregatedSkills.map(s => ({
  skill: s.skill,
  frequency: `${s.count}/10`,
  contexts: s.contexts,
}));

const gapRes = await openai.chat.completions.create({
  model: 'gpt-4o',
  temperature: 0,
  max_tokens: 2000,
  messages: [{ role: 'user', content: `You are a precise technical recruiter assessing how well a candidate's profile matches what the market expects for their target role. Your assessment must be grounded strictly in evidence from their profile. Never infer, assume, or give benefit of the doubt.

TARGET ROLE:
${ROLE}

USER'S CURRENT PROFILE:
${PROFILE}

Read the profile carefully before assessing anything. Check ALL of these sections:
1. Projects — infer only skills clearly and directly demonstrated by what is described
2. Technical Skills section — ANY skill explicitly listed here counts as at minimum "partial", even without a project. The candidate claims it but has not demonstrated the full depth the market expects. Do NOT mark a skill as "missing" if it appears in the Technical Skills section.
3. Experience / internships — credit only skills explicitly mentioned
- Vague descriptions do not count as evidence for "full" — but a bare listing in Technical Skills is enough for "partial"

MARKET SKILL REQUIREMENTS (aggregated from ${postings.length} live job postings):
${JSON.stringify(prompt2Input, null, 2)}

YOUR TASK:
For each skill in the market requirements:
1. Read all context strings to understand what depth and usage the market expects
2. Look for direct evidence of that skill in the user profile
3. Assign one of three match levels:

- "full": user clearly demonstrates this skill at the depth and usage the market expects
- "partial": user has foundational exposure but not the specific depth, tool, or usage the contexts indicate
- "missing": no evidence of this skill anywhere in the profile

Return ONLY this exact JSON structure, nothing else:
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
- evidence field: required for full and partial, null for missing — write 1-2 sentences grounded in the exact words, numbers, and techniques from the resume. Quote specific metrics (e.g. "87.5% validation accuracy", "0.65 mAP"), specific method names (e.g. "fine-tuned MobileNetV2 via transfer learning"), and specific outcomes. Do not paraphrase generically — if the resume says "15% relative mAP improvement", say that. For full: explain exactly what in the resume meets the market expectation at the required depth. For partial: explain what specific evidence exists and precisely what depth is still missing compared to what the contexts require.
- note field: null for all — use evidence to carry all reasoning
- Return only the JSON array, nothing else` }],
});

const rawGap = (gapRes.choices[0]?.message?.content ?? '').replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
let gapTable = [];
try {
  gapTable = JSON.parse(rawGap);
} catch {
  console.error('Gap analysis parse error. Raw:', rawGap);
  process.exit(1);
}

// Attach receipts
const receiptsMap = Object.fromEntries(aggregatedSkills.map(s => [s.skill.toLowerCase(), s.receipts]));
const gapWithReceipts = gapTable.map(row => ({
  ...row,
  receipts: receiptsMap[row.skill.toLowerCase()] ?? [],
}));

// ── Display output in frontend format ─────────────────────────────────────
const ICONS = { full: '✓ Full', partial: '◐ Partial', missing: '● Missing' };
const COLOURS = { full: 'GREEN', partial: 'AMBER', missing: 'RED' };

console.log('\n' + '═'.repeat(70));
console.log(`SKILLS GAP TABLE — "${ROLE}"`);
console.log('═'.repeat(70));
console.log(`${'SKILL'.padEnd(22)} ${'FREQ'.padEnd(8)} MATCH`);
console.log('─'.repeat(70));

gapWithReceipts.forEach(row => {
  console.log(`${row.skill.padEnd(22)} ${row.frequency.padEnd(8)} [${COLOURS[row.match]}] ${ICONS[row.match]}`);
});

console.log('\n' + '─'.repeat(70));
console.log('EXPANDED VIEW (click to expand in UI):\n');

gapWithReceipts.forEach(row => {
  console.log(`\n${'▸ ' + row.skill.toUpperCase()} — ${row.frequency} — ${ICONS[row.match]}`);

  if (row.receipts.length > 0) {
    console.log('\n  MARKET RECEIPTS:');
    row.receipts.forEach(r => {
      const co = r.company.split('|')[0].split('—')[0].trim();
      console.log(`  • ${co}`);
      console.log(`    "${r.quote}"`);
      console.log(`    → ${r.url}`);
    });
  }

  if (row.evidence) {
    console.log(`\n  ASSESSMENT: ${row.evidence}`);
  }
  if (row.match === 'missing') {
    console.log(`\n  ASSESSMENT: No evidence of this skill anywhere in the profile.`);
  }
});

console.log('\n' + '═'.repeat(70));
console.log('RAW GAP TABLE JSON:\n');
console.log(JSON.stringify(gapWithReceipts, null, 2));
