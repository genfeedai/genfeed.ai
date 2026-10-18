/**
 * Turns the per-cell eval reports of one smoke run into the markdown a release
 * or nightly job prints, plus a machine-readable verdict. Pure: reads parsed
 * reports, writes strings.
 */

import {
  GENERATION_TYPES,
  type GenerationTypeEntry,
} from '../context-coverage/generation-types';
import type { ContentEvalReport } from '../contracts';
import type { SmokeCell } from './plan';

export type SmokeCellStatus = 'passed' | 'failed' | 'aborted' | 'skipped';

export interface SmokeCellResult {
  cell: SmokeCell;
  /** Why the cell did not run or what stopped it. */
  detail: string | null;
  report: ContentEvalReport | null;
  status: SmokeCellStatus;
}

export interface SmokeVerdict {
  isFailed: boolean;
  spentCredits: number;
}

interface KindTally {
  accepted: number;
  rows: number;
  scoreSum: number;
  scored: number;
}

type ArmTallies = Record<string, { brief: KindTally; raw: KindTally }>;

function emptyTally(): KindTally {
  return { accepted: 0, rows: 0, scoreSum: 0, scored: 0 };
}

/** Raw-vs-brand-context tallies per text kind, from a harness-ab report. */
export function tallyTextKinds(report: ContentEvalReport): ArmTallies {
  const tallies: ArmTallies = {};
  for (const row of report.outcome.rows) {
    if (!row.contestant) continue;
    tallies[row.contentKind] ??= { brief: emptyTally(), raw: emptyTally() };
    const kind = tallies[row.contentKind];
    const tally = kind[row.contestant.guidanceArm];
    tally.rows += 1;
    if (row.isAccepted) tally.accepted += 1;
    for (const vote of row.votes) {
      if (vote.score !== null) {
        tally.scoreSum += vote.score;
        tally.scored += 1;
      }
    }
  }
  return tallies;
}

function mean(tally: KindTally): string {
  return tally.scored === 0 ? '–' : (tally.scoreSum / tally.scored).toFixed(2);
}

function credits(value: number): string {
  return value.toFixed(2);
}

export function summariseSmoke(
  results: readonly SmokeCellResult[],
  maxCredits: number,
): { markdown: string; verdict: SmokeVerdict } {
  const spentCredits = results.reduce(
    (sum, result) => sum + (result.report?.spend.spentCredits ?? 0),
    0,
  );
  const isFailed = results.some(
    (result) => result.status === 'failed' || result.status === 'aborted',
  );
  const lines: string[] = [
    '## Generation smoke',
    '',
    `Spend ${credits(spentCredits)} of ${credits(maxCredits)} credits (1 credit = $0.01).`,
    '',
    '| cell | status | spent / cap | evidence | note |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const result of results) {
    lines.push(
      `| ${result.cell.id} | ${result.status} | ${credits(result.report?.spend.spentCredits ?? 0)} / ${credits(result.cell.maxCredits)} | ${result.report?.evidenceKind ?? '–'} | ${result.detail ?? ''} |`,
    );
  }

  const textReport = results.find(
    (result) => result.cell.medium === 'text',
  )?.report;
  if (textReport) {
    lines.push(
      '',
      '### Text kinds: raw prompt vs org + brand context',
      '',
      '| kind | raw accepted | brand accepted | raw judge | brand judge |',
      '| --- | --- | --- | --- | --- |',
    );
    const tallies = tallyTextKinds(textReport);
    for (const kind of Object.keys(tallies).sort()) {
      const { brief, raw } = tallies[kind];
      lines.push(
        `| ${kind} | ${raw.accepted}/${raw.rows} | ${brief.accepted}/${brief.rows} | ${mean(raw)} | ${mean(brief)} |`,
      );
    }
    if (textReport.evidenceKind === 'stub-dispatcher') {
      lines.push(
        '',
        '_Stub dispatcher: these numbers prove the wiring, not model quality._',
      );
    }
  }

  lines.push('', '### Brand-context path per generation type', '');
  lines.push('| type | path | smoke | note |', '| --- | --- | --- | --- |');
  for (const entry of GENERATION_TYPES) {
    lines.push(
      `| ${entry.id} | ${entry.path} | ${entry.smoke ?? '–'} | ${noteOf(entry)} |`,
    );
  }

  return {
    markdown: `${lines.join('\n')}\n`,
    verdict: { isFailed, spentCredits },
  };
}

function noteOf(entry: GenerationTypeEntry): string {
  return (entry.note ?? '').replaceAll('|', '/');
}
