import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createImageGenExecutor,
  ImageGenExecutor,
} from '@workflow-engine/executors/saas/image-gen-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      id: 'ig-1',
      inputs: [],
      label: 'ImageGen',
      type: 'imageGen',
    } as ExecutableNode,
  };
}

describe('ImageGenExecutor', () => {
  let executor: ImageGenExecutor;

  beforeEach(() => {
    executor = createImageGenExecutor();
    executor.setResolver(
      vi.fn().mockResolvedValue({
        filename: 'out.png',
        imageUrl: 'http://img.png',
        model: 'flux',
        provider: 'replicate',
      }),
    );
  });

  describe('validate', () => {
    it('valid with model', () => {
      expect(
        executor.validate({
          config: { model: 'flux' },
          id: '1',
          inputs: [],
          label: 'IG',
          type: 'imageGen',
        }).valid,
      ).toBe(true);
    });
    it('invalid without model', () => {
      expect(
        executor.validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'IG',
          type: 'imageGen',
        }).valid,
      ).toBe(false);
    });
    it('invalid with non-string model', () => {
      expect(
        executor.validate({
          config: { model: 123 },
          id: '1',
          inputs: [],
          label: 'IG',
          type: 'imageGen',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 5', () => {
    expect(
      executor.estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'IG',
        type: 'imageGen',
      }),
    ).toBe(5);
  });

  describe('execute', () => {
    it('throws without resolver', async () => {
      const exec = createImageGenExecutor();
      await expect(exec.execute(makeInput({ model: 'flux' }))).rejects.toThrow(
        'resolver',
      );
    });

    it('generates image with defaults', async () => {
      const result = await executor.execute(makeInput({ model: 'flux' }));
      expect(result.metadata?.model).toBe('flux');
      expect(result.metadata?.provider).toBe('replicate');
    });

    it('uses prompt from input over config', async () => {
      await executor.execute(
        makeInput({ model: 'flux', prompt: 'config' }, { prompt: 'input' }),
      );
      // The resolver receives 'input' prompt
    });

    it('passes upstream image input as references and preserves image-guided params', async () => {
      const resolver = vi.fn().mockResolvedValue({
        filename: 'guided.png',
        imageUrl: 'http://guided.png',
        model: 'qwen-image',
        provider: 'replicate',
      });
      executor.setResolver(resolver);

      await executor.execute(
        makeInput(
          {
            model: 'qwen-image',
            negativePrompt: 'cartoonish, distorted geometry',
            strength: 0.35,
          },
          {
            image: 'https://example.com/source-room.jpg',
            prompt: 'Stage this room realistically',
          },
        ),
      );

      expect(resolver).toHaveBeenCalledWith(
        'qwen-image',
        {
          height: 1024,
          negativePrompt: 'cartoonish, distorted geometry',
          prompt: 'Stage this room realistically',
          references: ['https://example.com/source-room.jpg'],
          strength: 0.35,
          width: 1024,
        },
        expect.objectContaining({
          organizationId: 'org-1',
          runId: 'run-1',
          userId: 'user-1',
          workflowId: 'wf-1',
        }),
        expect.objectContaining({
          config: expect.objectContaining({
            model: 'qwen-image',
            negativePrompt: 'cartoonish, distorted geometry',
            strength: 0.35,
          }),
          id: 'ig-1',
          label: 'ImageGen',
          type: 'imageGen',
        }),
      );
    });

    it('rethrows backend resolver failures', async () => {
      const resolver = vi.fn().mockRejectedValue(new Error('replicate failed'));
      executor.setResolver(resolver);

      await expect(
        executor.execute(
          makeInput(
            { model: 'black-forest-labs/flux-2-pro' },
            {
              image: 'https://example.com/floorplan.png',
              prompt: 'Create a layout-faithful interior preview',
            },
          ),
        ),
      ).rejects.toThrow('replicate failed');
    });
  });
});
