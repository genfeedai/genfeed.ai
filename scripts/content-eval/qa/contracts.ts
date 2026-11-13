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
  fixtureRef: z.string().regex(QA_FIXTURE_REF),
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

export const qaCaptureSchema = z
  .object({
    assetId: z.string().min(1).nullable(),
    blockedReason: z.string().min(1).nullable().default(null),
    capturedAt: z.iso.datetime(),
    cardId: z.string().regex(/^qa-[a-z0-9-]+$/),
    creditsCharged: z.number().nonnegative(),
    /** Sanitized issue link for a deterministic defect; never a payload. */
    defectIssue: z.string().min(1).nullable().default(null),
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
    if (capture.outcome === 'generated' && capture.assetId === null) {
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
  status: z.enum(QA_STATUSES),
});
export type QaResult = z.infer<typeof qaResultSchema>;
