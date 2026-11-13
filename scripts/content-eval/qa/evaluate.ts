/**
 * Scores one capture on the two layers that need no judge: context proof and
 * deterministic text checks. Judge and human layers stay outside this file, so
 * a status here is never a quality score.
 */

import type { DeterministicCheck, FixtureRow } from '../rows';
import { hasPassedAll, runDeterministicChecks } from '../scorers/deterministic';
import type { QaCapture, QaCard, QaProof, QaResult } from './contracts';

function proofCheck(proof: QaProof, capture: QaCapture): DeterministicCheck {
  const receipt = capture.receipt;
  switch (proof) {
    case 'receipt':
      return {
        detail: receipt ? `receipt ${receipt.receiptId}` : 'no receipt',
        id: 'context-receipt',
        passed: receipt !== null,
      };
    case 'brand-os-approved':
      return {
        detail:
          receipt?.brandOs === 'approved'
            ? `revision ${receipt.brandOsRevisionId}`
            : 'no approved Brand OS revision on the receipt',
        id: 'context-brand-os-approved',
        passed: receipt?.brandOs === 'approved',
      };
    case 'harness-profile':
      return {
        detail: receipt?.harnessProfileId
          ? `profile ${receipt.harnessProfileId}`
          : 'no harness profile on the receipt',
        id: 'context-harness-profile',
        passed: Boolean(receipt?.harnessProfileId),
      };
  }
}

export function evaluateCapture(
  card: QaCard,
  capture: QaCapture,
  row: FixtureRow | null,
): QaResult {
  if (capture.cardId !== card.id) {
    throw new Error(`Capture is for ${capture.cardId}, not ${card.id}`);
  }

  const contextChecks =
    capture.outcome === 'generated'
      ? card.requiredProof.map((proof) => proofCheck(proof, capture))
      : [];
  const deterministicChecks =
    capture.outcome === 'generated' &&
    card.medium === 'text' &&
    row !== null &&
    capture.output !== null
      ? runDeterministicChecks(capture.output, row)
      : null;

  let status: QaResult['status'];
  if (capture.outcome === 'blocked') {
    status = 'blocked';
  } else if (capture.outcome === 'failed') {
    status = 'fail';
  } else if (!hasPassedAll(contextChecks)) {
    status = 'context-missing';
  } else if (card.medium === 'text' && deterministicChecks === null) {
    status = 'fail';
  } else if (deterministicChecks && !hasPassedAll(deterministicChecks)) {
    status = 'fail';
  } else {
    status = 'pass';
  }

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
    status,
  };
}
