import {
  REPLY_POST_MAX_INPUT_LENGTH,
  REPLY_VARIANT_TONES,
  REPLY_VARIANTS_DEFAULT,
  REPLY_VARIANTS_MAX,
} from '@genfeedai/contracts/constants';
import type { ReplyVariantTone } from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

const replyVariantsParamsSchema = z.object({
  brandId: z.string().min(1).optional(),
  platform: z.string().trim().min(1),
  postAuthor: z.string().max(200).optional(),
  postContent: z
    .string()
    .refine((value) => value.trim().length > 0, 'postContent is required')
    .refine(
      (value) => value.length <= REPLY_POST_MAX_INPUT_LENGTH,
      `postContent must be at most ${REPLY_POST_MAX_INPUT_LENGTH} characters`,
    ),
  requestKey: z.uuid(),
  tone: z.enum(REPLY_VARIANT_TONES),
  variants: z
    .number()
    .int()
    .min(1)
    .max(REPLY_VARIANTS_MAX)
    .default(REPLY_VARIANTS_DEFAULT),
});

export interface ReplyVariantsParams {
  brandId?: string;
  platform: string;
  postAuthor?: string;
  postContent: string;
  requestKey: string;
  tone: ReplyVariantTone;
  variants: number;
}

export function parseReplyVariantsParams(
  params: Record<string, unknown>,
): { ok: true; value: ReplyVariantsParams } | { error: string; ok: false } {
  const parsed = replyVariantsParamsSchema.safeParse(params);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') || 'parameters';
  return { error: `${field}: ${issue?.message ?? 'invalid'}`, ok: false };
}
