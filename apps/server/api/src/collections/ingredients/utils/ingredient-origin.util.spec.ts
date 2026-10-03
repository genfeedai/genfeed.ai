import { classifyLegacyIngredientOrigin } from '@api/collections/ingredients/utils/ingredient-origin.util';
import { IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';

describe('classifyLegacyIngredientOrigin', () => {
  it.each([
    [
      'an imported source link, even with a generation receipt',
      { bookmarkId: 'bookmark-1', modelUsed: 'flux', status: 'VALIDATED' },
      IngredientOrigin.IMPORTED,
    ],
    [
      'a generation prompt',
      { generationPrompt: 'a hero shot', status: IngredientStatus.VALIDATED },
      IngredientOrigin.GENERATED,
    ],
    [
      'a model',
      { modelUsed: 'flux', status: IngredientStatus.GENERATED },
      IngredientOrigin.GENERATED,
    ],
    [
      'a generation source, even with UPLOADED status',
      { generationSource: 'studio', status: IngredientStatus.UPLOADED },
      IngredientOrigin.GENERATED,
    ],
    [
      'UPLOADED status without a receipt',
      { status: IngredientStatus.UPLOADED },
      IngredientOrigin.UPLOADED,
    ],
    [
      'blank receipt fields and UPLOADED status',
      {
        bookmarkId: '  ',
        generationPrompt: '',
        generationSource: null,
        modelUsed: ' ',
        status: IngredientStatus.UPLOADED,
      },
      IngredientOrigin.UPLOADED,
    ],
    [
      'a validated row with no receipt and no import link',
      { status: IngredientStatus.VALIDATED },
      IngredientOrigin.UNKNOWN,
    ],
    ['an empty row', {}, IngredientOrigin.UNKNOWN],
  ])('classifies %s', (_label, input, expected) => {
    expect(classifyLegacyIngredientOrigin(input)).toBe(expected);
  });
});
