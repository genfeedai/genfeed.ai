/**
 * Loads the QA task cards and proves each one still matches the fixture it
 * points at, so a card cannot drift from the prompt the evals score.
 */

import { readFileSync } from 'node:fs';
import { parseFixture } from '../fixtures';
import { loadBenchTasks } from '../media/tasks';
import { resolveRepoPath } from '../provenance';
import type { FixtureRow } from '../rows';
import { SMOKE_TEXT_FIXTURE } from '../smoke/plan';
import { type QaCard, qaCardSchema } from './contracts';

const BENCH_REF = /^bench:([a-z0-9-]+)@(\d+)$/;

export const QA_CARDS_FIXTURE =
  'apps/server/api/test/fixtures/content-evals/qa/cards.synthetic.jsonl';

export function parseQaCards(
  contents: string,
  source: string = QA_CARDS_FIXTURE,
): QaCard[] {
  const cards = contents
    .split('\n')
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line !== '' && !line.startsWith('//'))
    .map(({ line, lineNumber }) => {
      const parsed = qaCardSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(
          `${source} line ${lineNumber}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        );
      }
      return parsed.data;
    });
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`Repeated card id "${card.id}"`);
    ids.add(card.id);
  }
  return cards;
}

/** The in-repo synthetic cards, or a card file elsewhere (a private card set). */
export function loadQaCards(cardsPath?: string): QaCard[] {
  if (cardsPath !== undefined) {
    return parseQaCards(readFileSync(cardsPath, 'utf8'), cardsPath);
  }
  return parseQaCards(readFileSync(resolveRepoPath(QA_CARDS_FIXTURE), 'utf8'));
}

export function loadSmokeRows(): FixtureRow[] {
  return parseFixture(
    readFileSync(resolveRepoPath(SMOKE_TEXT_FIXTURE), 'utf8'),
    SMOKE_TEXT_FIXTURE,
  );
}

/**
 * The fixture row behind a text card, null for a standalone card, or an error
 * naming what is wrong.
 */
export function resolveTextRow(
  card: QaCard,
  rows: FixtureRow[],
): FixtureRow | null {
  if (card.fixtureRef === undefined) return null;
  if (!card.fixtureRef.startsWith('smoke:')) {
    throw new Error(`${card.id}: a text card needs a smoke: fixtureRef`);
  }
  const rowId = card.fixtureRef.slice('smoke:'.length);
  const row = rows.find((candidate) => candidate.id === rowId);
  if (!row) throw new Error(`${card.id}: no smoke row "${rowId}"`);
  return row;
}

/**
 * Problems that make a card unfit to run. Empty means the card matches its
 * fixture and keeps brand context out of the prompt.
 */
export async function findCardProblems(cards: QaCard[]): Promise<string[]> {
  const problems: string[] = [];
  const smokeRows = loadSmokeRows();
  const imageTasks = await loadBenchTasks({
    includeDrafts: false,
    medium: 'image',
  });

  for (const card of cards) {
    if (card.fixtureRef === undefined) continue;
    if (card.medium === 'text') {
      let row: FixtureRow | null;
      try {
        row = resolveTextRow(card, smokeRows);
      } catch (error: unknown) {
        problems.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (row === null) continue;
      if (card.taskPrompt !== row.input.prompt) {
        problems.push(`${card.id}: taskPrompt differs from ${card.fixtureRef}`);
      }
      if (card.contentKind !== row.contentKind) {
        problems.push(`${card.id}: contentKind is not ${row.contentKind}`);
      }
      if (card.brandFixtureId !== row.brandFixtureId) {
        problems.push(
          `${card.id}: brandFixtureId is not ${row.brandFixtureId}`,
        );
      }
      const guidance = row.input.brief.guidance;
      if (guidance && card.taskPrompt.includes(guidance)) {
        problems.push(`${card.id}: taskPrompt carries the brand guidance`);
      }
      for (const phrase of row.input.brief.bannedPhrases) {
        if (card.taskPrompt.toLowerCase().includes(phrase.toLowerCase())) {
          problems.push(`${card.id}: taskPrompt contains banned "${phrase}"`);
        }
      }
      continue;
    }

    const match = BENCH_REF.exec(card.fixtureRef);
    const task = imageTasks.find(
      (candidate) => candidate.task.id === match?.[1],
    );
    if (!match || !task) {
      problems.push(`${card.id}: no pinned bench task for ${card.fixtureRef}`);
      continue;
    }
    if (task.task.version !== Number(match[2])) {
      problems.push(
        `${card.id}: ${card.fixtureRef} is version ${task.task.version} in the pinned pack`,
      );
    }
    if (card.taskPrompt !== task.task.prompt) {
      problems.push(`${card.id}: taskPrompt differs from ${card.fixtureRef}`);
    }
    if (card.contentKind !== task.task.id) {
      problems.push(`${card.id}: contentKind is not ${task.task.id}`);
    }
  }

  return problems;
}
