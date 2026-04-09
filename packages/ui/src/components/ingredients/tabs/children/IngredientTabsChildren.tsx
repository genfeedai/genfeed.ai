'use client';

import { TransformationCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ExtendedIngredientTabsChildrenProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
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
  // const [isSearching, setIsSearching] = useState(false);
  // const [searchResults, setSearchResults] = useState<IIngredient[]>([]);
  // const [searchQuery, setSearchQuery] = useState('');

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

  // const handleSearch = async () => {
  //   if (!searchQuery.trim()) return;

  //   setIsSearching(true);
  //   try {
  //     const service = await getIngredientsService();
  //     const results = await service.findAll({
  //       search: searchQuery,
  //       limit: ITEMS_PER_PAGE,
  //       // Exclude already linked children
  //       exclude: children.map((c) => c.id),
  //     });

  //     setSearchResults(results);
  //     setIsSearching(false);
  //   } catch (error) {
  //     logger.error('Search failed', error);
  //     setIsSearching(false);
  //   }
  // };

  // const handleAddChild = async (child: IIngredient) => {
  //   try {
  //     const service = await getIngredientsService();
  //     // Update the child to add this ingredient as parent
  //     await service.patch(child.id, {
  //       parent: ingredient.id,
  //     });

  //     // Add to local state
  //     setChildren((prev) => [...prev, child]);
  //     setSearchResults((prev) => prev.filter((r) => r.id !== child.id));

  //     onAddChild?.(child);
  //     logger.info('Child added', { childId: child.id });
  //   } catch (error) {
  //     logger.error('Failed to add child', error);
  //   }
  // };

  // const handleRemoveChild = async (childId: string) => {
  //   try {
  //     const service = await getIngredientsService();
  //     const child = children.find((c) => c.id === childId);

  //     if (child) {
  //       // Update the child to remove this ingredient as parent
  //       await service.patch(childId, {
  //         parent: null,
  //       });

  //       // Remove from local state
  //       setChildren((prev) => prev.filter((c) => c.id !== childId));

  //       onRemoveChild?.(childId);
  //       logger.info('Child removed', { childId });
  //     }
  //   } catch (error) {
  //     logger.error('Failed to remove child', error);
  //   }
  // };

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  // Separate captioned and other children
  const captionedChildren = children.filter((child) =>
    child.transformations?.includes(TransformationCategory.CAPTIONED),
  );

  // const otherChildren = children.filter(
  //   (child) =>
  //     !child.transformations?.includes(TransformationCategory.CAPTIONED),
  // );

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

          {/* TO DO NOT WORKING PROPERLY */}
          {/* {otherChildren.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">
                Other Versions ({otherChildren.length})
              </h3>

              <LazyMasonryGrid
                ingredients={otherChildren}
                selectedIngredientId={[]}
                isActionsEnabled={true}
                onClickIngredient={onViewChild}
              />
            </div>
          )} */}
        </>
      )}

      {/* <Card className="p-4">
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Add Child Assets</h3>

          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for assets to link..."
              className="flex-1 h-10 border border-white/[0.08] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />

            <Button
              label={<HiMagnifyingGlass className="text-xl" />}
              onClick={handleSearch}
              isLoading={isSearching}
              variant="default"
              tooltip="Search"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Search Results</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="relative group cursor-pointer"
                    onClick={() => handleAddChild(result)}
                  >
                    <Image
                      src={result.thumbnailUrl }
                      alt={result.metadataLabel }
                      className="w-full h-24 object-cover"
                      width={100}
                      height={100}
                    />

                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                      <HiPlus className="text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs mt-1 truncate">
                      {result.metadataLabel }
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card> */}

      {/* <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Child Assets ({children.length})
          </h3>
          {children.length > 0 && (
            <Button
              label="Refresh"
              onClick={loadChildren}
              variant="ghost"
              size="sm"
            />
          )}
        </div>

        {children.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No child assets linked</p>
            <p className="text-sm text-muted-foreground mt-2">
              Use the search above to find and link related assets
            </p>
          </Card>
        ) : (
          <LazyMasonryGrid
            ingredients={children}
            selectedIngredientId={[]}
            isActionsEnabled={true}
            onDeleteIngredient={(child) => handleRemoveChild(child.id)}
            onClickIngredient={onViewChild}
            layoutType={ViewMode.GRID}
          />
        )}
      </div> */}
    </div>
  );
}
