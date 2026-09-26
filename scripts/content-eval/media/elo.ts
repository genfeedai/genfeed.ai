import type { Match } from '../bench/schema';
import { ELO_K_FACTOR, ELO_SEED_RATING } from './contracts';

/**
 * Port of genfeedai/benchmark `scripts/ladder.ts` (K=24, seed 1500). The bench
 * script runs at import time and cannot be called, so the rule lives here; the
 * spec replays the bench's own semantics. Voids are counted and never move a
 * rating; only `recorded` matches with a verdict score.
 */

export interface EloStanding {
  contestantId: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  voids: number;
}

export interface EloMatchOutcome {
  matchId: string;
  ratingChange: { a: number; b: number } | null;
}

export interface EloResult {
  standings: EloStanding[];
  outcomes: EloMatchOutcome[];
  recorded: number;
}

function expectedScore(rating: number, against: number): number {
  return 1 / (1 + 10 ** ((against - rating) / 400));
}

function blank(contestantId: string): EloStanding {
  return {
    contestantId,
    losses: 0,
    matches: 0,
    rating: ELO_SEED_RATING,
    voids: 0,
    wins: 0,
  };
}

export function recomputeElo(
  matches: readonly Match[],
  contestantIds: readonly string[],
): EloResult {
  const standings = new Map<string, EloStanding>();
  const of = (id: string): EloStanding => {
    const existing = standings.get(id);
    if (existing) return existing;
    const created = blank(id);
    standings.set(id, created);
    return created;
  };
  for (const id of contestantIds) of(id);

  const outcomes: EloMatchOutcome[] = [];
  let recorded = 0;

  for (const match of matches) {
    const a = of(match.a.contestantId);
    const b = of(match.b.contestantId);

    if (match.state === 'void' || match.verdict === 'void') {
      a.voids += 1;
      b.voids += 1;
      outcomes.push({ matchId: match.id, ratingChange: null });
      continue;
    }
    if (match.state !== 'recorded' || match.verdict === null) {
      outcomes.push({ matchId: match.id, ratingChange: null });
      continue;
    }

    recorded += 1;
    const scoreA = match.verdict === 'a' ? 1 : 0;
    const deltaA = ELO_K_FACTOR * (scoreA - expectedScore(a.rating, b.rating));
    a.rating += deltaA;
    b.rating -= deltaA;
    a.matches += 1;
    b.matches += 1;
    if (match.verdict === 'a') {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
    outcomes.push({
      matchId: match.id,
      ratingChange: { a: round1(deltaA), b: round1(-deltaA) },
    });
  }

  return {
    outcomes,
    recorded,
    standings: [...standings.values()]
      .sort((one, two) => two.rating - one.rating)
      .map((standing) => ({ ...standing, rating: round1(standing.rating) })),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
