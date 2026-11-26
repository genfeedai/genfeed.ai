import type {
  ExecutableNode,
  ExecutionContext,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';
import { buildMotionControlResolverRequest } from './media-generation-resolver-request';
import { MotionControlExecutor } from './motion-control-executor';

const context = {
  organizationId: 'org',
  runId: 'run',
  userId: 'user',
  workflowId: 'workflow',
  workflowVersionId: 'version',
} satisfies ExecutionContext;

function motionNode(config: Record<string, unknown>): ExecutableNode {
  return {
    config,
    id: 'motion',
    inputs: [],
    label: 'Motion',
    type: 'motionControl',
  };
}

describe('motion control resolver request', () => {
  it('maps the image and motion video inputs and drops unset options', () => {
    const request = buildMotionControlResolverRequest(
      motionNode({ model: 'kwaivgi/kling-v3-motion-control' }),
      new Map<string, unknown>([
        ['image', 'image-1'],
        ['video', 'video-1'],
      ]),
    );

    expect(request).toEqual({
      model: 'kwaivgi/kling-v3-motion-control',
      params: {
        prompt: '',
        references: ['image-1'],
        videoReferences: ['video-1'],
      },
    });
  });

  it('prefers a connected input over stored config and keeps the provider options', () => {
    const request = buildMotionControlResolverRequest(
      motionNode({
        brandId: 'brand-1',
        characterOrientation: 'video',
        image: 'stored-image',
        keepOriginalSound: false,
        model: 'kwaivgi/kling-v3-motion-control',
        prompt: 'stored prompt',
        qualityMode: 'pro',
        video: 'stored-video',
      }),
      new Map<string, unknown>([
        ['image', 'connected-image'],
        ['prompt', 'connected prompt'],
      ]),
    );

    expect(request.params).toEqual({
      brandId: 'brand-1',
      characterOrientation: 'video',
      keepOriginalSound: false,
      prompt: 'connected prompt',
      qualityMode: 'pro',
      references: ['connected-image'],
      videoReferences: ['stored-video'],
    });
  });

  it('does not read a duration, aspect ratio or seed the provider cannot honor', () => {
    const request = buildMotionControlResolverRequest(
      motionNode({
        aspectRatio: '9:16',
        duration: 10,
        model: 'kwaivgi/kling-v3-motion-control',
        seed: 7,
      }),
      new Map<string, unknown>(),
    );

    expect(Object.keys(request.params)).toEqual(['prompt']);
  });

  it('requires a model', () => {
    expect(() =>
      buildMotionControlResolverRequest(motionNode({}), new Map()),
    ).toThrow('Missing required config: model');
  });
});

describe('MotionControlExecutor', () => {
  it('rejects a node without a model', () => {
    expect(new MotionControlExecutor().validate(motionNode({})).valid).toBe(
      false,
    );
  });

  it('hands the prepared request to its resolver and returns the pending output', async () => {
    const pending = {
      id: 'ingredient-1',
      model: 'kwaivgi/kling-v3-motion-control',
      provider: 'replicate',
      status: 'processing',
      videoUrl: 'https://cdn.example/ingredient-1.mp4',
    };
    const resolver = vi.fn().mockResolvedValue(pending);
    const executor = new MotionControlExecutor();
    executor.setResolver(resolver);
    const node = motionNode({ model: 'kwaivgi/kling-v3-motion-control' });
    const inputs = new Map<string, unknown>([['image', 'image-1']]);

    const output = await executor.execute({ context, inputs, node });

    expect(output.data).toEqual(pending);
    expect(resolver).toHaveBeenCalledExactlyOnceWith(
      'kwaivgi/kling-v3-motion-control',
      { prompt: '', references: ['image-1'] },
      context,
      node,
    );
  });

  it('fails when no resolver is configured', async () => {
    await expect(
      new MotionControlExecutor().execute({
        context,
        inputs: new Map(),
        node: motionNode({ model: 'kwaivgi/kling-v3-motion-control' }),
      }),
    ).rejects.toThrow('MotionControl resolver not configured');
  });
});
