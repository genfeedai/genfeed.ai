import {
  EditorEffectType,
  EditorTrackType,
  IngredientFormat,
} from '@genfeedai/enums';
import {
  EDITOR_EXPORT_CONTRACT_VERSION,
  type IEditorTrack,
} from '@genfeedai/interfaces';
import {
  buildValidatedEditorExportContract,
  EditorExportContractValidationError,
} from './editor-export-contract.util';

const mediaClip = (
  id: string,
  ingredientId: string,
  ingredientUrl: string,
) => ({
  durationFrames: 120,
  effects: [{ intensity: 50, type: EditorEffectType.BRIGHTNESS }],
  id,
  ingredientId,
  ingredientUrl,
  sourceEndFrame: 150,
  sourceStartFrame: 30,
  startFrame: 0,
  volume: 100,
});

const tracks: IEditorTrack[] = [
  {
    clips: [
      mediaClip('video-1', 'video-ingredient', 'https://cdn.test/video.mp4'),
      {
        ...mediaClip(
          'video-2',
          'b-roll-ingredient',
          'https://cdn.test/b-roll.mp4',
        ),
        durationFrames: 60,
        sourceEndFrame: 60,
        sourceStartFrame: 0,
        startFrame: 120,
      },
    ],
    id: 'video-track',
    isLocked: false,
    isMuted: false,
    name: 'Video',
    type: EditorTrackType.VIDEO,
    volume: 100,
  },
  {
    clips: [
      {
        durationFrames: 90,
        effects: [],
        id: 'text-1',
        ingredientId: '',
        ingredientUrl: '',
        sourceEndFrame: 90,
        sourceStartFrame: 0,
        startFrame: 30,
        textOverlay: {
          color: '#ffffff',
          fontSize: 42,
          position: { x: 50, y: 80 },
          text: 'Launch story',
        },
      },
    ],
    id: 'text-track',
    isLocked: false,
    isMuted: false,
    name: 'Text',
    type: EditorTrackType.TEXT,
    volume: 100,
  },
  {
    clips: [
      mediaClip('audio-1', 'audio-ingredient', 'https://cdn.test/audio.mp3'),
    ],
    id: 'audio-track',
    isLocked: false,
    isMuted: false,
    name: 'Audio',
    type: EditorTrackType.AUDIO,
    volume: 0,
  },
];

const project = {
  id: 'project-1',
  settings: {
    backgroundColor: '#000000',
    format: IngredientFormat.PORTRAIT,
    fps: 30,
    height: 1920,
    width: 1080,
  },
  totalDurationFrames: 180,
  tracks,
};

describe('buildValidatedEditorExportContract', () => {
  it('builds a deterministic versioned snapshot and ordered asset manifest', () => {
    const first = buildValidatedEditorExportContract(project);
    const second = buildValidatedEditorExportContract(project);

    expect(first).toEqual(second);
    expect(first.snapshot.version).toBe(EDITOR_EXPORT_CONTRACT_VERSION);
    expect(first.snapshot.tracks).not.toBe(project.tracks);
    expect(first.assetManifest).toEqual([
      {
        clipId: 'video-1',
        ingredientId: 'video-ingredient',
        ingredientUrl: 'https://cdn.test/video.mp4',
        trackId: 'video-track',
        type: EditorTrackType.VIDEO,
      },
      {
        clipId: 'video-2',
        ingredientId: 'b-roll-ingredient',
        ingredientUrl: 'https://cdn.test/b-roll.mp4',
        trackId: 'video-track',
        type: EditorTrackType.VIDEO,
      },
      {
        clipId: 'audio-1',
        ingredientId: 'audio-ingredient',
        ingredientUrl: 'https://cdn.test/audio.mp3',
        trackId: 'audio-track',
        type: EditorTrackType.AUDIO,
      },
    ]);
  });

  it('accepts percentage boundary values', () => {
    const boundaryTracks = structuredClone(tracks);
    boundaryTracks[0].clips[0].volume = 0;
    boundaryTracks[0].volume = 100;
    const boundaryTextOverlay = boundaryTracks[1].clips[0].textOverlay;
    if (!boundaryTextOverlay) {
      throw new Error('Expected text overlay fixture');
    }
    boundaryTextOverlay.position = { x: 0, y: 100 };

    expect(
      buildValidatedEditorExportContract({
        ...project,
        tracks: boundaryTracks,
      }).snapshot.tracks,
    ).toHaveLength(3);
  });

  it('reports actionable paths for malformed settings, timing, and assets', () => {
    const invalidTracks = structuredClone(tracks);
    invalidTracks[0].clips[0].ingredientId = '';
    invalidTracks[0].clips[0].durationFrames = 181;

    expect.assertions(2);
    try {
      buildValidatedEditorExportContract({
        ...project,
        settings: { ...project.settings, width: 0 },
        tracks: invalidTracks,
      });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(EditorExportContractValidationError);
      expect((error as EditorExportContractValidationError).violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'settings.width' }),
          expect.objectContaining({
            path: 'tracks[0].clips[0].durationFrames',
          }),
          expect.objectContaining({
            path: 'tracks[0].clips[0].ingredientId',
          }),
        ]),
      );
    }
  });

  it('rejects duplicate ids, unsupported effects, and invalid text overlays', () => {
    const invalidTracks = structuredClone(tracks);
    invalidTracks[1].id = invalidTracks[0].id;
    invalidTracks[1].clips[0].id = invalidTracks[0].clips[0].id;
    invalidTracks[0].clips[0].effects = [
      { intensity: 50, type: 'unsupported' as EditorEffectType },
    ];
    const invalidTextOverlay = invalidTracks[1].clips[0].textOverlay;
    if (!invalidTextOverlay) {
      throw new Error('Expected text overlay fixture');
    }
    invalidTextOverlay.position.x = 101;

    expect(() =>
      buildValidatedEditorExportContract({
        ...project,
        tracks: invalidTracks,
      }),
    ).toThrow(EditorExportContractValidationError);

    try {
      buildValidatedEditorExportContract({
        ...project,
        tracks: invalidTracks,
      });
    } catch (error: unknown) {
      const codes = (
        error as EditorExportContractValidationError
      ).violations.map((violation) => violation.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'editor_export_track_id_duplicate',
          'editor_export_clip_id_duplicate',
          'editor_export_effect_invalid',
          'editor_export_text_position_x_invalid',
        ]),
      );
    }
  });
});
