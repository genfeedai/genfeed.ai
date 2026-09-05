import type { CuratedActionName } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  getGenerationPreparationRedirect,
  inferPrepareGenerationType,
  normalizeRequestedAgentToolName,
} from './agent-generation-prepare-redirect.util';

describe('normalizeRequestedAgentToolName', () => {
  it('strips vendor prefixes such as default_api.', () => {
    expect(normalizeRequestedAgentToolName('default_api.generate_image')).toBe(
      'generate_image',
    );
    expect(normalizeRequestedAgentToolName('default_api.generate_video')).toBe(
      'generate_video',
    );
    expect(normalizeRequestedAgentToolName('default_api.generate_voice')).toBe(
      'generate_voice',
    );
  });

  it('leaves already-canonical names unchanged', () => {
    expect(normalizeRequestedAgentToolName('generate_image')).toBe(
      'generate_image',
    );
  });
});

describe('getGenerationPreparationRedirect', () => {
  it('remaps prepare_generation to the concrete composer-selected tool', () => {
    const allowed = new Set<CuratedActionName>(['prepare_generation']);

    expect(
      getGenerationPreparationRedirect('prepare_generation', allowed, {
        generationMode: 'image',
      }),
    ).toBe('generate_image');
    expect(
      getGenerationPreparationRedirect('prepare_generation', allowed, {
        requestedGenerationType: 'video',
      }),
    ).toBe('generate_video');
  });

  it('admits a concrete visual tool when only prepare_generation was exposed', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_image',
        new Set(['prepare_generation']),
      ),
    ).toBe('generate_image');
  });

  it('strips default_api prefixes before recovering voice', () => {
    const visualAllowed = new Set<CuratedActionName>(['prepare_generation']);
    const voiceAllowed = new Set<CuratedActionName>(['prepare_voice_clone']);

    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_image',
        visualAllowed,
      ),
    ).toBe('generate_image');
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_video',
        visualAllowed,
      ),
    ).toBe('generate_video');
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_voice',
        voiceAllowed,
      ),
    ).toBe('prepare_voice_clone');
  });

  it('recovers unknown generate-like names onto concrete generation tools', () => {
    expect(
      getGenerationPreparationRedirect(
        'default_api.image_generation',
        new Set(['prepare_generation']),
      ),
    ).toBe('generate_image');
    expect(
      getGenerationPreparationRedirect(
        'txt2video',
        new Set(['prepare_generation']),
      ),
    ).toBe('generate_video');
    expect(
      getGenerationPreparationRedirect(
        'default_api.tts_voiceover',
        new Set(['prepare_voice_clone']),
      ),
    ).toBe('prepare_voice_clone');
  });

  it('does not treat open_studio_handoff as a generate tool', () => {
    expect(
      getGenerationPreparationRedirect(
        'open_studio_handoff',
        new Set(['prepare_generation', 'open_studio_handoff']),
        { requestedGenerationType: 'image' },
      ),
    ).toBeNull();
  });

  it('does not remap unknown non-generate tools', () => {
    expect(
      getGenerationPreparationRedirect(
        'default_api.nonexistent_tool',
        new Set(['prepare_generation', 'prepare_voice_clone']),
      ),
    ).toBeNull();
  });

  it('does not admit media generation into a run without a visual tool surface', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_image',
        new Set(['get_dashboard_layout']),
      ),
    ).toBeNull();
  });

  it('does not remap content-generation tools onto the media card', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_content',
        new Set(['prepare_generation']),
      ),
    ).toBeNull();
  });

  it('remaps generate_voice to the voice-clone card when that prepare tool is allowed', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_voice',
        new Set(['prepare_voice_clone']),
      ),
    ).toBe('prepare_voice_clone');
  });

  it('leaves generate_voice alone when prepare_voice_clone is not in the run', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_voice',
        new Set(['prepare_generation']),
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
    expect(inferPrepareGenerationType('generate_as_identity')).toBe('video');
    expect(inferPrepareGenerationType('image_generation')).toBe('image');
  });

  it('does not invent a visual type for voice or content tools', () => {
    expect(
      inferPrepareGenerationType('default_api.generate_voice'),
    ).toBeUndefined();
    expect(inferPrepareGenerationType('generate_content')).toBeUndefined();
  });
});
