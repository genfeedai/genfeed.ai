import type { TextActionMode } from '../interfaces/ai/text-action.interface';

/** Edits `refine_text` applies to a draft the user already wrote. */
export const TEXT_ACTION_MODES = [
  'proofread',
  'rewrite',
] as const satisfies readonly TextActionMode[];

/** Longest draft one text action accepts, in characters. */
export const TEXT_ACTION_MAX_INPUT_LENGTH = 10_000;
