import type { CuratedActionName } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  getGenerationPreparationRedirect,
  inferPrepareGenerationType,
  isIdentityGenerationToolName,
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

describe('isIdentityGenerationToolName', () => {
  it('recognizes generate_as_identity, including vendor prefixes', () => {
    expect(isIdentityGenerationToolName('generate_as_identity')).toBe(true);
    expect(
      isIdentityGenerationToolName('default_api.generate_as_identity'),
    ).toBe(true);
  });

  it('does not treat ordinary image or video generation as identity', () => {
    expect(isIdentityGenerationToolName('generate_image')).toBe(false);
    expect(isIdentityGenerationToolName('generate_video')).toBe(false);
  });
});

const IMAGE = { mediaType: 'image', toolName: 'generate' } as const;
const VIDEO = { mediaType: 'video', toolName: 'generate' } as const;
const VOICE_CLONE = { toolName: 'prepare_voice_clone' } as const;

describe('getGenerationPreparationRedirect', () => {
  it('remaps prepare_generation to generate with the composer-selected type', () => {
    const allowed = new Set<CuratedActionName>(['prepare_generation']);

    expect(
      getGenerationPreparationRedirect('prepare_generation', allowed, {
        generationMode: 'image',
      }),
    ).toEqual(IMAGE);
    expect(
      getGenerationPreparationRedirect('prepare_generation', allowed, {
        requestedGenerationType: 'video',
      }),
    ).toEqual(VIDEO);
  });

  it('admits generate when only prepare_generation was exposed', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_image',
        new Set(['prepare_generation']),
      ),
    ).toEqual(IMAGE);
  });

  it('redirects a legacy per-kind visual name even when generate is allowed', () => {
    expect(
      getGenerationPreparationRedirect('generate_video', new Set(['generate'])),
    ).toEqual(VIDEO);
  });

  it('strips default_api prefixes before recovering voice', () => {
    const visualAllowed = new Set<CuratedActionName>(['prepare_generation']);
    const voiceAllowed = new Set<CuratedActionName>(['prepare_voice_clone']);

    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_image',
        visualAllowed,
      ),
    ).toEqual(IMAGE);
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_video',
        visualAllowed,
      ),
    ).toEqual(VIDEO);
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_voice',
        voiceAllowed,
      ),
    ).toEqual(VOICE_CLONE);
  });

  it('recovers unknown generate-like names onto generate', () => {
    expect(
      getGenerationPreparationRedirect(
        'default_api.image_generation',
        new Set(['prepare_generation']),
      ),
    ).toEqual(IMAGE);
    expect(
      getGenerationPreparationRedirect(
        'txt2video',
        new Set(['prepare_generation']),
      ),
    ).toEqual(VIDEO);
    expect(
      getGenerationPreparationRedirect(
        'default_api.tts_voiceover',
        new Set(['prepare_voice_clone']),
      ),
    ).toEqual(VOICE_CLONE);
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

  it('remaps legacy generate_voice to the voice-clone card when that prepare tool is allowed', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_voice',
        new Set(['prepare_voice_clone']),
      ),
    ).toEqual(VOICE_CLONE);
  });

  it('leaves legacy generate_voice alone when neither prepare_voice_clone nor generate is in the run', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_voice',
        new Set(['prepare_generation']),
      ),
    ).toBeNull();
  });

  it('recovers legacy generate_voice onto generate with type voice when generate is allowed', () => {
    expect(
      getGenerationPreparationRedirect('generate_voice', new Set(['generate'])),
    ).toEqual({ mediaType: 'voice', toolName: 'generate' });
  });

  it('recovers legacy generate_music onto generate with type music', () => {
    expect(
      getGenerationPreparationRedirect('generate_music', new Set(['generate'])),
    ).toEqual({ mediaType: 'music', toolName: 'generate' });
    expect(
      getGenerationPreparationRedirect(
        'default_api.generate_music',
        new Set(['generate', 'prepare_voice_clone']),
      ),
    ).toEqual({ mediaType: 'music', toolName: 'generate' });
  });

  it('does not recover generate_music when generate is not allowed', () => {
    expect(
      getGenerationPreparationRedirect(
        'generate_music',
        new Set(['prepare_generation']),
      ),
    ).toBeNull();
  });

  describe('canonical generate', () => {
    const allowed = new Set<CuratedActionName>(['generate']);

    it('leaves a visual call alone when it matches the composer mode', () => {
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          generationMode: 'video',
          requestedMediaType: 'video',
        }),
      ).toBeNull();
    });

    it('leaves a visual call alone when no explicit composer mode is set', () => {
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          requestedMediaType: 'image',
        }),
      ).toBeNull();
    });

    it('overrides the model type with an explicit composer mode', () => {
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          generationMode: 'image',
          requestedMediaType: 'video',
        }),
      ).toEqual(IMAGE);
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          generationMode: 'video',
          requestedMediaType: 'image',
        }),
      ).toEqual(VIDEO);
    });

    it('admits generate when only prepare_generation is exposed', () => {
      expect(
        getGenerationPreparationRedirect(
          'generate',
          new Set(['prepare_generation']),
          { requestedMediaType: 'video' },
        ),
      ).toEqual(VIDEO);
    });

    it('routes type voice to the voice-clone card when allowed', () => {
      expect(
        getGenerationPreparationRedirect(
          'generate',
          new Set(['generate', 'prepare_voice_clone']),
          { requestedMediaType: 'voice' },
        ),
      ).toEqual(VOICE_CLONE);
    });

    it('leaves voice and music alone when no voice-clone card applies', () => {
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          requestedMediaType: 'voice',
        }),
      ).toBeNull();
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          requestedMediaType: 'music',
        }),
      ).toBeNull();
    });

    it('ignores an invalid or missing type', () => {
      expect(
        getGenerationPreparationRedirect('generate', allowed, {
          generationMode: 'image',
          requestedMediaType: 'hologram',
        }),
      ).toBeNull();
      expect(getGenerationPreparationRedirect('generate', allowed)).toBeNull();
    });

    it('normalizes vendor prefixes on the canonical name', () => {
      expect(
        getGenerationPreparationRedirect('default_api.generate', allowed, {
          generationMode: 'image',
          requestedMediaType: 'video',
        }),
      ).toEqual(IMAGE);
    });
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
