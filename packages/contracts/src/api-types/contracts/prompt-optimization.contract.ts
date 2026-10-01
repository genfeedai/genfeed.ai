import { z } from 'zod';

export const promptOptimizationSchema = z.strictObject({
  optimizedPrompt: z.string().trim().min(1),
  reasoning: z.string().trim().min(1),
  suggestions: z.array(z.string().trim().min(1)),
  confidenceScore: z.number().finite().min(0).max(1),
});
export type PromptOptimizationResult = z.infer<typeof promptOptimizationSchema>;
export const PROMPT_OPTIMIZATION_SCHEMA_NAME = 'prompt_optimization';
