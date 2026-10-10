import {
  assertSeedanceNativeOutputQuote,
  prepareSeedanceNativeOutputQuote,
} from '@api/collections/videos/services/seedance-native-output-quote.util';
import { describe, expect, it } from 'vitest';

const endpoint = 'bytedance/seedance-2.5/reference-to-video';
const input = {
  task: 'extension',
  aspect_ratio: 'auto',
  resolution: '720p',
  duration: '8',
};
const source = { sourceVersion: 'a'.repeat(64), width: 1920, height: 1080 };
describe('measured native extension output bounds', () => {
  it('uses the measured source ratio and prepared resolution, without accepting canvas dimensions', () => {
    const evidence = prepareSeedanceNativeOutputQuote(
      endpoint,
      { ...input, width: 1, height: 1 },
      [source],
    );
    if (!evidence) throw new Error('Expected measured extension evidence');
    expect(evidence).toMatchObject({
      width: 1280,
      height: 720,
      duration: 8,
      framesPerSecond: 24,
      sourceVersion: source.sourceVersion,
    });
    expect(() =>
      assertSeedanceNativeOutputQuote(input, evidence),
    ).not.toThrow();
    expect(() =>
      assertSeedanceNativeOutputQuote(input, { ...evidence, width: 1 }),
    ).toThrow();
    expect(() =>
      assertSeedanceNativeOutputQuote({ ...input, duration: '30' }, evidence),
    ).toThrow();
  });
  it('binds portrait and draft output to the published shape', () => {
    expect(
      prepareSeedanceNativeOutputQuote(endpoint, { ...input, draft: true }, [
        { ...source, width: 1080, height: 1920 },
      ]),
    ).toMatchObject({ resolution: '480p', width: 496, height: 864 });
  });
  it.each([
    { input: { ...input, duration: 'auto' }, sources: [source] },
    { input, sources: [source, source] },
    { input, sources: [{ ...source, width: 1400, height: 1000 }] },
    { input, sources: [{ ...source, sourceVersion: 'unmeasured' }] },
  ])(
    'refuses unresolved automatic or unmeasured bounds before spending',
    ({ input: value, sources }) => {
      expect(() =>
        prepareSeedanceNativeOutputQuote(endpoint, value, sources),
      ).toThrow();
    },
  );
  it('does not reinterpret editing as extension', () => {
    expect(
      prepareSeedanceNativeOutputQuote(
        endpoint,
        { ...input, task: 'editing' },
        [source],
      ),
    ).toBeUndefined();
  });
});
