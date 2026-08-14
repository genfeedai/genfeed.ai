import {
  resolveVideoOutputPlacement,
  videoGenerationStartDetail,
} from './video-generation-output.util';

describe('resolveVideoOutputPlacement', () => {
  it('uses a single placeholder for one output', () => {
    expect(resolveVideoOutputPlacement(true, 1)).toBe('single');
    expect(resolveVideoOutputPlacement(false, 1)).toBe('single');
  });

  it('batches extra outputs only when the model supports it', () => {
    expect(resolveVideoOutputPlacement(true, 3)).toBe('batch');
    expect(resolveVideoOutputPlacement(false, 3)).toBe('sequential');
  });
});

describe('videoGenerationStartDetail', () => {
  it('names the failed output when a later sequential call never starts', () => {
    expect(videoGenerationStartDetail()).toBe(
      'Video generation failed to start',
    );
    expect(videoGenerationStartDetail(2)).toBe(
      'Video generation failed to start for output 2',
    );
  });
});
