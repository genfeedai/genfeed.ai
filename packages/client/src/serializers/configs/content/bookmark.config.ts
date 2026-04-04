import { bookmarkAttributes } from '../../attributes/content/bookmark.attributes';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';
import { rel } from '../../builders';
import { FOLDER_REL, TAG_REL } from '../../relationships';

export const bookmarkSerializerConfig = {
  attributes: bookmarkAttributes,
  extractedIngredients: rel('ingredient', ingredientAttributes),
  folder: FOLDER_REL,
  generatedIngredients: rel('ingredient', ingredientAttributes),
  tags: TAG_REL,
  type: 'bookmark',
};
