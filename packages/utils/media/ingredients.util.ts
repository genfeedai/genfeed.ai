import type { IngredientCategory } from '@genfeedai/enums';

/**
 * Ingredient endpoint configuration
 */
export const IngredientEndpoints = {
  endpoints: {
    AUDIO: 'audios',
    AVATAR: 'avatars',
    GIF: 'gifs',
    IMAGE: 'images',
    IMAGE_EDIT: 'images',
    INGREDIENT: 'ingredients',
    MUSIC: 'musics',
    SOURCE: 'sources',
    TEXT: 'texts',
    VIDEO: 'videos',
    VIDEO_EDIT: 'videos',
    VOICE: 'voices',
  },

  getEndpoint(category: keyof typeof IngredientCategory): string {
    return this.endpoints[category] || 'ingredients';
  },

  getEndpointFromTypeOrPath(typeOrPath: string): string {
    const normalized = this.normalizeUrlPath(typeOrPath);
    const upperType = typeOrPath
      .toUpperCase()
      .replace(/-/g, '_') as keyof typeof IngredientCategory;

    if (this.endpoints[upperType]) {
      return this.endpoints[upperType];
    }

    return normalized;
  },

  getPath(category: keyof typeof IngredientCategory, id?: string): string {
    const endpoint = this.getEndpoint(category);
    return id ? `/${endpoint}/${id}` : `/${endpoint}`;
  },

  normalizeUrlPath(urlPath: string): string {
    if (urlPath === 'image-to-videos') {
      return 'videos';
    }
    return urlPath;
  },
};
