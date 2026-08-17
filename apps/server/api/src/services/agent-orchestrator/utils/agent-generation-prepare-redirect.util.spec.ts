import { AgentToolName } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { getGenerationPreparationRedirect } from './agent-generation-prepare-redirect.util';

describe('getGenerationPreparationRedirect', () => {
  it('remaps image, video, and identity generate tools to prepare_generation', () => {
    const allowed = new Set([AgentToolName.PREPARE_GENERATION]);

    expect(
      getGenerationPreparationRedirect(AgentToolName.GENERATE_IMAGE, allowed),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(AgentToolName.GENERATE_VIDEO, allowed),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(
        AgentToolName.GENERATE_AS_IDENTITY,
        allowed,
      ),
    ).toBe(AgentToolName.PREPARE_GENERATION);
  });

  it('remaps generate_voice to the voice-clone card when that prepare tool is allowed', () => {
    expect(
      getGenerationPreparationRedirect(
        AgentToolName.GENERATE_VOICE,
        new Set([AgentToolName.PREPARE_VOICE_CLONE]),
      ),
    ).toBe(AgentToolName.PREPARE_VOICE_CLONE);
  });

  it('leaves generate_voice alone when prepare_voice_clone is not in the run', () => {
    expect(
      getGenerationPreparationRedirect(
        AgentToolName.GENERATE_VOICE,
        new Set([AgentToolName.PREPARE_GENERATION]),
      ),
    ).toBeNull();
  });

  it('does not remap when the matching prepare tool is unavailable', () => {
    expect(
      getGenerationPreparationRedirect(
        AgentToolName.GENERATE_IMAGE,
        new Set([AgentToolName.PREPARE_VOICE_CLONE]),
      ),
    ).toBeNull();
  });
});
