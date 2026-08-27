import type {
  ExecutableNode,
  ExecutionContext,
  ExecutorInput,
} from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoGenExecutor } from './video-gen-executor';

function makeInput(
  config: Record<string, unknown>,
  inputMap?: Record<string, unknown>,
): ExecutorInput {
  return {
    context: {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
    } as ExecutionContext,
    inputs: new Map<string, unknown>(Object.entries(inputMap ?? {})),
    node: {
      config,
      id: 'vg-1',
      inputs: [],
      label: 'VideoGen',
      type: 'videoGen',
    } as ExecutableNode,
  };
}

describe('VideoGenExecutor', () => {
  let executor: VideoGenExecutor;

  beforeEach(() => {
    executor = new VideoGenExecutor();
    executor.setResolver(
      vi.fn().mockResolvedValue({
        model: 'prunaai/p-video',
        provider: 'replicate',
        videoUrl: 'http://video.mp4',
      }),
    );
  });

  it('requires a model', () => {
    expect(
      executor.validate({
        config: {},
        id: '1',
        inputs: [],
        label: 'VG',
        type: 'videoGen',
      }).valid,
    ).toBe(false);
  });

  it('passes prompt and first-frame image through the resolver', async () => {
    const resolver = vi.fn().mockResolvedValue({
      model: 'prunaai/p-video',
      provider: 'replicate',
      videoUrl: 'http://video.mp4',
    });
    executor.setResolver(resolver);

    await executor.execute(
      makeInput(
        { model: 'prunaai/p-video' },
        { image: 'https://example.com/frame.jpg', prompt: 'spin the product' },
      ),
    );

    expect(resolver).toHaveBeenCalledWith(
      'prunaai/p-video',
      expect.objectContaining({
        prompt: 'spin the product',
        references: ['https://example.com/frame.jpg'],
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
