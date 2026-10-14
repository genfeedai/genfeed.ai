import {
  classifyElevenLabsFailure,
  toElevenLabsActionableError,
} from '@api/services/integrations/elevenlabs/elevenlabs-error.util';
import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import { BadRequestException } from '@nestjs/common';

describe('ElevenLabs failure classification', () => {
  it.each([
    [401, undefined, 'invalid-credential'],
    [400, { detail: { status: 'invalid_api_key' } }, 'invalid-credential'],
    [404, undefined, 'voice-unavailable'],
    [400, { detail: { status: 'voice_not_found' } }, 'voice-unavailable'],
    [403, undefined, 'permission'],
  ])('classifies %s %j as %s', (statusCode, body, kind) => {
    expect(
      classifyElevenLabsFailure(
        new ElevenLabsError({ body, message: 'failed', statusCode }),
      ),
    ).toBe(kind);
  });

  it('leaves transient and unknown failures untouched', () => {
    const transient = new ElevenLabsError({ message: 'busy', statusCode: 503 });
    const plain = new Error('socket hang up');

    expect(toElevenLabsActionableError(transient)).toBe(transient);
    expect(toElevenLabsActionableError(plain)).toBe(plain);
  });

  it('turns account failures into an actionable 400', () => {
    expect(
      toElevenLabsActionableError(
        new ElevenLabsError({ message: 'no', statusCode: 401 }),
      ),
    ).toBeInstanceOf(BadRequestException);
  });
});
