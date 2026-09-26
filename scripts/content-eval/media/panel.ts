import type { JudgeSpec } from './contracts';
import { MIN_JUDGES_PER_MATCH } from './contracts';

/**
 * Bench judging rules (genfeedai/benchmark DESIGN.md "Judging"): at least
 * three judges with distinct model ids, none from either contestant's family,
 * A/B shuffled per match, majority verdict, and a tie voids the match.
 */

export type PanelChoice = 'a' | 'b' | 'void';

export interface PanelVerdict {
  verdict: PanelChoice;
  aVotes: number;
  bVotes: number;
  voidVotes: number;
}

/** Mulberry32: small, deterministic, good enough for position shuffles. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit seed for one match, derived from the run seed and match id. */
export function deriveMatchSeed(runSeed: number, matchId: string): number {
  let hash = 2166136261 ^ runSeed;
  for (let index = 0; index < matchId.length; index += 1) {
    hash ^= matchId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** True when the first contestant should be shown as B. */
export function shouldSwapPositions(runSeed: number, matchId: string): boolean {
  return createSeededRandom(deriveMatchSeed(runSeed, matchId))() < 0.5;
}

/**
 * Every judge whose family differs from both contestants, deduplicated by
 * model id. Order follows the configured pool so a run is reproducible.
 */
export function selectEligibleJudges(
  pool: readonly JudgeSpec[],
  contestantFamilies: readonly string[],
): JudgeSpec[] {
  const excluded = new Set(contestantFamilies.map(normalizeFamily));
  const seen = new Set<string>();
  const eligible: JudgeSpec[] = [];
  for (const judge of pool) {
    if (excluded.has(normalizeFamily(judge.family))) continue;
    if (seen.has(judge.modelId)) continue;
    seen.add(judge.modelId);
    eligible.push(judge);
  }
  return eligible;
}

export function hasFullPanel(judges: readonly JudgeSpec[]): boolean {
  return judges.length >= MIN_JUDGES_PER_MATCH;
}

/**
 * A verdict needs a strict majority of the whole panel. `a, a, b` records A;
 * `a, b, void` and `a, void, void` void, because no side won more than half of
 * the votes cast.
 */
export function resolvePanelVerdict(
  choices: readonly PanelChoice[],
): PanelVerdict {
  const aVotes = choices.filter((choice) => choice === 'a').length;
  const bVotes = choices.filter((choice) => choice === 'b').length;
  const voidVotes = choices.length - aVotes - bVotes;
  const half = choices.length / 2;
  const verdict: PanelChoice =
    choices.length >= MIN_JUDGES_PER_MATCH && aVotes > half
      ? 'a'
      : choices.length >= MIN_JUDGES_PER_MATCH && bVotes > half
        ? 'b'
        : 'void';
  return { aVotes, bVotes, verdict, voidVotes };
}

export function normalizeFamily(family: string): string {
  return family.trim().toLowerCase();
}
