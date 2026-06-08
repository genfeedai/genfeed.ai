'use client';

import type { IngredientDetailProps } from '@props/content/ingredient.props';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import IngredientDetailBody from './ingredient-detail-body';
import IngredientDetailCacheAlert from './ingredient-detail-cache-alert';
import IngredientDetailNotFound from './ingredient-detail-not-found';
import { useIngredientDetail } from './use-ingredient-detail';

export default function IngredientDetail({ type, id }: IngredientDetailProps) {
  const {
    pathname,
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

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!ingredient) {
    return <IngredientDetailNotFound type={type} />;
  }

  return (
    <Container>
      {isUsingCache && (
        <IngredientDetailCacheAlert
          cachedLabel={cachedLabel}
          onRetry={findIngredient}
        />
      )}

      <Breadcrumb
        segments={[
          { href: `/ingredients/${type}`, label: type },
          {
            href: pathname,
            label: ingredient.metadataLabel || ingredient.id,
          },
        ]}
      />

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
    </Container>
  );
}
