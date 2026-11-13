/**
 * Onboarding QA cards: one card per onboarding output, run on the signup
 * scenarios the card lists. The product writes these outputs itself (a signup,
 * a pasted link), so a card has no task prompt; its checks read what the
 * runner captured off the screens.
 */

import { readFileSync } from 'node:fs';
import { resolveRepoPath } from '../provenance';
import type { DeterministicCheck } from '../rows';
import { hasPassedAll } from '../scorers/deterministic';
import {
  type QaCapture,
  type QaOnboardingCard,
  type QaOnboardingEvidence,
  type QaResult,
  qaOnboardingCardSchema,
} from './contracts';
import { proofCheck } from './evaluate';
import {
  checkFactsOnPage,
  checkNamesBrandContext,
  checkNotRewriteOf,
  checkScanHasFacts,
  checkShortenKeepsIdea,
  checkVoiceIsSpecific,
  checkWithinCharacters,
  X_MAX_CHARACTERS,
} from './onboarding-checks';
import { checkIsPost } from './post-shape';

export const QA_ONBOARDING_CARDS_FIXTURE =
  'apps/server/api/test/fixtures/content-evals/qa/onboarding-cards.synthetic.jsonl';

export function parseOnboardingCards(contents: string): QaOnboardingCard[] {
  const cards = contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .map((line) => qaOnboardingCardSchema.parse(JSON.parse(line)));
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`Repeated card id "${card.id}"`);
    ids.add(card.id);
  }
  return cards;
}

export function loadOnboardingCards(): QaOnboardingCard[] {
  return parseOnboardingCards(
    readFileSync(resolveRepoPath(QA_ONBOARDING_CARDS_FIXTURE), 'utf8'),
  );
}

function missingEvidence(id: string, what: string): DeterministicCheck {
  return { detail: `capture carries no ${what}`, id, passed: false };
}

function outputChecks(
  card: QaOnboardingCard,
  capture: QaCapture,
  evidence: QaOnboardingEvidence,
): DeterministicCheck[] | null {
  const text = capture.output;
  switch (card.output) {
    case 'brand-scan':
      return [
        checkScanHasFacts(evidence.savedFacts),
        ...(evidence.pageText !== undefined && evidence.savedFacts.length > 0
          ? [checkFactsOnPage(evidence.savedFacts, evidence.pageText)]
          : []),
      ];
    case 'voice-analysis':
      return [
        evidence.voice
          ? checkVoiceIsSpecific(evidence.voice)
          : missingEvidence('voice-not-generic', 'voice'),
      ];
    case 'x-draft':
      return text === null
        ? [missingEvidence('is-a-post', 'draft text')]
        : [
            checkIsPost(text, { contentKind: card.contentKind }),
            checkWithinCharacters(text, X_MAX_CHARACTERS),
            checkNamesBrandContext(
              text,
              evidence.brandName,
              evidence.savedFacts,
            ),
          ];
    case 'instagram-draft':
    case 'tiktok-draft':
    case 'linkedin-draft':
      return text === null
        ? [missingEvidence('is-a-post', 'draft text')]
        : [
            checkIsPost(text, { contentKind: card.contentKind }),
            checkNamesBrandContext(
              text,
              evidence.brandName,
              evidence.savedFacts,
            ),
            evidence.xDraft
              ? checkNotRewriteOf(text, evidence.xDraft)
              : missingEvidence('draft-not-x-rewrite', 'X draft'),
          ];
    case 'shorten-retry':
      return text === null || evidence.shortenInput === undefined
        ? [missingEvidence('shorten-keeps-idea', 'shorten input or output')]
        : [
            checkIsPost(text, { contentKind: card.contentKind }),
            checkShortenKeepsIdea(
              text,
              evidence.shortenInput,
              X_MAX_CHARACTERS,
            ),
          ];
    case 'master-image':
    case 'platform-images':
      // No deterministic image check yet: scored on context proof and the asset only.
      return null;
  }
}

export function evaluateOnboardingCapture(
  card: QaOnboardingCard,
  capture: QaCapture,
): QaResult {
  if (capture.cardId !== card.id) {
    throw new Error(`Capture is for ${capture.cardId}, not ${card.id}`);
  }
  const evidence = capture.onboarding;
  if (!evidence) {
    throw new Error(
      `${capture.cardId}: an onboarding capture needs onboarding evidence`,
    );
  }
  if (!card.scenarios.includes(evidence.scenario)) {
    throw new Error(`${card.id} is not run on scenario ${evidence.scenario}`);
  }

  const isGenerated = capture.outcome === 'generated';
  const contextChecks = isGenerated
    ? [
        ...card.requiredProof.map((proof) => proofCheck(proof, capture)),
        ...(card.medium === 'image'
          ? [
              {
                detail: capture.assetId ? 'asset recorded' : 'no asset',
                id: 'asset-recorded',
                passed: capture.assetId !== null,
              },
            ]
          : []),
      ]
    : [];
  const deterministicChecks = isGenerated
    ? outputChecks(card, capture, evidence)
    : null;

  let status: QaResult['status'];
  if (capture.outcome === 'blocked') status = 'blocked';
  else if (capture.outcome === 'failed') status = 'fail';
  else if (!hasPassedAll(contextChecks)) status = 'context-missing';
  else if (deterministicChecks && !hasPassedAll(deterministicChecks))
    status = 'fail';
  else status = 'pass';

  return {
    assetId: capture.assetId,
    cardId: card.id,
    contentKind: card.contentKind,
    contextChecks,
    costCredits: capture.creditsCharged,
    deterministicChecks,
    isJudged: false,
    medium: card.medium,
    runId: capture.runId,
    runner: capture.runner,
    scenario: evidence.scenario,
    status,
  };
}
