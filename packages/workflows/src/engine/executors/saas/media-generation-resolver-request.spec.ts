import { GENFEED_ACTION_NODE_TYPE } from '@genfeedai/actions';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import { unwrapExecutableActionNode } from '../../utils/action-node';
import { ImageGenExecutor } from './image-gen-executor';
import {
  buildImageGenerationResolverRequest,
  buildVideoGenerationResolverRequest,
} from './media-generation-resolver-request';
import { VideoGenExecutor } from './video-gen-executor';

function actionNode(
  actionId: string,
  parameters: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    id: 'media',
    label: 'Media',
    type: GENFEED_ACTION_NODE_TYPE,
    inputs: [],
    config: { actionId, parameters, ...overrides },
  };
}
const context = {
  workflowId: 'workflow',
  workflowVersionId: 'version',
  runId: 'run',
  organizationId: 'org',
  userId: 'user',
} satisfies ExecutionContext;

describe('shared media resolver preparation and dispatch', () => {
  it('unwraps the actual action envelope with runtime overrides taking precedence', () => {
    const node = actionNode(
      'imageGen',
      { model: 'stored-model', width: 512 },
      { model: 'runtime-model', width: 1024 },
    );
    expect(unwrapExecutableActionNode(node)).toMatchObject({
      type: 'imageGen',
      config: { model: 'runtime-model', width: 1024 },
    });
    expect(node.config.parameters).toEqual({
      model: 'stored-model',
      width: 512,
    });
  });
  it('uses the same image 1024 defaults and upstream prompt for preparation and runtime', async () => {
    const node = unwrapExecutableActionNode(
      actionNode('imageGen', { model: 'test/image', prompt: 'stored' }),
    );
    const inputs = new Map<string, unknown>([['prompt', 'upstream']]);
    const prepared = buildImageGenerationResolverRequest(node, inputs);
    const resolver = vi.fn().mockResolvedValue({
      id: 'image',
      status: 'PROCESSING',
      model: 'test/image',
      provider: 'replicate',
      imageUrl: 'pending',
    });
    const executor = new ImageGenExecutor();
    executor.setResolver(resolver);
    await executor.execute({ node, inputs, context });
    expect(prepared.params).toEqual({
      height: 1024,
      width: 1024,
      prompt: 'upstream',
    });
    expect(resolver).toHaveBeenCalledExactlyOnceWith(
      prepared.model,
      prepared.params,
      context,
      node,
    );
  });
  it('keeps absent video duration unresolved in both callers instead of filling an estimate', async () => {
    const node = unwrapExecutableActionNode(
      actionNode('videoGen', { model: 'test/video' }),
    );
    const inputs = new Map<string, unknown>();
    const prepared = buildVideoGenerationResolverRequest(node, inputs);
    const resolver = vi.fn().mockResolvedValue({
      id: 'video',
      status: 'PROCESSING',
      model: 'test/video',
      provider: 'replicate',
      videoUrl: 'pending',
    });
    const executor = new VideoGenExecutor();
    executor.setResolver(resolver);
    await executor.execute({ node, inputs, context });
    expect(prepared.params).toEqual({ height: 1080, width: 1920, prompt: '' });
    expect(prepared.params).not.toHaveProperty('duration');
    expect(resolver).toHaveBeenCalledExactlyOnceWith(
      prepared.model,
      prepared.params,
      context,
      node,
    );
  });
  it('preserves video reference, last-frame and identity lineage precedence', () => {
    const identityReferences = [{ assetId: 'identity', role: 'character' }];
    const node = unwrapExecutableActionNode(
      actionNode('videoGen', {
        model: 'test/video',
        image: 'config-image',
        videoReference: 'config-video',
        lastFrame: 'config-last',
        duration: 6,
        identityReferences,
        parentIngredientId: 'parent',
      }),
    );
    const prepared = buildVideoGenerationResolverRequest(
      node,
      new Map<string, unknown>([
        ['image', 'cached-image'],
        ['videoReference', 'cached-video'],
        ['lastFrame', 'cached-last'],
      ]),
    );
    expect(prepared.params).toMatchObject({
      references: ['cached-image'],
      videoReferences: ['cached-video'],
      lastFrame: 'cached-last',
      duration: 6,
      identityReferences,
      parentIngredientId: 'parent',
    });
  });
  it('retains explicit zero and empty prompt while dropping null optional fields', () => {
    const node = unwrapExecutableActionNode(
      actionNode('imageGen', {
        model: 'test/image',
        seed: 0,
        width: 0,
        height: null,
        strength: null,
        prompt: 'stored',
      }),
    );
    expect(
      buildImageGenerationResolverRequest(node, new Map([['prompt', '']]))
        .params,
    ).toEqual({ prompt: '', seed: 0, width: 0, height: 1024 });
  });
  it('does not merge unrelated payload or edge fields into typed media requests', () => {
    const node = unwrapExecutableActionNode(
      actionNode('imageGen', { model: 'test/image', payload: { width: 9999 } }),
    );
    const inputs = new Map<string, unknown>([
      ['width', 7777],
      ['payload', { width: 8888 }],
    ]);
    expect(buildImageGenerationResolverRequest(node, inputs).params).toEqual({
      prompt: '',
      width: 1024,
      height: 1024,
    });
  });
  it('rejects unknown or empty product action identities', () => {
    expect(() =>
      unwrapExecutableActionNode(actionNode('unknown-action', {})),
    ).toThrow('Unknown Genfeed action');
    expect(() => unwrapExecutableActionNode(actionNode('', {}))).toThrow(
      'requires a non-empty actionId',
    );
  });
  it('preserves native node identity and the existing required model error', () => {
    const node: ExecutableNode = {
      id: 'input',
      type: 'workflowInput',
      label: 'Input',
      config: {},
      inputs: [],
    };
    expect(unwrapExecutableActionNode(node)).toBe(node);
    expect(() => buildImageGenerationResolverRequest(node, new Map())).toThrow(
      'Missing required config: model',
    );
  });
});
