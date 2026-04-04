import {
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';

describe('model-key.util', () => {
  it('detects genfeed-ai self-hosted destinations', () => {
    expect(isGenfeedAiDestination('genfeed-ai/z-image-turbo')).toBe(true);
  });

  it('does not treat genfeed-ai self-hosted destinations as Replicate', () => {
    expect(isReplicateDestination('genfeed-ai/z-image-turbo')).toBe(false);
  });

  it('still treats owner/model destinations as Replicate when not self-hosted', () => {
    expect(isReplicateDestination('google/imagen-4')).toBe(true);
  });
});
