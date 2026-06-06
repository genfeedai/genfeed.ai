#!/usr/bin/env bun

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CandidateType = 'agent' | 'plugin' | 'skill';

type CounterRecord = Record<string, number>;

type AnalysisJson = {
  categoryCounts?: CounterRecord;
  cwdCounts?: CounterRecord;
  projectCounts?: CounterRecord;
  toolCounts?: CounterRecord;
  counts?: {
    categories?: CounterRecord;
    cwds?: CounterRecord;
    projects?: CounterRecord;
    tools?: CounterRecord;
  };
  events?: {
    userMessages?: number;
  };
  generatedAt?: string;
  options?: {
    since?: string | null;
    until?: string | null;
  };
  scope?: {
    firstTimestamp?: string | null;
    lastTimestamp?: string | null;
    uniqueSessions?: number;
  };
};

type CliOptions = {
  inputPath: string;
  minScore: number;
  outputPath: string;
  top: number;
};

export type PatternCandidate = {
  evidence: string[];
  name: string;
  score: number;
  type: CandidateType;
  rationale: string;
};

const DEFAULT_INPUT = path.join(
  process.cwd(),
  'docs',
  'claude-session-analysis.json',
);
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  'docs',
  'claude-pattern-miner-report.md',
);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT,
    minScore: 1,
    outputPath: DEFAULT_OUTPUT,
    top: 8,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--input' || arg === '--json') && argv[i + 1]) {
      options.inputPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if ((arg === '--out' || arg === '--output') && argv[i + 1]) {
      options.outputPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--top' && argv[i + 1]) {
      options.top = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === '--min-score' && argv[i + 1]) {
      options.minScore = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!Number.isFinite(options.top) || options.top <= 0) {
    throw new Error('--top must be a positive number');
  }

  if (!Number.isFinite(options.minScore) || options.minScore < 0) {
    throw new Error('--min-score must be zero or greater');
  }

  return options;
}

function counters(analysis: AnalysisJson): {
  categories: CounterRecord;
  cwds: CounterRecord;
  projects: CounterRecord;
  tools: CounterRecord;
} {
  return {
    categories: analysis.counts?.categories ?? analysis.categoryCounts ?? {},
    cwds: analysis.counts?.cwds ?? analysis.cwdCounts ?? {},
    projects: analysis.counts?.projects ?? analysis.projectCounts ?? {},
    tools: analysis.counts?.tools ?? analysis.toolCounts ?? {},
  };
}

function count(record: CounterRecord, key: string): number {
  return Number(record[key] ?? 0);
}

function topCounterRows(record: CounterRecord, limit: number): string[] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(
      ([key, value]) => `| ${escapePipe(key)} | ${value.toLocaleString()} |`,
    );
}

function escapePipe(value: string): string {
  return value.replaceAll('|', '\\|');
}

export function scoreCandidates(analysis: AnalysisJson): PatternCandidate[] {
  const { categories, projects, tools } = counters(analysis);
  const bash = count(tools, 'Bash');
  const task = count(tools, 'Task');
  const taskUpdate = count(tools, 'TaskUpdate');
  const debugging = count(categories, 'debugging_testing');
  const agentSkilling = count(categories, 'agent_skilling');
  const docs = count(categories, 'docs_content');
  const security = count(categories, 'security');
  const content =
    count(categories, 'marketing_growth') +
    count(categories, 'presentation_media');
  const frontend = count(categories, 'coding_frontend');
  const backend = count(categories, 'coding_backend');
  const projectBreadth = Object.keys(projects).length;

  return [
    {
      evidence: [
        `${debugging.toLocaleString()} debugging/testing prompts`,
        `${bash.toLocaleString()} shell tool calls`,
      ],
      name: 'Monorepo test-fix loop',
      rationale:
        'Repeated debugging plus heavy shell usage indicates a deterministic loop worth capturing as a reusable skill.',
      score: debugging + bash / 100,
      type: 'skill',
    },
    {
      evidence: [`${agentSkilling.toLocaleString()} agent/skill prompts`],
      name: 'Plan-to-execution runbook',
      rationale:
        'Frequent agent and workflow prompts point to recurring plan handoffs that should become a stricter execution checklist.',
      score: agentSkilling,
      type: 'skill',
    },
    {
      evidence: [
        `${debugging.toLocaleString()} debugging/testing prompts`,
        `${task.toLocaleString()} task dispatches`,
        `${taskUpdate.toLocaleString()} task updates`,
      ],
      name: 'CI triage-and-fix loop',
      rationale:
        'Debugging/testing combined with task orchestration points to repeated CI diagnosis and remediation.',
      score: debugging + task / 10 + taskUpdate / 10,
      type: 'agent',
    },
    {
      evidence: [
        `${docs.toLocaleString()} docs/handoff prompts`,
        `${projectBreadth.toLocaleString()} projects touched`,
      ],
      name: 'Session handoff summarizer',
      rationale:
        'Repeated documentation and cross-project context imply value in a standard daily handoff artifact.',
      score: docs + projectBreadth / 2,
      type: 'skill',
    },
    {
      evidence: [`${security.toLocaleString()} security prompts`],
      name: 'API security preflight',
      rationale:
        'Security/auth prompts should become a reusable pre-merge gate for tenancy, serializers, and secret handling.',
      score: security + backend / 5,
      type: 'skill',
    },
    {
      evidence: [`${content.toLocaleString()} content/media prompts`],
      name: 'Content ops workflow',
      rationale:
        'Content and media work is repeatable enough to standardize as a brief-to-output workflow.',
      score: content,
      type: 'skill',
    },
    {
      evidence: [
        `${frontend.toLocaleString()} frontend prompts`,
        `${backend.toLocaleString()} backend prompts`,
      ],
      name: 'Full-stack feature QA agent',
      rationale:
        'Mixed frontend/backend feature work benefits from a reviewer that checks implementation coverage against acceptance criteria.',
      score: (frontend + backend) / 2 + debugging / 5,
      type: 'agent',
    },
  ].sort((a, b) => b.score - a.score);
}

