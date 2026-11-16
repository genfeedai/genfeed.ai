/**
 * Tallies QA results by medium and content kind. Counts and rates only: no
 * text, no score, nothing a public run comment must not carry.
 */

import type { QaResult, QaStatus } from './contracts';
import { QA_STATUSES } from './contracts';

export interface QaKindTally {
  contentKind: string;
  contextProofRate: number | null;
  credits: number;
  medium: QaResult['medium'];
  runs: number;
  statuses: Record<QaStatus, number>;
}

export interface QaSummary {
  isFailed: boolean;
  kinds: QaKindTally[];
  totalCredits: number;
}

function emptyStatuses(): Record<QaStatus, number> {
  return Object.fromEntries(QA_STATUSES.map((status) => [status, 0])) as Record<
    QaStatus,
    number
  >;
}

export function summarizeQaResults(results: QaResult[]): QaSummary {
  const tallies = new Map<string, QaKindTally>();
  const proofed = new Map<string, { passed: number; total: number }>();

  for (const result of results) {
    const key = `${result.medium}:${result.contentKind}`;
    const tally = tallies.get(key) ?? {
      contentKind: result.contentKind,
      contextProofRate: null,
      credits: 0,
      medium: result.medium,
      runs: 0,
      statuses: emptyStatuses(),
    };
    tally.runs += 1;
    tally.credits += result.costCredits;
    tally.statuses[result.status] += 1;
    tallies.set(key, tally);

    if (result.contextChecks.length > 0) {
      const proof = proofed.get(key) ?? { passed: 0, total: 0 };
      proof.total += 1;
      if (result.contextChecks.every((check) => check.passed))
        proof.passed += 1;
      proofed.set(key, proof);
    }
  }

  for (const [key, tally] of tallies) {
    const proof = proofed.get(key);
    tally.contextProofRate = proof ? proof.passed / proof.total : null;
  }

  const kinds = [...tallies.values()].sort((a, b) =>
    `${a.medium}:${a.contentKind}`.localeCompare(
      `${b.medium}:${b.contentKind}`,
    ),
  );

  return {
    isFailed: results.some(
      (result) =>
        result.status === 'fail' || result.status === 'context-missing',
    ),
    kinds,
    totalCredits: kinds.reduce((sum, tally) => sum + tally.credits, 0),
  };
}

export function renderQaSummary(summary: QaSummary): string {
  const lines = [
    '| medium | kind | runs | pass | fail | context-missing | blocked | context proof | credits |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const tally of summary.kinds) {
    const proof =
      tally.contextProofRate === null
        ? 'n/a'
        : `${Math.round(tally.contextProofRate * 100)}%`;
    lines.push(
      `| ${tally.medium} | ${tally.contentKind} | ${tally.runs} | ${tally.statuses.pass} | ${tally.statuses.fail} | ${tally.statuses['context-missing']} | ${tally.statuses.blocked} | ${proof} | ${tally.credits} |`,
    );
  }
  lines.push('', `Credits charged: ${summary.totalCredits}`);
  lines.push(
    'No judge or human score is included; these are context-proof and deterministic results only.',
  );
  return lines.join('\n');
}
