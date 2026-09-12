import {
  EditorEffectType,
  EditorTrackType,
  EditorTransitionType,
  IngredientFormat,
} from '@genfeedai/contracts';
import type {
  IEditorClip,
  IEditorExportCompositionSnapshot,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import {
  buildEditorCssFilter,
  buildEditorRenderStyle,
} from '@genfeedai/utils/media/editor-render-style.util';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { EditorComposition } from './editor-composition';

function makeClip(overrides: Partial<IEditorClip> = {}): IEditorClip {
  return {
    durationFrames: 100,
    effects: [],
    id: 'clip-1',
    ingredientId: 'ingredient-1',
    ingredientUrl: 'https://cdn.example.com/videos/ingredient-1',
    sourceEndFrame: 100,
    sourceStartFrame: 0,
    startFrame: 0,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<IEditorTrack> = {}): IEditorTrack {
  return {
    clips: [],
    id: 'track-1',
    isLocked: false,
    isMuted: false,
    name: 'Track',
    type: EditorTrackType.AUDIO,
    volume: 100,
    ...overrides,
  };
}

// The renderer worker (`RemotionRendererService`) hands this component to
// Remotion's `renderMedia`, which needs a real browser page — nothing this
// spec can stand up. Mocking the primitives the same way the client-side
// preview spec does keeps the assertion on this file's own audio-mixing
// logic (which tracks get an `Audio` element, at what volume) rather than on
// Remotion's renderer.
vi.mock('remotion', () => ({
  AbsoluteFill: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'absolute-fill' }, children),
  Audio: (props: {
    src: string;
    trimAfter?: number;
    trimBefore?: number;
    volume?: number;
  }) =>
    createElement('div', {
      'data-props': JSON.stringify(props),
      'data-testid': 'audio',
    }),
  OffthreadVideo: (props: {
    src: string;
    trimAfter?: number;
    trimBefore?: number;
    volume?: number;
  }) =>
    createElement('div', {
      'data-props': JSON.stringify(props),
      'data-testid': 'video',
    }),
  Sequence: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  useCurrentFrame: () => 0,
}));

describe('editor composition styles', () => {
  it('composes overlapping slide-in and slide-out transforms', () => {
    const style = buildEditorRenderStyle(
      50,
      makeClip({
        transitionIn: { duration: 80, type: EditorTransitionType.SLIDE },
        transitionOut: { duration: 80, type: EditorTransitionType.SLIDE },
      }),
    );

    expect(style.transform).toContain('translateX(37.5%)');
    expect(style.transform).toContain('translateX(-37.5%)');
  });

  it('composes overlapping wipe edges without overwriting either side', () => {
    const style = buildEditorRenderStyle(
      50,
      makeClip({
        transitionIn: { duration: 80, type: EditorTransitionType.WIPE },
        transitionOut: { duration: 80, type: EditorTransitionType.WIPE },
      }),
    );

    expect(style.clipPath).toBe('inset(0 37.5% 0 37.5%)');
  });

  it('combines supported effects and ignores none', () => {
    expect(
      buildEditorCssFilter([
        { intensity: 50, type: EditorEffectType.BRIGHTNESS },
        { intensity: 25, type: EditorEffectType.SEPIA },
        { intensity: 100, type: EditorEffectType.NONE },
      ]),
    ).toBe('brightness(100%) sepia(25%)');
  });
});

describe('EditorComposition export audio mixing', () => {
  function makeSnapshot(
    tracks: IEditorTrack[],
  ): IEditorExportCompositionSnapshot {
    return {
      projectId: 'project-1',
      settings: {
        backgroundColor: '#000000',
        format: IngredientFormat.LANDSCAPE,
        fps: 30,
        height: 1080,
        width: 1920,
      },
      totalDurationFrames: 300,
      tracks,
      version: 1,
    };
  }

  function renderAudioProps(tracks: IEditorTrack[]): Array<{
    src: string;
    trimAfter?: number;
    trimBefore?: number;
    volume?: number;
  }> {
    const markup = renderToStaticMarkup(
      createElement(EditorComposition, { snapshot: makeSnapshot(tracks) }),
    );

    return Array.from(markup.matchAll(/data-props="([^"]*)"/g)).map(([, raw]) =>
      JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")),
    );
  }

  it('mixes every unmuted audio track into the export at its combined volume', () => {
    const audioProps = renderAudioProps([
      makeTrack({
        clips: [
          makeClip({
            id: 'music-clip',
            ingredientUrl: 'https://cdn.example.com/musics/music-1',
            sourceEndFrame: 90,
            sourceStartFrame: 10,
            volume: 50,
          }),
        ],
        id: 'music-track',
        name: 'Music',
        type: EditorTrackType.AUDIO,
        volume: 60,
      }),
    ]);

    expect(audioProps).toEqual([
      expect.objectContaining({
        src: 'https://cdn.example.com/musics/music-1',
        trimAfter: 90,
        trimBefore: 10,
        volume: 0.3,
      }),
    ]);
  });

  it('excludes a muted audio track entirely from the export', () => {
    const audioProps = renderAudioProps([
      makeTrack({
        clips: [makeClip({ id: 'muted-clip' })],
        id: 'muted-track',
        isMuted: true,
        type: EditorTrackType.AUDIO,
      }),
    ]);

    expect(audioProps).toEqual([]);
  });

  it('mixes multiple unmuted audio tracks independently, at their own volumes', () => {
    const audioProps = renderAudioProps([
      makeTrack({
        clips: [makeClip({ id: 'voiceover-clip', volume: 100 })],
        id: 'voiceover-track',
        name: 'Voiceover',
        type: EditorTrackType.AUDIO,
        volume: 100,
      }),
      makeTrack({
        clips: [makeClip({ id: 'music-bed-clip', volume: 40 })],
        id: 'music-bed-track',
        name: 'Music bed',
        type: EditorTrackType.AUDIO,
        volume: 25,
      }),
    ]);

    expect(audioProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ volume: 1 }),
        expect.objectContaining({ volume: 0.1 }),
      ]),
    );
    expect(audioProps).toHaveLength(2);
  });
});
