import * as imageGenerationBriefRegistry from '@api/services/generation-brief/image-generation-brief-registry';
import { runImageGenerationBrief } from '@api/services/generation-brief/run-image-generation-brief';
import {
  FLUX_SCHNELL_MODEL_KEY,
  QWEN_IMAGE_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

describe('runImageGenerationBrief', () => {
  it('stamps the originating surface on compiled evidence (#3469)', () => {
    const result = runImageGenerationBrief({
      height: 1080,
      model: FLUX_SCHNELL_MODEL_KEY,
      objective: 'a sunset over the ocean',
      surface: 'studio',
      width: 1920,
    });

    expect(result.brief?.intent.objective).toBe('a sunset over the ocean');
    expect(result.dispatch).toEqual(
      expect.objectContaining({ prompt: expect.any(String) }),
    );
    expect(result.evidence).toMatchObject({
      status: 'compiled',
      surface: 'studio',
    });
  });

  it('produces equivalent briefs across surfaces and only differs in provenance', () => {
    const input = {
      height: 1080,
      model: FLUX_SCHNELL_MODEL_KEY,
      objective: 'a sunset over the ocean',
      width: 1920,
    };

    const studio = runImageGenerationBrief({ ...input, surface: 'studio' });
    const workflow = runImageGenerationBrief({
      ...input,
      surface: 'workflow',
    });

    expect(studio.brief).toEqual(workflow.brief);
    expect(studio.dispatch).toEqual(workflow.dispatch);
    expect(studio.generationSource).toBe(workflow.generationSource);
    expect(studio.evidence.surface).toBe('studio');
    expect(workflow.evidence.surface).toBe('workflow');
  });

  it('preserves an explicit avoid input in the canonical brief and native provider dispatch', () => {
    const result = runImageGenerationBrief({
      avoid: ['watermark, blurry text'],
      height: 1024,
      model: QWEN_IMAGE_MODEL_KEY,
      objective: 'A launch poster',
      surface: 'workflow',
      width: 1024,
    });

    expect(result.brief?.constraints).toContainEqual({
      kind: 'avoid',
      required: false,
      value: 'watermark, blurry text',
    });
    expect(result.dispatch).toMatchObject({
      negative_prompt: 'watermark, blurry text',
    });
  });

  it('records an explicit exemption instead of compiling unregistered skill models', () => {
    const result = runImageGenerationBrief({
      height: 1024,
      model: 'unknown-provider/unknown-model',
      objective: 'cyberpunk city',
      surface: 'agent_skill',
      width: 1024,
    });

    expect(result.brief).toBeUndefined();
    expect(result.dispatch).toBeUndefined();
    expect(result.evidence).toMatchObject({
      modelKey: 'unknown-provider/unknown-model',
      reason: 'unregistered_model',
      status: 'exempted',
      surface: 'agent_skill',
    });
  });

  it('fails with a typed configuration error before compilation when a required registry entry disappears', () => {
    const registryEntry =
      imageGenerationBriefRegistry.getImageGenerationBriefRegistryEntry(
        FLUX_SCHNELL_MODEL_KEY,
      );
    if (!registryEntry) {
      throw new Error('FLUX Schnell registry fixture is missing');
    }
    const compile = vi.fn(registryEntry.compile);
    const registryLookup = vi
      .spyOn(
        imageGenerationBriefRegistry,
        'getImageGenerationBriefRegistryEntry',
      )
      .mockReturnValueOnce({ ...registryEntry, compile })
      .mockReturnValueOnce(undefined);

    let failure: unknown;
    try {
      runImageGenerationBrief({
        height: 1080,
        model: FLUX_SCHNELL_MODEL_KEY,
        objective: 'a sunset over the ocean',
        surface: 'workflow',
        width: 1920,
      });
    } catch (error: unknown) {
      failure = error;
    } finally {
      registryLookup.mockRestore();
    }

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).message).toContain(FLUX_SCHNELL_MODEL_KEY);
    expect(compile).not.toHaveBeenCalled();
  });
});
