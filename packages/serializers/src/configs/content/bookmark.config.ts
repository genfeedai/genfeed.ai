import { bookmarkAttributes } from '@serializers/attributes/content/bookmark.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { rel } from '@serializers/builders';
import { FOLDER_REL, TAG_REL } from '@serializers/relationships';

export const bookmarkSerializerConfig = {
  attributes: bookmarkAttributes,
  extractedIngredients: rel('ingredient', ingredientAttributes),
  folder: FOLDER_REL,
  generatedIngredients: rel('ingredient', ingredientAttributes),
  tags: TAG_REL,
  type: 'bookmark',
};
