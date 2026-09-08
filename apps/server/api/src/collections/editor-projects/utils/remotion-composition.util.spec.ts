import { buildValidatedEditorExportContract } from '@api/collections/editor-projects/utils/editor-export-contract.util';
import {
  buildProductStoryComposition,
  wrapCompositionText,
} from '@api/collections/editor-projects/utils/remotion-composition.util';
import {
  EDITOR_RENDERER_VERSION,
  type IRemotionCompositionInput,
} from '@genfeedai/contracts/interfaces';

const productStoryInput: IRemotionCompositionInput = {
  accentColor: '#123456',
  benefits: ['One clear message', 'A reusable branded video'],
  brandId: 'brand-1',
  brandName: 'Genfeed',
  callToAction: 'Make your next video',
  compositionId: 'product-story',
  format: 'portrait',
  rendererVersion: EDITOR_RENDERER_VERSION,
  requestId: 'request-1',
  title: 'Turn ideas into stories',
  version: '1',
};

describe('approved product story composition', () => {
  it.each(['portrait', 'landscape', 'square'] as const)(
    'builds a valid deterministic %s export',
    (format) => {
      const input = { ...productStoryInput, format };
      const project = {
        id: 'project-1',
        ...buildProductStoryComposition(input),
      };
      const result = buildValidatedEditorExportContract(project);
      expect(result.snapshot.totalDurationFrames).toBe(480);
      expect(result.snapshot.settings.fps).toBe(30);
      expect(result.assetManifest).toEqual([]);
      expect(buildProductStoryComposition(input)).toEqual(
        buildProductStoryComposition(input),
      );
      expect(
        project.tracks
          .flatMap((track) => track.clips)
          .every((clip) => clip.startFrame + clip.durationFrames <= 480),
      ).toBe(true);
    },
  );

  it('identifies optional source footage for canonical authorization', () => {
    const result = buildValidatedEditorExportContract({
      id: 'project-1',
      ...buildProductStoryComposition({
        ...productStoryInput,
        sourceVideoId: 'video-1',
      }),
    });
    expect(result.assetManifest).toHaveLength(1);
    expect(result.assetManifest[0]?.ingredientId).toBe('video-1');
    expect(result.snapshot.tracks[0]?.clips[0]?.volume).toBe(0);
  });

  it('keeps long words and sentences within the safe text width', () => {
    expect(
      wrapCompositionText(`A ${'x'.repeat(100)} line`, 23)
        .split('\n')
        .every((line) => line.length <= 23),
    ).toBe(true);
  });
});
