import { IngredientCategory } from '@genfeedai/enums';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { GIFsService } from '@genfeedai/services/ingredients/gifs.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { MusicsService } from '@genfeedai/services/ingredients/musics.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

export function useIngredientServices() {
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getGifsService = useAuthedService((token: string) =>
    GIFsService.getInstance(token),
  );

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  // Get service based on ingredient type
  const getServiceByCategory = async (category: IngredientCategory) => {
    switch (category) {
      case IngredientCategory.IMAGE:
        return getImagesService();
      case IngredientCategory.VIDEO:
        return getVideosService();
      case IngredientCategory.GIF:
        return getGifsService();
      case IngredientCategory.MUSIC:
        return getMusicsService();
      default:
        // Don't fall back to generic ingredients service - it doesn't have a /v1/ingredients/{id} endpoint
        throw new Error(
          `No service available for category: ${category}. Use category-specific endpoints.`,
        );
    }
  };

  return {
    getGifsService,
    getImagesService,
    getIngredientsService,
    getMusicsService,
    getServiceByCategory,
    getVideosService,
  };
}
