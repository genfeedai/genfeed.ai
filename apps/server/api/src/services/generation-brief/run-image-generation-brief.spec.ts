import { runImageGenerationBrief } from '@api/services/generation-brief/run-image-generation-brief';
import { FLUX_SCHNELL_MODEL_KEY } from '@api-types/contracts/generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ImageTaskModel } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

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

  it('records an explicit exemption instead of compiling unregistered skill models', () => {
    const result = runImageGenerationBrief({
      height: 1024,
      model: ImageTaskModel.FAL,
      objective: 'cyberpunk city',
      surface: 'agent_skill',
      width: 1024,
    });

    expect(result.brief).toBeUndefined();
    expect(result.dispatch).toBeUndefined();
    expect(result.evidence).toMatchObject({
      modelKey: MODEL_KEYS.FAL_FLUX_DEV,
      reason: 'legacy_prompt_builder',
      status: 'exempted',
      surface: 'agent_skill',
    });
  });
});
