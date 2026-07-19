import { EditorEffectType, EditorTransitionType } from '@genfeedai/enums';
import type { IEditorClip } from '@genfeedai/interfaces';
import {
  buildEditorCssFilter,
  buildEditorRenderStyle,
} from '@genfeedai/utils/media/editor-render-style.util';

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
