/**
 * QA task cards and captures. A card is the task prompt a QA runner (Grok bot,
 * Codex) gives the product; a capture is what the runner observed. Neither
 * holds brand facts or media bytes: the brand must come from the product, and
 * the proof that it did is the generation receipt.
 */

import { z } from 'zod';
import { deterministicCheckSchema } from '../rows';

export const QA_SURFACES = [
  'agent-chat',
  'articles',
  'newsletters',
  'onboarding',
  'publishing',
  'reply-bot',
  'studio',
] as const;
export type QaSurface = (typeof QA_SURFACES)[number];

export const QA_RUNNERS = ['grok-bot', 'codex'] as const;
export type QaRunner = (typeof QA_RUNNERS)[number];

export const QA_PROOFS = [
  'receipt',
  'brand-os-approved',
  'harness-profile',
] as const;
export type QaProof = (typeof QA_PROOFS)[number];

export const QA_FIXTURE_REF = /^(smoke:[A-Za-z0-9-]+|bench:[a-z0-9-]+@\d+)$/;

export const qaCardSchema = z.object({
  brandFixtureId: z.string().min(1),
  contentKind: z.string().regex(/^[a-z0-9-]+$/),
  /**
   * Ties the card to a smoke row or pinned benchmark task so it cannot drift.
   * Absent on a standalone card, such as a private card set whose prompt is
   * its own source of truth.
   */
  fixtureRef: z.string().regex(QA_FIXTURE_REF).optional(),
  id: z.string().regex(/^qa-[a-z0-9-]+$/),
  medium: z.enum(['text', 'image']),
  /** Cards never publish, schedule or message anyone. */
  publish: z.literal(false),
  requiredProof: z.array(z.enum(QA_PROOFS)).min(1),
  surface: z.enum(QA_SURFACES),
  /** The task only. Never brand facts, voice or banned words. */
  taskPrompt: z.string().min(1),
});
export type QaCard = z.infer<typeof qaCardSchema>;

/** Mirrors `ContentHarnessReceipts` plus the receipt id the product returns. */
export const qaReceiptSchema = z
  .object({
    brandOs: z.enum(['approved', 'none']),
    brandOsRevisionId: z.string().min(1).optional(),
    harnessProfileId: z.string().min(1).optional(),
    receiptId: z.string().min(1),
  })
  .refine(
    (receipt) =>
      receipt.brandOs === 'none' || receipt.brandOsRevisionId !== undefined,
    'an approved receipt needs brandOsRevisionId',
  );
export type QaReceipt = z.infer<typeof qaReceiptSchema>;

export const ONBOARDING_SCENARIOS = [
  'work-email-real-site',
  'personal-email-pasted-link',
  'no-link',
  'brand-without-offers',
  'scan-failed-context-form',
] as const;
export type OnboardingScenario = (typeof ONBOARDING_SCENARIOS)[number];

/**
 * What the runner read off the onboarding screens for the deterministic
 * checks. Scanned page text is third-party content: keep captures off repo.
 */
export const qaOnboardingEvidenceSchema = z.object({
  /** Brand name as saved by the scan. */
  brandName: z.string().min(1).optional(),
  /** Text of the X draft, for the platform drafts' rewrite check. */
  xDraft: z.string().min(1).optional(),
  /** Text the scan fetched; absent when the context form was used. */
  pageText: z.string().min(1).optional(),
  /** Offers, facts and the like the product saved for the brand. */
  savedFacts: z.array(z.string().min(1)).default([]),
  scenario: z.enum(ONBOARDING_SCENARIOS),
  /** The over-length draft the shorten retry was given. */
  shortenInput: z.string().min(1).optional(),
  voice: z
    .object({
      audience: z.string().min(1),
      style: z.string().min(1),
      tone: z.string().min(1),
    })
    .optional(),
});
export type QaOnboardingEvidence = z.infer<typeof qaOnboardingEvidenceSchema>;

export const QA_ONBOARDING_OUTPUTS = [
  'brand-scan',
  'voice-analysis',
  'x-draft',
  'instagram-draft',
  'tiktok-draft',
  'linkedin-draft',
  'shorten-retry',
  'master-image',
  'platform-images',
] as const;
export type QaOnboardingOutput = (typeof QA_ONBOARDING_OUTPUTS)[number];

export const qaOnboardingCardSchema = z.object({
  contentKind: z.string().regex(/^onboarding-[a-z0-9-]+$/),
  id: z.string().regex(/^qa-onboarding-[a-z0-9-]+$/),
  medium: z.enum(['text', 'image']),
  output: z.enum(QA_ONBOARDING_OUTPUTS),
  publish: z.literal(false),
  /** Onboarding drafts are provisional, so no approved revision is required. */
  requiredProof: z.array(z.enum(QA_PROOFS)),
  scenarios: z.array(z.enum(ONBOARDING_SCENARIOS)).min(1),
  surface: z.literal('onboarding'),
});
export type QaOnboardingCard = z.infer<typeof qaOnboardingCardSchema>;

export const qaCaptureSchema = z
  .object({
    assetId: z.string().min(1).nullable(),
    blockedReason: z.string().min(1).nullable().default(null),
    capturedAt: z.iso.datetime(),
    cardId: z.string().regex(/^qa-[a-z0-9-]+$/),
    creditsCharged: z.number().nonnegative(),
    /** Sanitized issue link for a deterministic defect; never a payload. */
    defectIssue: z.string().min(1).nullable().default(null),
    /** Onboarding cards only: what the checks read off the screens. */
    onboarding: qaOnboardingEvidenceSchema.optional(),
    model: z.object({
      model: z.string().min(1),
      provider: z.string().min(1),
      version: z.string().min(1).nullable(),
    }),
    /** Generated text. Media is referenced by assetId, never embedded. */
    output: z.string().min(1).nullable(),
    outcome: z.enum(['generated', 'failed', 'blocked']),
    receipt: qaReceiptSchema.nullable(),
    releaseSha: z.string().regex(/^[0-9a-f]{7,40}$/),
    runId: z.string().min(1),
    runner: z.enum(QA_RUNNERS),
  })
  .superRefine((capture, ctx) => {
    if (capture.outcome === 'blocked' && capture.blockedReason === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'a blocked capture needs blockedReason',
        path: ['blockedReason'],
      });
    }
    if (
      capture.outcome === 'generated' &&
      capture.assetId === null &&
      capture.onboarding === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'a generated capture needs assetId',
        path: ['assetId'],
      });
    }
  });
export type QaCapture = z.infer<typeof qaCaptureSchema>;

export const QA_STATUSES = [
  'pass',
  'fail',
  'context-missing',
  'blocked',
] as const;
export type QaStatus = (typeof QA_STATUSES)[number];

export const qaResultSchema = z.object({
  assetId: z.string().nullable(),
  cardId: z.string(),
  contentKind: z.string(),
  contextChecks: z.array(deterministicCheckSchema),
  costCredits: z.number().nonnegative(),
  /** Null when no deterministic check exists for the medium (images today). */
  deterministicChecks: z.array(deterministicCheckSchema).nullable(),
  /** Judge layers run elsewhere; a result here is never a quality score. */
  isJudged: z.literal(false),
  medium: z.enum(['text', 'image']),
  runId: z.string(),
  runner: z.enum(QA_RUNNERS),
  scenario: z.enum(ONBOARDING_SCENARIOS).nullable().default(null),
  status: z.enum(QA_STATUSES),
});
export type QaResult = z.infer<typeof qaResultSchema>;
