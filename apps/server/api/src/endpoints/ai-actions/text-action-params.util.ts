import {
  TEXT_ACTION_MAX_INPUT_LENGTH,
  TEXT_ACTION_MODES,
} from '@genfeedai/contracts/constants';
import type { TextActionMode } from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

const textActionParamsSchema = z.object({
  brandId: z.string().min(1).optional(),
  mode: z.enum(TEXT_ACTION_MODES),
  platform: z.string().trim().min(1),
  requestKey: z.uuid(),
  text: z
    .string()
    .refine((value) => value.trim().length > 0, 'text is required')
    .refine(
      (value) => value.length <= TEXT_ACTION_MAX_INPUT_LENGTH,
      `text must be at most ${TEXT_ACTION_MAX_INPUT_LENGTH} characters`,
    ),
});

export interface TextActionParams {
  brandId?: string;
  mode: TextActionMode;
  platform: string;
  requestKey: string;
  text: string;
}

export function parseTextActionParams(
  params: Record<string, unknown>,
): { ok: true; value: TextActionParams } | { error: string; ok: false } {
  const parsed = textActionParamsSchema.safeParse(params);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') || 'parameters';
  return { error: `${field}: ${issue?.message ?? 'invalid'}`, ok: false };
}
