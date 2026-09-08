import {
  EditorTrackType,
  EditorTransitionType,
  IngredientFormat,
} from '@genfeedai/contracts';
import type {
  IEditorClip,
  IRemotionCompositionInput,
  IRemotionCompositionProject,
} from '@genfeedai/contracts/interfaces';

export function buildProductStoryComposition(
  input: IRemotionCompositionInput,
): IRemotionCompositionProject {
  const dimensions = {
    landscape: [1920, 1080],
    portrait: [1080, 1920],
    square: [1080, 1080],
  } as const;
  const [width, height] = dimensions[input.format];
  const fps = 30;
  const sceneFrames = 4 * fps;
  const scenes = [input.title, ...input.benefits, input.callToAction];
  const totalDurationFrames = scenes.length * sceneFrames;
  const makeClip = (
    id: string,
    text: string,
    startFrame: number,
    durationFrames: number,
    y: number,
    fontSize: number,
  ): IEditorClip => ({
    durationFrames,
    effects: [],
    id,
    ingredientId: '',
    ingredientUrl: '',
    sourceEndFrame: durationFrames,
    sourceStartFrame: 0,
    startFrame,
    textOverlay: {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize,
      fontWeight: 700,
      position: { x: 50, y },
      text: wrapCompositionText(text, input.format === 'landscape' ? 34 : 23),
    },
    transitionIn: { duration: 12, type: EditorTransitionType.FADE },
    transitionOut: { duration: 12, type: EditorTransitionType.FADE },
  });
  const tracks = [
    {
      clips: scenes.map((text, index) =>
        makeClip(
          `scene-${index}`,
          text,
          index * sceneFrames,
          sceneFrames,
          50,
          input.format === 'landscape' ? 76 : 62,
        ),
      ),
      id: 'story',
      isLocked: false,
      isMuted: false,
      name: 'Story',
      type: EditorTrackType.TEXT,
      volume: 100,
    },
    {
      clips: [
        makeClip(
          'brand-label',
          input.brandName,
          0,
          totalDurationFrames,
          15,
          40,
        ),
      ],
      id: 'brand',
      isLocked: false,
      isMuted: false,
      name: 'Brand',
      type: EditorTrackType.TEXT,
      volume: 100,
    },
  ];
  if (input.sourceVideoId) {
    tracks.unshift({
      clips: [
        {
          durationFrames: totalDurationFrames,
          effects: [],
          id: 'source-video',
          ingredientId: input.sourceVideoId,
          ingredientUrl: `https://assets.invalid/videos/${input.sourceVideoId}`,
          sourceEndFrame: totalDurationFrames,
          sourceStartFrame: 0,
          startFrame: 0,
          volume: 0,
        },
      ],
      id: 'video',
      isLocked: false,
      isMuted: false,
      name: 'Product footage',
      type: EditorTrackType.VIDEO,
      volume: 0,
    });
  }
  return {
    settings: {
      backgroundColor: input.accentColor,
      format: input.format as IngredientFormat,
      fps,
      height,
      width,
    },
    totalDurationFrames,
    tracks,
  };
}

export function wrapCompositionText(text: string, width: number): string {
  const words = text
    .trim()
    .split(/\s+/)
    .flatMap((word) => word.match(new RegExp(`.{1,${width}}`, 'gu')) ?? []);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
}
