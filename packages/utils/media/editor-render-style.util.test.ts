import { EditorEffectType, EditorTransitionType } from '@genfeedai/contracts';
import type { IEditorClip } from '@genfeedai/contracts/interfaces';
import {
  buildEditorCssFilter,
  buildEditorRenderStyle,
  EDITOR_STILL_PUSH_IN,
  editorStillScale,
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

describe('editor render styles', () => {
  it('uses one effect mapping for preview and export', () => {
    expect(
      buildEditorCssFilter([
        { intensity: 50, type: EditorEffectType.BRIGHTNESS },
        { intensity: 25, type: EditorEffectType.SEPIA },
      ]),
    ).toBe('brightness(100%) sepia(25%)');
  });

  it('composes overlapping entry and exit transitions at the same frame', () => {
    expect(
      buildEditorRenderStyle(
        50,
        makeClip({
          transitionIn: { duration: 80, type: EditorTransitionType.SLIDE },
          transitionOut: { duration: 80, type: EditorTransitionType.WIPE },
        }),
      ),
    ).toMatchObject({
      clipPath: 'inset(0 0% 0 37.5%)',
      transform: 'translateX(37.5%)',
    });
  });

  it('pushes a still in from full frame to its last frame', () => {
    expect(editorStillScale(0, 90)).toBe(1);
    expect(editorStillScale(89, 90)).toBeCloseTo(1 + EDITOR_STILL_PUSH_IN);
    expect(editorStillScale(0, 1)).toBe(1);
  });
});
