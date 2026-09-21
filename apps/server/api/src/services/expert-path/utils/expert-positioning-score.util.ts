import {
  EXPERT_POSITIONING_DIMENSIONS,
  EXPERT_POSITIONING_MAX_WEIGHTED_SCORE,
  type ExpertPositioningAnswers,
  resolveExpertPositioningRating,
} from '@genfeedai/contracts/constants';
import type {
  ExpertPositioningDimensionKey,
  IExpertPositioningDimensionScore,
  IExpertPositioningScore,
} from '@genfeedai/contracts/interfaces';

/**
 * Deterministic port of the public `expert-validator` rubric. Each dimension
 * is scored 0-10 from observable signals in the expert's own answers (story
 * beats, an explicit belief, old-vs-new framing, proof types, contrarian
 * stances), so onboarding scores are instant, free, reproducible, and work on
 * self-hosted installs without a model provider.
 */

const FIRST_PERSON_RE = /\b(i|i'm|i've|i'd|my|me|myself)\b/i;
const BACKSTORY_RE =
  /\b(used to|years ago|back when|before|when i was|i started|growing up|early in)\b/i;
const WALL_RE =
  /\b(fail(ed|ure)?|struggl\w*|broke|lost|burn(ed|t) out|hit a wall|stuck|fired|rejected|quit|bankrupt|crisis|couldn't|could not)\b/i;
const EPIPHANY_RE =
  /\b(realiz\w*|realis\w*|that's when|that is when|turning point|epiphany|discovered|figured out|it hit me|understood|noticed)\b/i;
const TRANSFORMATION_RE =
  /\b(now|today|since then|became|went from|so i|ever since|these days)\b/i;
const BELIEF_RE =
  /\b(believe|belief|if they|once they|the real|truth|the only|everything|all it takes|the key)\b/i;
const CONDITIONAL_RE = /\bif\b[\s\S]*\b(then|would|will|stops?|no longer)\b/i;
const NEW_OPPORTUNITY_RE =
  /\b(new way|instead of|stop|replace|skip|different|forget|no longer|old way|shift|rather than|abandon|ditch)\b/gi;
const IMPROVEMENT_RE =
  /\b(better|faster|more|improve\w*|optimi[sz]\w*|upgrade\w*|enhanc\w*)\b/gi;
const CONTRARIAN_RE =
  /\b(most people|everyone|wrong|myth|disagree|unpopular|overrated|actually|the opposite|nobody|misconception|lie)\b/i;
const NUMBER_RE = /\d/;

const AUTHORITY_PROOF_PATTERNS: readonly RegExp[] = [
  // results
  /\b(clients?|customers?|revenue|grew|helped|generated|saved|\$\d|\d+%|\d+x)\b/i,
  // credentials
  /\b(certified|certification|phd|mba|degree|former|\d+\+? years|licensed|founded)\b/i,
  // media
  /\b(featured|podcast|published|author|book|keynote|spoke|speaker|ted|press|interview(ed)?)\b/i,
  // association
  /\b(worked with|clients include|partnered|advised|consulted for|trusted by)\b/i,
  // social
  /\b(followers|subscribers|audience of|testimonials?|students|community of|readers)\b/i,
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function readAnswer(
  answers: ExpertPositioningAnswers,
  key: keyof ExpertPositioningAnswers,
): string {
  return answers[key]?.trim() ?? '';
}

function countWords(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function lengthCredit(text: string, fullWords: number, max: number): number {
  return Math.min(max, (countWords(text) / fullWords) * max);
}

function scoreOriginStory(answers: ExpertPositioningAnswers): number {
  const story = readAnswer(answers, 'originStory');
  if (!story) {
    return 0;
  }

  return clampScore(
    2 +
      lengthCredit(story, 40, 2) +
      (BACKSTORY_RE.test(story) ? 1.5 : 0) +
      (WALL_RE.test(story) ? 1.5 : 0) +
      (EPIPHANY_RE.test(story) ? 2 : 0) +
      (TRANSFORMATION_RE.test(story) ? 1 : 0),
  );
}

function scoreAttractiveCharacter(answers: ExpertPositioningAnswers): number {
  const story = readAnswer(answers, 'originStory');
  const contrarian = readAnswer(answers, 'contrarianBeliefs');
  const notFor = readAnswer(answers, 'notForWho');
  const transformation = readAnswer(answers, 'transformation');
  if (!story && !contrarian && !transformation) {
    return 0;
  }

  const personaWords =
    countWords(story) + countWords(contrarian) + countWords(transformation);

  return clampScore(
    (FIRST_PERSON_RE.test(story) ? 2 : 0) +
      (WALL_RE.test(story) ? 2 : 0) +
      (contrarian ? 2 : 0) +
      (notFor ? 1.5 : 0) +
      (FIRST_PERSON_RE.test(transformation) ? 1 : 0) +
      Math.min(1.5, (personaWords / 150) * 1.5),
  );
}

function scoreBigDomino(answers: ExpertPositioningAnswers): number {
  const domino = readAnswer(answers, 'bigDomino');
  if (!domino) {
    return 0;
  }

  const sentences = countSentences(domino);
  const words = countWords(domino);
  const focusCredit = sentences <= 2 ? 2 : sentences <= 4 ? 0.5 : 0;
  const sizeCredit = words >= 8 && words <= 60 ? 2 : 1;

  return clampScore(
    3 +
      (BELIEF_RE.test(domino) ? 2 : 0) +
      focusCredit +
      sizeCredit +
      (CONDITIONAL_RE.test(domino) ? 1 : 0),
  );
}

function scoreNewOpportunity(answers: ExpertPositioningAnswers): number {
  const opportunity = readAnswer(answers, 'newOpportunity');
  if (!opportunity) {
    return 0;
  }

  const newSignals = countMatches(opportunity, NEW_OPPORTUNITY_RE);
  const improvementSignals = countMatches(opportunity, IMPROVEMENT_RE);

  return clampScore(
    2 +
      Math.min(5, newSignals * 2) -
      Math.min(3, improvementSignals) +
      lengthCredit(opportunity, 30, 2) +
      (newSignals >= 2 ? 1 : 0),
  );
}

function scoreAuthoritySignals(answers: ExpertPositioningAnswers): number {
  const proof = readAnswer(answers, 'authoritySignals');
  if (!proof) {
    return 0;
  }

  const proofTypes = AUTHORITY_PROOF_PATTERNS.filter((pattern) =>
    pattern.test(proof),
  ).length;

  return clampScore(1 + proofTypes * 1.6 + (NUMBER_RE.test(proof) ? 1 : 0));
}

function scoreDifferentiation(answers: ExpertPositioningAnswers): number {
  const contrarian = readAnswer(answers, 'contrarianBeliefs');
  const notFor = readAnswer(answers, 'notForWho');
  const opportunity = readAnswer(answers, 'newOpportunity');
  if (!contrarian && !notFor && !opportunity) {
    return 0;
  }

  return clampScore(
    (contrarian ? 3 : 0) +
      (CONTRARIAN_RE.test(contrarian) ? 2 : 0) +
      lengthCredit(contrarian, 40, 2) +
      (notFor ? 2 : 0) +
      (countMatches(opportunity, NEW_OPPORTUNITY_RE) > 0 ? 1 : 0),
  );
}

const DIMENSION_SCORERS: Record<
  ExpertPositioningDimensionKey,
  (answers: ExpertPositioningAnswers) => number
> = {
  attractiveCharacter: scoreAttractiveCharacter,
  authoritySignals: scoreAuthoritySignals,
  bigDomino: scoreBigDomino,
  differentiation: scoreDifferentiation,
  newOpportunity: scoreNewOpportunity,
  originStory: scoreOriginStory,
};

/**
 * Lowest raw score wins; ties go to the heavier dimension (the bigger lift),
 * then to rubric order.
 */
function resolveWeakestDimension(
  dimensions: IExpertPositioningDimensionScore[],
): ExpertPositioningDimensionKey {
  const [weakest] = [...dimensions].sort(
    (left, right) =>
      left.score - right.score ||
      right.weight - left.weight ||
      dimensions.indexOf(left) - dimensions.indexOf(right),
  );
  return weakest?.key ?? 'bigDomino';
}

export function scoreExpertPositioning(
  answers: ExpertPositioningAnswers,
  scoredAt: Date = new Date(),
): IExpertPositioningScore {
  const dimensions = EXPERT_POSITIONING_DIMENSIONS.map((definition) => {
    const score = DIMENSION_SCORERS[definition.key](answers);
    return {
      followUpFieldKey: definition.followUpFieldKey,
      followUpQuestion: definition.followUpQuestion,
      key: definition.key,
      label: definition.label,
      maxWeightedScore: definition.weight * 10,
      score,
      weight: definition.weight,
      weightedScore: score * definition.weight,
    };
  });

  const weightedTotal = dimensions.reduce(
    (total, dimension) => total + dimension.weightedScore,
    0,
  );
  const totalScore = Math.round(
    (weightedTotal / EXPERT_POSITIONING_MAX_WEIGHTED_SCORE) * 100,
  );

  return {
    dimensions,
    rating: resolveExpertPositioningRating(totalScore),
    scoredAt: scoredAt.toISOString(),
    totalScore,
    version: 1,
    weakestDimension: resolveWeakestDimension(dimensions),
  };
}
