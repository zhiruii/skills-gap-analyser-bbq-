import Exa from 'exa-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const exa = new Exa(process.env.EXA_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROLE = 'software engineer intern Singapore';

const SYNONYMS = {
  'microsoft sql server': 'sql', 'postgresql': 'sql', 'mysql': 'sql',
  'ms sql': 'sql', 'sqlite': 'sql',
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
};

function canonicalize(skill) {
  const key = skill.toLowerCase().trim();
  return SYNONYMS[key] ?? key;
}

// ── Step 1: Exa fetch ──────────────────────────────────────────────────────
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
console.log(`Got ${postings.length} postings (published after ${startDate}):`);
postings.forEach((p, i) => console.log(`  ${i + 1}. ${p.title ?? 'untitled'} — ${p.url}`));

// ── Step 2: Prompt 1 × 10 in parallel ─────────────────────────────────────
console.log('\n[2] Extracting skills from each posting...\n');
const extractionResults = await Promise.all(
  postings.map(async (posting) => {
    const text = posting.text ?? '';
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
[{ "skill": "SQL", "context": "write complex analytical queries, CTEs, window functions" }]

STRICT RULES:
- Extract only technical skills, tools, and technologies
- context must come strictly from the job description text
- If no context is given, set context to null
- Return only the JSON array, nothing else

JOB DESCRIPTION:
${text}`,
        }],
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      try {
        const skills = JSON.parse(raw);
        const count = Array.isArray(skills) ? skills.length : 0;
        console.log(`  ✓ ${posting.title ?? posting.url} → ${count} skills`);
        return { company: posting.title ?? posting.url, url: posting.url, skills: Array.isArray(skills) ? skills : [] };
      } catch {
        console.error(`  ✗ Parse error for ${posting.url}\n    Raw: ${raw.slice(0, 100)}`);
        return { company: posting.title ?? posting.url, url: posting.url, skills: [] };
      }
    } catch (err) {
      console.error(`  ✗ API error for ${posting.url}:`, err.message);
      return { company: posting.title ?? posting.url, url: posting.url, skills: [] };
    }
  })
);

// ── Step 3: Aggregate ──────────────────────────────────────────────────────
console.log('\n[3] Aggregating...\n');
const DISPLAY_NAMES = {
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

function toDisplay(canonical) {
  if (DISPLAY_NAMES[canonical]) return DISPLAY_NAMES[canonical];
  return canonical.replace(/\b\w/g, c => c.toUpperCase());
}

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
      if (entry.receipts.length < 3) {
        entry.receipts.push({ company: result.company, url: result.url, quote: validContext });
      }
    }
  }
}

const all = Array.from(agg.entries()).map(([, v]) => v).sort((a, b) => b.count - a.count);

const aggregated = all.filter(e => e.count >= 3).slice(0, 20);

console.log('═'.repeat(70));
console.log(`MARKET SIGNAL — "${ROLE}"`);
console.log(`${aggregated.length} skills across ${postings.length} live postings`);
console.log('═'.repeat(70));

aggregated.forEach((e, i) => {
  const bar = '█'.repeat(e.count) + '░'.repeat(10 - e.count);
  console.log(`\n${i + 1}. ${e.skill.toUpperCase()}  [${e.count}/10]  ${bar}`);

  if (e.contexts.length > 0) {
    console.log(`\n   What the market expects you to DO with it:`);
    const unique = [...new Set(e.contexts)].slice(0, 3);
    unique.forEach(c => console.log(`   • ${c}`));
  }

  if (e.receipts.length > 0) {
    console.log(`\n   MARKET RECEIPTS:`);
    e.receipts.forEach(r => {
      const company = r.company.split('|')[0].trim().split('—')[0].trim().split('-')[0].trim();
      console.log(`   ▸ ${company}`);
      if (r.quote && r.quote !== 'null') console.log(`     "${r.quote}"`);
      console.log(`     → ${r.url}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
});

console.log(`\n✓ Steps 1–3 complete. Receipts and contexts ready for frontend.`);
console.log('\nRAW JSON OUTPUT:\n');
console.log(JSON.stringify(aggregated.map(e => ({
  skill: e.skill,
  frequency: `${e.count}/10`,
  contexts: e.contexts,
  receipts: e.receipts,
})), null, 2));
