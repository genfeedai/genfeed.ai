'use client';

import { TransformationCategory } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IIngredient } from '@genfeedai/interfaces';
import type { ExtendedIngredientTabsChildrenProps } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import Card from '@ui/card/Card';
import { LazyMasonryGrid } from '@ui/lazy/masonry/LazyMasonry';
import Loading from '@ui/loading/default/Loading';
import { useEffect, useState } from 'react';

export default function IngredientTabsChildren({
  ingredient,
  onViewChild,
}: ExtendedIngredientTabsChildrenProps) {
  const [children, setChildren] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );

  useEffect(() => {
    const findAllChildren = async () => {
      setIsLoading(true);

      try {
        const service = await getIngredientsService();
        // Fetch ingredients that have this ingredient as parent
        const data = await service.findChildren(ingredient.id);

        setChildren(data);
        logger.info('Children fetched', data);
        setIsLoading(false);
      } catch (error) {
        logger.error('Failed to fetch children', error);
        setIsLoading(false);
      }
    };

    findAllChildren();
  }, [ingredient.id, getIngredientsService]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  // Separate captioned and other children
  const captionedChildren = children.filter((child) =>
    child.transformations?.includes(TransformationCategory.CAPTIONED),
  );

  return (
    <div className="space-y-6">
      {children.length === 0 ? (
        <div className="text-center py-8 text-foreground/60">
          <p>No child assets found</p>
        </div>
      ) : (
        <>
          {captionedChildren.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <span>📝</span> Captioned Versions ({captionedChildren.length})
              </h3>
              <Card className="p-4">
                <div className="text-sm text-foreground/70 mb-3">
                  These versions include captions and can be used for social
                  media platforms.
                </div>

                <LazyMasonryGrid
                  ingredients={captionedChildren}
                  selectedIngredientId={[]}
                  isActionsEnabled={true}
                  onClickIngredient={onViewChild}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
