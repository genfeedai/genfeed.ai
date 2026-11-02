'use client';
import { TransformationCategory } from '@genfeedai/contracts';
import { useAuthedQuery } from '@genfeedai/hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { EmptyState } from '@ui/primitives/empty-state';
import IngredientsMediaGrid from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import type { ExtendedIngredientTabsChildrenProps } from '@/props/content/ingredient.props';

export default function IngredientTabsChildren({
  ingredient,
  onViewChild,
}: ExtendedIngredientTabsChildrenProps) {
  // Cached per ingredient: coming back to its children paints them at once
  // while they refresh.
  const { data: children = [], isPending } = useAuthedQuery({
    queryFn: async (service) => {
      try {
        const data = await service.findChildren(ingredient.id);
        logger.info('Children fetched', data);
        return data;
      } catch (error) {
        logger.error('Failed to fetch children', error);
        throw error;
      }
    },
    queryKey: ['ingredient-children', ingredient.id],
    service: (token: string) => IngredientsService.getInstance(token),
  });

  if (isPending) {
    return <SkeletonCard label="Loading child assets" showActions={false} />;
  }

  // Separate captioned and other children
  const captionedChildren = children.filter((child) =>
    child.transformations?.includes(TransformationCategory.CAPTIONED),
  );

  return (
    <div className="space-y-6">
      {children.length === 0 ? (
        <EmptyState title="No child assets found" />
      ) : (
        captionedChildren.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <span>📝</span> Captioned Versions ({captionedChildren.length})
            </h3>
            <Card>
              <div className="text-sm text-foreground/70 mb-3">
                These versions include captions and can be used for social media
                platforms.
              </div>

              <IngredientsMediaGrid
                isActionsEnabled={false}
                isLoading={false}
                isTimeGroupingEnabled={false}
                items={captionedChildren}
                onClickIngredient={onViewChild}
              />
            </Card>
          </div>
        )
      )}
    </div>
  );
}
