// @ts-nocheck
import { GENERATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/generation-templates';
import { MusicSourceType } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('GenerationTemplates', () => {
  it('registers the X landscape avatar workflow starter', () => {
    const template =
      GENERATION_WORKFLOW_TEMPLATES['avatar-ugc-x-landscape-heygen'];

    expect(template).toBeDefined();
    expect(template.id).toBe('avatar-ugc-x-landscape-heygen');
    expect(template.name).toBe('Avatar UGC for X (HeyGen)');
  });

  it('keeps the same four runtime inputs as the portrait avatar workflow', () => {
    const template =
      GENERATION_WORKFLOW_TEMPLATES['avatar-ugc-x-landscape-heygen'];

    expect(template.inputVariables?.map((variable) => variable.key)).toEqual([
      'script',
      'photoUrl',
      'clonedVoiceId',
      'audioUrl',
    ]);
  });

  it('builds the expected node graph for avatar, captions, music, and output', () => {
    const template =
      GENERATION_WORKFLOW_TEMPLATES['avatar-ugc-x-landscape-heygen'];
    const avatarNode = template.nodes?.find(
      (node) => node.id === 'ai-avatar-video',
    );
    const captionsNode = template.nodes?.find(
      (node) => node.id === 'effect-captions',
    );
    const musicNode = template.nodes?.find(
      (node) => node.id === 'music-source',
    );
    const soundOverlayNode = template.nodes?.find(
      (node) => node.id === 'sound-overlay',
    );

    expect(avatarNode?.data.config.aspectRatio).toBe('16:9');
    expect(captionsNode?.data.config).toMatchObject({
      fontColor: '#FFFFFF',
      fontSize: 'large',
      position: 'bottom',
      style: 'dynamic',
    });
    expect(musicNode?.data.config.sourceType).toBe(MusicSourceType.LIBRARY);
    expect(soundOverlayNode?.data.config).toMatchObject({
      audioVolume: 30,
      mixMode: 'background',
      videoVolume: 100,
    });

    expect(template.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'ai-avatar-video',
          target: 'effect-captions',
          targetHandle: 'video',
        }),
        expect.objectContaining({
          source: 'effect-captions',
          target: 'sound-overlay',
          targetHandle: 'videoUrl',
        }),
        expect.objectContaining({
          source: 'music-source',
          target: 'sound-overlay',
          targetHandle: 'soundUrl',
        }),
        expect.objectContaining({
          source: 'sound-overlay',
          target: 'workflow-output-video',
        }),
      ]),
    );
  });

  it('registers the virtual staging rescue starter', () => {
    const template = GENERATION_WORKFLOW_TEMPLATES['virtual-staging-rescue'];

    expect(template).toBeDefined();
    expect(template.category).toBe('real-estate');
    expect(template.inputVariables?.map((variable) => variable.key)).toEqual([
      'sourcePhoto',
      'roomType',
      'stylePreset',
      'listingTier',
    ]);
    expect(
      template.nodes?.filter((node) => node.type === 'imageGen'),
    ).toHaveLength(2);
  });

  it('registers the floor plan interior preview starter', () => {
    const template =
      GENERATION_WORKFLOW_TEMPLATES['floor-plan-interior-preview'];

    expect(template).toBeDefined();
    expect(template.category).toBe('real-estate');
    expect(template.inputVariables?.map((variable) => variable.key)).toEqual([
      'floorPlanImage',
      'propertyType',
      'targetSpace',
      'stylePreset',
    ]);
    expect(
      template.nodes?.filter((node) => node.type === 'imageGen'),
    ).toHaveLength(3);
    expect(template.description).toContain('layout-faithful');
  });
});
