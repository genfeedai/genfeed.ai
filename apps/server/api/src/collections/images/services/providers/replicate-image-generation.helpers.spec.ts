import {
  extractReplicateOutputUrls,
  interpretReplicatePredictionStatus,
  replicateImageOutputStrategy,
  replicatePredictionFailureMessage,
  requireReplicateOutputUrls,
  shouldPollReplicatePrediction,
} from './replicate-image-generation.helpers';

describe('shouldPollReplicatePrediction', () => {
  it('polls unless cloud deployment can receive provider webhooks', () => {
    expect(shouldPollReplicatePrediction(true, true)).toBe(false);
    expect(shouldPollReplicatePrediction(true, false)).toBe(true);
    expect(shouldPollReplicatePrediction(false, true)).toBe(true);
    expect(shouldPollReplicatePrediction(false, false)).toBe(true);
  });
});

describe('replicateImageOutputStrategy', () => {
  it('batches only when the model advertises batch support', () => {
    expect(replicateImageOutputStrategy(true)).toBe('batch');
    expect(replicateImageOutputStrategy(false)).toBe('sequential');
  });
});

describe('extractReplicateOutputUrls', () => {
  it('accepts a string or string array and ignores other shapes', () => {
    expect(extractReplicateOutputUrls('https://cdn.example/a.png')).toEqual([
      'https://cdn.example/a.png',
    ]);
    expect(
      extractReplicateOutputUrls(['https://cdn.example/a.png', 12, 'b']),
    ).toEqual(['https://cdn.example/a.png', 'b']);
    expect(extractReplicateOutputUrls({ url: 'x' })).toEqual([]);
  });
});

describe('interpretReplicatePredictionStatus', () => {
  it('classifies terminal and pending statuses', () => {
    expect(interpretReplicatePredictionStatus('succeeded')).toBe('succeeded');
    expect(interpretReplicatePredictionStatus('canceled')).toBe('canceled');
    expect(interpretReplicatePredictionStatus('failed')).toBe('failed');
    expect(interpretReplicatePredictionStatus('processing')).toBe('pending');
  });
});

describe('requireReplicateOutputUrls', () => {
  it('returns string outputs and fails closed without a URL', () => {
    expect(
      requireReplicateOutputUrls('https://cdn.example/a.png', 'p1'),
    ).toEqual(['https://cdn.example/a.png']);
    expect(() => requireReplicateOutputUrls([], 'p1')).toThrow(
      'succeeded without an output URL',
    );
  });
});

describe('replicatePredictionFailureMessage', () => {
  it('prefers the provider error string', () => {
    expect(replicatePredictionFailureMessage('p1', 'failed', 'boom')).toBe(
      'boom',
    );
    expect(replicatePredictionFailureMessage('p1', 'failed')).toBe(
      'Replicate prediction p1 failed',
    );
  });
});
