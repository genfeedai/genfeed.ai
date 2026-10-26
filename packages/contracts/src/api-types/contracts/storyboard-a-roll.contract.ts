import { z } from 'zod';
import { MODEL_KEYS } from '../../constants/model-keys.constant';
import { storyboardIdSchema } from './storyboard-source.contract';

/**
 * Longest script one HeyGen render takes. HeyGen documents 5,000 characters
 * today with an account-specific maximum duration; older pages say 1,500.
 * The A-roll is split at the lower bound until a test render on our account
 * confirms the higher one (#8222). About 125 seconds of speech per chunk.
 */
export const STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS = 1_500;
/** 30 minutes of narration in chunks of at least a few sentences. */
export const STORYBOARD_A_ROLL_MAX_CHUNKS = 60;
/** Every chunk is rendered with this engine (decided 2026-10-26, #8218). */
export const STORYBOARD_A_ROLL_MODEL_KEY = MODEL_KEYS.HEYGEN_AVATAR_IV;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** A character range of one segment's narration spoken in a chunk. */
export const storyboardARollPieceSchema = z
  .object({
    segmentId: storyboardIdSchema,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict()
  .refine((piece) => piece.end > piece.start, 'A piece must not be empty.');

export const storyboardARollChunkStateSchema = z.enum([
  'pending',
  'submitted',
  'ready',
  'failed',
]);

/**
 * One presenter render. Chunks play back to back; each join between two
 * chunks is covered by B-roll. A failed chunk is rendered again on its own.
 */
export const storyboardARollChunkSchema = z
  .object({
    id: z.string().uuid(),
    ordinal: z.number().int().min(1).max(STORYBOARD_A_ROLL_MAX_CHUNKS),
    pieces: z.array(storyboardARollPieceSchema).min(1),
    text: z.string().min(1).max(STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS),
    /** Binds the render to this text, presenter, voice and format. */
    fingerprint: hashSchema,
    estimatedSeconds: z.number().finite().positive(),
    state: storyboardARollChunkStateSchema,
    actorUserId: storyboardIdSchema,
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    assetId: storyboardIdSchema.optional(),
    /** Seconds of the rendered clip, read when it is ready. */
    durationSeconds: z.number().finite().positive().optional(),
    errorCode: z.string().max(200).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const storyboardARollSchema = z
  .object({
    presenterId: storyboardIdSchema,
    modelKey: z.string().trim().min(1).max(255),
    chunks: z
      .array(storyboardARollChunkSchema)
      .min(1)
      .max(STORYBOARD_A_ROLL_MAX_CHUNKS),
  })
  .strict()
  .superRefine((aRoll, ctx) => {
    aRoll.chunks.forEach((chunk, index) => {
      if (chunk.ordinal !== index + 1)
        ctx.addIssue({
          code: 'custom',
          path: ['chunks', index, 'ordinal'],
          message: 'Chunk ordinals must follow their order.',
        });
    });
  });

export const quoteStoryboardARollSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

export const storyboardARollQuoteSchema = z
  .object({
    revision: z.number().int().positive(),
    modelKey: z.string().trim().min(1).max(255),
    billingMode: z.enum(['platform', 'byok']),
    /** Binds the render to these chunks, texts and prices. */
    inputHash: hashSchema,
    items: z
      .array(
        z
          .object({
            ordinal: z.number().int().positive(),
            characters: z.number().int().positive(),
            estimatedSeconds: z.number().finite().positive(),
            credits: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(STORYBOARD_A_ROLL_MAX_CHUNKS),
    /** Chunks already rendered for this narration; they are not charged again. */
    readyChunkIds: z.array(z.string().uuid()).max(STORYBOARD_A_ROLL_MAX_CHUNKS),
    total: z.number().finite().nonnegative(),
  })
  .strict()
  .refine(
    (quote) =>
      Math.abs(
        quote.items.reduce((sum, item) => sum + item.credits, 0) - quote.total,
      ) < 0.000001,
    'Quote total must equal its line items',
  );

/** Accepts a quote: rendering starts only while the quoted chunks still match. */
export const renderStoryboardARollSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    inputHash: hashSchema,
  })
  .strict();

export type StoryboardARollPiece = z.infer<typeof storyboardARollPieceSchema>;
export type StoryboardARollChunk = z.infer<typeof storyboardARollChunkSchema>;
export type StoryboardARoll = z.infer<typeof storyboardARollSchema>;
export type QuoteStoryboardARoll = z.infer<typeof quoteStoryboardARollSchema>;
export type StoryboardARollQuote = z.infer<typeof storyboardARollQuoteSchema>;
export type RenderStoryboardARoll = z.infer<typeof renderStoryboardARollSchema>;
