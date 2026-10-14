import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import { BadRequestException } from '@nestjs/common';

export type ElevenLabsFailureKind =
  | 'invalid-credential'
  | 'permission'
  | 'voice-unavailable';

const FAILURE_MESSAGES: Record<ElevenLabsFailureKind, string> = {
  'invalid-credential':
    'ElevenLabs rejected the connected API key. Reconnect your ElevenLabs account.',
  permission:
    'The connected ElevenLabs key is not allowed to use this voice. Check the key permissions in ElevenLabs.',
  'voice-unavailable':
    'This voice is not available in the connected ElevenLabs account. Choose another voice or import it again.',
};

function detailStatus(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('detail' in body)) {
    return undefined;
  }
  const detail = (body as { detail?: unknown }).detail;
  if (detail && typeof detail === 'object' && 'status' in detail) {
    const status = (detail as { status?: unknown }).status;
    return typeof status === 'string' ? status : undefined;
  }
  return undefined;
}

/** Classifies account and voice failures; other errors return undefined. */
export function classifyElevenLabsFailure(
  error: unknown,
): ElevenLabsFailureKind | undefined {
  if (!(error instanceof ElevenLabsError)) {
    return undefined;
  }

  const status = detailStatus(error.body);
  if (error.statusCode === 401 || status === 'invalid_api_key') {
    return 'invalid-credential';
  }
  if (error.statusCode === 404 || status === 'voice_not_found') {
    return 'voice-unavailable';
  }
  if (error.statusCode === 403) {
    return 'permission';
  }
  return undefined;
}

/** An actionable 400 for account and voice failures, else the original error. */
export function toElevenLabsActionableError(error: unknown): unknown {
  const kind = classifyElevenLabsFailure(error);
  return kind ? new BadRequestException(FAILURE_MESSAGES[kind]) : error;
}
