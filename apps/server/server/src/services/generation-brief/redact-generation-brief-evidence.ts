import type { GenerationBriefPersistedEvidence } from '@api-types/contracts/generation-brief-compiler.contract';
import { generationBriefPersistedEvidenceSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@api-types/contracts/video-generation-brief-compiler.contract';
import { videoGenerationBriefPersistedEvidenceSchema } from '@api-types/contracts/video-generation-brief-compiler.contract';

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  'apiKey',
  'authorization',
  'negative_prompt',
  'negativePrompt',
  'password',
  'prompt',
  'secret',
  'signedUrl',
  'token',
  'url',
]);

const FORBIDDEN_EVIDENCE_VALUE_PATTERN = /https?:\/\/|sk-|r8_/i;

function assertRedactedValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      assertRedactedValue(entry);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_EVIDENCE_KEYS.has(key)) {
        throw new Error(
          'Generation brief evidence must not contain prompt secrets, credentials, or signed URLs.',
        );
      }
      assertRedactedValue(child);
    }
    return;
  }

  if (
    typeof value === 'string' &&
    FORBIDDEN_EVIDENCE_VALUE_PATTERN.test(value)
  ) {
    throw new Error(
      'Generation brief evidence must not contain prompt secrets, credentials, or signed URLs.',
    );
  }
}

export function assertRedactedGenerationBriefEvidence(
  evidence: GenerationBriefPersistedEvidence,
): GenerationBriefPersistedEvidence {
  const parsed = generationBriefPersistedEvidenceSchema.parse(evidence);
  assertRedactedValue(parsed);
  return parsed;
}

export function toRedactedGenerationBriefProviderData(
  evidence: GenerationBriefPersistedEvidence,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(assertRedactedGenerationBriefEvidence(evidence)),
  );
}

export function assertRedactedVideoGenerationBriefEvidence(
  evidence: VideoGenerationBriefPersistedEvidence,
): VideoGenerationBriefPersistedEvidence {
  const parsed = videoGenerationBriefPersistedEvidenceSchema.parse(evidence);
  assertRedactedValue(parsed);
  return parsed;
}

export function toRedactedVideoGenerationBriefProviderData(
  evidence: VideoGenerationBriefPersistedEvidence,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(assertRedactedVideoGenerationBriefEvidence(evidence)),
  );
}
