import { crunVideoQuoteIntentSchema } from '@api/collections/videos/dto/create-crun-video-quote.dto';

describe('Crun video strict logical intent', () => {
  const intent = {
    model: 'crun/kling/v2-5-turbo-pro',
    text: ' bird ',
    crunControls: { contractVersion: 'reviewed' },
  };
  it('normalizes the complete deterministic defaults and retains zero', () => {
    const value = crunVideoQuoteIntentSchema.parse({
      ...intent,
      crunControls: { ...intent.crunControls, guidanceScale: 0 },
    });
    expect(value).toMatchObject({
      text: 'bird',
      outputs: 1,
      references: [],
      crunControls: { duration: 5, aspectRatio: '16:9', guidanceScale: 0 },
    });
  });
  it.each([
    { extra: 1 },
    { outputs: '4' },
    { outputs: null },
    { references: ['https://bad.invalid/frame'] },
    { endFrame: 'c2345678901234567890123456' },
    { crunControls: { contractVersion: 'reviewed', audio: true } },
  ])('rejects unsupported intent %j', (invalid) => {
    expect(
      crunVideoQuoteIntentSchema.safeParse({ ...intent, ...invalid }).success,
    ).toBe(false);
  });
  it('rejects Veo frames and unsupported guidance and preserves false translation', () => {
    const veo = {
      model: 'crun/google/veo3-1-fast-t2v',
      text: 'bird',
      crunControls: { contractVersion: 'reviewed', translatePrompt: false },
    };
    expect(crunVideoQuoteIntentSchema.parse(veo).crunControls).toMatchObject({
      duration: 8,
      resolution: '720p',
      translatePrompt: false,
    });
    expect(
      crunVideoQuoteIntentSchema.safeParse({
        ...veo,
        references: ['c2345678901234567890123456'],
      }).success,
    ).toBe(false);
    expect(
      crunVideoQuoteIntentSchema.safeParse({
        ...veo,
        crunControls: { ...veo.crunControls, guidanceScale: 0 },
      }).success,
    ).toBe(false);
  });
});
