import type {
  ElevenLabsConnectionRef,
  ElevenLabsSavedVoiceProviderData,
  ElevenLabsSpeechReceipt,
} from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

const elevenLabsConnectionSchema = z.object({
  credentialVersionId: z.string().min(1).optional(),
  kind: z.enum(['byok', 'platform']),
  organizationId: z.string().min(1),
  provider: z.literal('elevenlabs'),
});

const savedVoiceProviderDataSchema = z.object({
  category: z.string().nullable(),
  connection: elevenLabsConnectionSchema,
  version: z.literal(1),
});

const speechReceiptSchema = z.object({
  connection: elevenLabsConnectionSchema,
  organizationId: z.string().min(1),
  provider: z.literal('elevenlabs'),
  state: z.enum(['accepted', 'submitted', 'completed']),
  version: z.literal(1),
  voice: z.object({
    externalVoiceId: z.string().min(1),
    internalVoiceId: z.string().min(1).optional(),
  }),
});

/** Reads `providerData.elevenlabs` from a saved voice reference. */
export function readSavedVoiceBinding(
  providerData: unknown,
): ElevenLabsSavedVoiceProviderData | undefined {
  if (!providerData || typeof providerData !== 'object') {
    return undefined;
  }
  const parsed = savedVoiceProviderDataSchema.safeParse(
    (providerData as { elevenlabs?: unknown }).elevenlabs,
  );
  return parsed.success ? parsed.data : undefined;
}

export function readSpeechReceipt(
  generationProvider: unknown,
): ElevenLabsSpeechReceipt | undefined {
  const parsed = speechReceiptSchema.safeParse(generationProvider);
  return parsed.success ? parsed.data : undefined;
}

export function savedVoiceProviderData(
  existing: unknown,
  connection: ElevenLabsConnectionRef,
  category: string | null,
): Record<string, unknown> {
  const binding: ElevenLabsSavedVoiceProviderData = {
    category,
    connection,
    version: 1,
  };
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    elevenlabs: binding,
  };
}
