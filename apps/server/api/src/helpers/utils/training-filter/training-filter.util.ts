import type { IngredientCategory } from '@genfeedai/enums';

export class TrainingFilterUtil {
  static buildSourceImagesFilter(options: {
    category: IngredientCategory;
    sourceIds: string[];
    userId?: string;
  }): Record<string, unknown> {
    return {
      category: options.category,
      id: { in: options.sourceIds },
      isDeleted: false,
      ...(options.userId ? { userId: options.userId } : {}),
    };
  }

  static buildGeneratedImagesFilter(options: {
    metadataIds: string[];
  }): Record<string, unknown> {
    return {
      category: 'IMAGE',
      isDeleted: false,
      metadataId: { in: options.metadataIds },
    };
  }
}
