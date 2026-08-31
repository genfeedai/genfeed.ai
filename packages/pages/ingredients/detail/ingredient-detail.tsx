'use client';

import type { IngredientDetailProps } from '@props/content/ingredient.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import Container from '@ui/layout/container/Container';
import IngredientDetailBody from './ingredient-detail-body';
import IngredientDetailCacheAlert from './ingredient-detail-cache-alert';
import IngredientDetailNotFound from './ingredient-detail-not-found';
import { useIngredientDetail } from './use-ingredient-detail';

export default function IngredientDetail({ type, id }: IngredientDetailProps) {
  const {
    credentials,
    isLoading,
    ingredient,
    childIngredients,
    cachedLabel,
    isUsingCache,
    isTrimModalOpen,
    isUpdating,
    handlers,
    loadingStates,
    findIngredient,
    handleShareVideo,
    handleTrimVideo,
    handleTrimConfirm,
    handleTrimClose,
    handleUpdateSharing,
    handleUpdateMetadata,
  } = useIngredientDetail({ type, id });

  if (!isLoading && !ingredient) {
    return <IngredientDetailNotFound type={type} />;
  }

  return (
    <Container>
      {isUsingCache && ingredient && (
        <IngredientDetailCacheAlert
          cachedLabel={cachedLabel}
          onRetry={findIngredient}
        />
      )}

      {ingredient ? (
        <IngredientDetailBody
          ingredient={ingredient}
          childIngredients={childIngredients}
          credentials={credentials}
          isTrimModalOpen={isTrimModalOpen}
          isUpdating={isUpdating}
          handlers={handlers}
          loadingStates={loadingStates}
          onShareVideo={handleShareVideo}
          onTrimVideo={handleTrimVideo}
          onUpdateSharing={handleUpdateSharing}
          onUpdateMetadata={handleUpdateMetadata}
          onTrimConfirm={handleTrimConfirm}
          onTrimClose={handleTrimClose}
        />
      ) : (
        <div
          className="flex min-h-[60vh] items-center justify-center"
          data-testid="ingredient-detail-skeleton"
        >
          <Spinner ariaLabel="Loading ingredient" />
        </div>
      )}
    </Container>
  );
}
