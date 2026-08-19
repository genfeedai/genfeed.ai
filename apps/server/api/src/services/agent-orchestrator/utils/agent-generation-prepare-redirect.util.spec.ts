import { AgentToolName } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getGenerationPreparationRedirect,
  inferPrepareGenerationType,
  normalizeRequestedAgentToolName,
} from './agent-generation-prepare-redirect.util';

describe('normalizeRequestedAgentToolName', () => {
  it('strips vendor prefixes such as default_api.', () => {
    expect(normalizeRequestedAgentToolName('default_api.generate_image')).toBe(
      AgentToolName.GENERATE_IMAGE,
    );
    expect(normalizeRequestedAgentToolName('default_api.generate_video')).toBe(
      AgentToolName.GENERATE_VIDEO,
    );
    expect(normalizeRequestedAgentToolName('default_api.generate_voice')).toBe(
      AgentToolName.GENERATE_VOICE,
    );
  });

  it('leaves already-canonical names unchanged', () => {
    expect(normalizeRequestedAgentToolName('generate_image')).toBe(
      AgentToolName.GENERATE_IMAGE,
    );
  });
});

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

  it('strips default_api prefixes before remapping image, video, and voice', () => {
    const visualAllowed = new Set([AgentToolName.PREPARE_GENERATION]);
    const voiceAllowed = new Set([AgentToolName.PREPARE_VOICE_CLONE]);

    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_image',
        visualAllowed,
      ),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_video',
        visualAllowed,
      ),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_voice',
        voiceAllowed,
      ),
    ).toBe(AgentToolName.PREPARE_VOICE_CLONE);
  });

  it('recovers unknown generate-like names onto the matching prepare card', () => {
    expect(
      getGenerationPreparationRedirect(
        'default_api.image_generation',
        new Set([AgentToolName.PREPARE_GENERATION]),
      ),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(
        'txt2video',
        new Set([AgentToolName.PREPARE_GENERATION]),
      ),
    ).toBe(AgentToolName.PREPARE_GENERATION);
    expect(
      getGenerationPreparationRedirect(
        'default_api.tts_voiceover',
        new Set([AgentToolName.PREPARE_VOICE_CLONE]),
      ),
    ).toBe(AgentToolName.PREPARE_VOICE_CLONE);
  });

  it('does not remap unknown non-generate tools', () => {
    expect(
      getGenerationPreparationRedirect(
        'default_api.nonexistent_tool',
        new Set([
          AgentToolName.PREPARE_GENERATION,
          AgentToolName.PREPARE_VOICE_CLONE,
        ]),
      ),
    ).toBeNull();
  });

  it('does not remap content-generation tools onto the media card', () => {
    expect(
      getGenerationPreparationRedirect(
        AgentToolName.GENERATE_CONTENT,
        new Set([AgentToolName.PREPARE_GENERATION]),
      ),
    ).toBeNull();
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

describe('inferPrepareGenerationType', () => {
  it('maps prefixed and generate-like visual names onto image or video', () => {
    expect(inferPrepareGenerationType('default_api.generate_image')).toBe(
      'image',
    );
    expect(inferPrepareGenerationType('default_api.generate_video')).toBe(
      'video',
    );
    expect(inferPrepareGenerationType(AgentToolName.GENERATE_AS_IDENTITY)).toBe(
      'video',
    );
    expect(inferPrepareGenerationType('image_generation')).toBe('image');
  });

  it('does not invent a visual type for voice or content tools', () => {
    expect(
      inferPrepareGenerationType('default_api.generate_voice'),
    ).toBeUndefined();
    expect(
      inferPrepareGenerationType(AgentToolName.GENERATE_CONTENT),
    ).toBeUndefined();
  });
});
