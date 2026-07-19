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
});
