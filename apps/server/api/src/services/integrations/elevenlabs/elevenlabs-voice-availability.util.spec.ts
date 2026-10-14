import { elevenLabsVoiceEligibility } from '@api/services/integrations/elevenlabs/elevenlabs-voice-availability.util';

describe('elevenLabsVoiceEligibility', () => {
  it('makes an ordinary clone available', () => {
    expect(elevenLabsVoiceEligibility({ category: 'cloned' })).toEqual({
      availability: 'available',
      restriction: null,
    });
  });

  it.each(['BAN', 'ENTERPRISE_BAN'] as const)(
    'marks a %s voice unavailable',
    (safetyControl) => {
      expect(elevenLabsVoiceEligibility({ safetyControl })).toMatchObject({
        availability: 'unavailable',
      });
    },
  );

  it('requires a trained professional clone', () => {
    expect(
      elevenLabsVoiceEligibility({
        category: 'professional',
        fineTuning: { state: { eleven_v2: 'queued' } },
      }),
    ).toMatchObject({ availability: 'unavailable' });
    expect(
      elevenLabsVoiceEligibility({
        category: 'professional',
        fineTuning: { state: { eleven_v2: 'fine_tuned' } },
      }),
    ).toMatchObject({ availability: 'available' });
  });

  it('restricts a voice awaiting verification or extra safety checks', () => {
    expect(
      elevenLabsVoiceEligibility({
        voiceVerification: {
          isVerified: false,
          requiresVerification: true,
          verificationAttemptsCount: 0,
          verificationFailures: [],
        },
      }),
    ).toMatchObject({ availability: 'restricted' });
    expect(
      elevenLabsVoiceEligibility({ safetyControl: 'CAPTCHA' }),
    ).toMatchObject({ availability: 'restricted' });
  });
});
