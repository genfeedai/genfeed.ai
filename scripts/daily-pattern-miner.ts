#!/usr/bin/env bun

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type AnalysisJson = {
  categoryCounts?: Record<string, number>;
  cwdCounts?: Record<string, number>;
  projectCounts?: Record<string, number>;
  toolCounts?: Record<string, number>;
};

function scoreCandidates(analysis: AnalysisJson): Array<{
  name: string;
  score: number;
  type: 'skill' | 'plugin' | 'agent';
  rationale: string;
}> {
  const toolCounts = analysis.toolCounts ?? {};
  const categories = analysis.categoryCounts ?? {};

  return [
    {
      name: 'Monorepo test-fix loop',
      rationale:
        'High debugging/testing volume and heavy shell/tool use indicate a repeated deterministic human-in-the-loop workflow.',
      score:
        Number(categories.debugging_testing ?? 0) +
        Number(toolCounts.Bash ?? 0) / 100,
      type: 'skill',
    },
    {
      name: 'Plan-to-execution runbook',
      rationale:
        'High agent skilling volume suggests repeated sessions starting from prewritten plans and requiring execution discipline.',
      score: Number(categories.agent_skilling ?? 0),
      type: 'skill',
    },
    {
      name: 'CI triage-and-fix loop',
      rationale:
        'Debugging/testing combined with task orchestration points to repeated CI diagnosis and structured remediation work.',
      score:
        Number(categories.debugging_testing ?? 0) +
        Number(toolCounts.Task ?? 0) / 10 +
        Number(toolCounts.TaskUpdate ?? 0) / 10,
      type: 'agent',
    },
  ].sort((a, b) => b.score - a.score);
}

async function main(): Promise<void> {
  const root = process.cwd();
  const docsDir = path.join(root, 'docs');
  const inputPath = path.join(docsDir, 'claude-session-analysis.json');
  const outputPath = path.join(docsDir, 'claude-pattern-miner-report.md');

  const analysis = (await Bun.file(inputPath).json()) as AnalysisJson;
  const ranked = scoreCandidates(analysis);

  const lines = [
    '# Claude Pattern Miner Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Ranked Candidates',
    ...ranked.map(
      (item, index) =>
        `${index + 1}. **${item.name}** (${item.type}, score ${item.score.toFixed(1)}) — ${item.rationale}`,
    ),
  ];

  await mkdir(docsDir, { recursive: true });
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(outputPath);
}

await main();
