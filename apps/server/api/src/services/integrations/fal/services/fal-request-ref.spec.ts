import {
  encodeFalRequestRef,
  parseFalRequestRef,
} from '@api/services/integrations/fal/services/fal-request-ref';

describe('fal request reference', () => {
  it('round-trips an endpoint with slashes', () => {
    const ref = { endpoint: 'fal-ai/kling-video/v2/master', requestId: 'r-1' };

    expect(parseFalRequestRef(encodeFalRequestRef(ref))).toEqual(ref);
  });

  it('ignores a batch suffix on the id', () => {
    expect(parseFalRequestRef('fal-request:fal-ai/flux:r-1_2')).toEqual({
      endpoint: 'fal-ai/flux',
      requestId: 'r-1',
    });
  });

  it.each([
    null,
    undefined,
    '',
    'https://v3.fal.media/out.png',
    'pred-1',
    'fal-request:',
    'fal-request:fal-ai/flux',
    'fal-request::r-1',
    'fal-request:fal-ai/flux:',
  ])('reads %s as no reference', (value) => {
    expect(parseFalRequestRef(value)).toBeNull();
  });
});
