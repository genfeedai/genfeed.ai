import { getCrunMediaKind } from '@api/services/integrations/crun/crun-media-kind.util';

describe('Frozen Crun route identity', () => {
  it('keeps accepted image and video routes independent of catalog activation', () => {
    expect(getCrunMediaKind('google/nano-banana-pro')).toBe('image');
    expect(getCrunMediaKind('bytedance/seedream-4-5')).toBe('image');
    expect(getCrunMediaKind('kling/v2-5-turbo-pro')).toBe('video');
    expect(getCrunMediaKind('google/veo3-1-fast-t2v')).toBe('video');
  });
  it.each([
    'crun/kling/v2-5-turbo-pro',
    'kling/v2-5-turbo-pro/other',
    'google/veo3-1',
    '',
    'unknown',
  ])('does not infer routes from prefixes: %s', (endpoint) => {
    expect(getCrunMediaKind(endpoint)).toBeNull();
  });
});