export function buildPatternReport(
  analysis: AnalysisJson,
  options: { minScore?: number; now?: Date; top?: number } = {},
): string {
  const minScore = options.minScore ?? 1;
  const top = options.top ?? 8;
  const generatedAt = (options.now ?? new Date()).toISOString();
  const ranked = scoreCandidates(analysis)
    .filter((item) => item.score >= minScore)
    .slice(0, top);
  const { categories, projects, tools } = counters(analysis);
  const scope = analysis.scope;
  const windowLabel = `${analysis.options?.since ?? scope?.firstTimestamp ?? 'beginning'} -> ${
    analysis.options?.until ?? scope?.lastTimestamp ?? 'now'
  }`;
  const categoryRows = topCounterRows(categories, 8);
  const toolRows = topCounterRows(tools, 8);
  const projectRows = topCounterRows(projects, 8);

  return [
    '# Claude Pattern Miner Report',
    '',
    `Generated: ${generatedAt}`,
    `Source analysis: ${analysis.generatedAt ?? 'unknown'}`,
    `Window: ${windowLabel}`,
    `Unique sessions: ${(scope?.uniqueSessions ?? 0).toLocaleString()}`,
    `User messages: ${(analysis.events?.userMessages ?? 0).toLocaleString()}`,
    '',
    '## Ranked Candidates',
    ranked.length === 0
      ? '- No candidates met the score threshold for this window.'
      : ranked
          .map(
            (item, index) =>
              `${index + 1}. **${item.name}** (${item.type}, score ${item.score.toFixed(1)}) - ${item.rationale}\n   Evidence: ${item.evidence.join('; ')}`,
          )
          .join('\n'),
    '',
    '## Weekly Promotion Queue',
    ranked.length === 0
      ? '- No weekly backlog promotion recommended yet.'
      : ranked
          .slice(0, 3)
          .map(
            (item) =>
              `- [ ] Promote **${item.name}** to a GitHub issue if the pattern repeats in three or more daily reports this week.`,
          )
          .join('\n'),
    '',
    '## Evidence Summary',
    '### Categories',
    '| Category | Count |',
    '|---|---:|',
    categoryRows.length > 0 ? categoryRows.join('\n') : '| (none) | 0 |',
    '',
    '### Tools',
    '| Tool | Count |',
    '|---|---:|',
    toolRows.length > 0 ? toolRows.join('\n') : '| (none) | 0 |',
    '',
    '### Projects',
    '| Project | File Count |',
    '|---|---:|',
    projectRows.length > 0 ? projectRows.join('\n') : '| (none) | 0 |',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const analysis = (await Bun.file(options.inputPath).json()) as AnalysisJson;
  const report = buildPatternReport(analysis, {
    minScore: options.minScore,
    top: options.top,
  });

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${report}\n`, 'utf8');
  console.log(options.outputPath);
}

if (import.meta.main) {
  await main();
}
