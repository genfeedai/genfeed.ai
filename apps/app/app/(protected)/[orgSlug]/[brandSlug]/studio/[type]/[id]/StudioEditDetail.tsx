'use client';

import {
  ButtonVariant,
  type ImageFormat,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IStudioEditDetailContentProps } from '@genfeedai/interfaces/content/studio-edit-detail.interface';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HiCheck, HiClock } from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import StudioEditDetailAssetPreview from './StudioEditDetailAssetPreview';
import StudioEditDetailHeader from './StudioEditDetailHeader';
import StudioEditDetailVersionHistory from './StudioEditDetailVersionHistory';
import { useStudioEditDetail } from './useStudioEditDetail';

const CATEGORY_LABELS: Partial<Record<IngredientCategory, string>> = {
  [IngredientCategory.VIDEO]: 'Video',
  [IngredientCategory.IMAGE]: 'Image',
  [IngredientCategory.MUSIC]: 'Music',
  [IngredientCategory.AVATAR]: 'Avatar',
  [IngredientCategory.VOICE]: 'Voice',
};

interface StatusBadgeConfig {
  bgClass: string;
  textClass: string;
  icon?: React.ReactNode;
  label: string;
}

const STATUS_BADGE_CONFIG: Partial<
  Record<IngredientStatus, StatusBadgeConfig>
> = {
  [IngredientStatus.VALIDATED]: {
    bgClass: 'bg-success/20',
    icon: <HiCheck className="size-3.5" />,
    label: 'Validated',
    textClass: 'text-success',
  },
  [IngredientStatus.PROCESSING]: {
    bgClass: 'bg-warning/20',
    icon: <HiClock className="size-3.5" />,
    label: 'Processing',
    textClass: 'text-warning',
  },
};

function renderStatusBadge(status: IngredientStatus): ReactNode {
  const config = STATUS_BADGE_CONFIG[status];
  if (config) {
    return (
      <span
        className={`inline-flex items-center gap-2 px-2 py-1 ${config.bgClass} ${config.textClass} rounded-full text-xs font-medium`}
      >
        {config.icon}
        {config.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 bg-muted/50 text-foreground/60 rounded-full text-xs font-medium">
      Non-validated
    </span>
  );
}

export default function StudioEditDetail({
  ingredientId,
}: IStudioEditDetailContentProps) {
  const {
    categoryType,
    currentModels,
    editForm,
    handleEditSubmit,
    handleResultClick,
    handleRetry,
    isLoading,
    isProcessing,
    loadError,
    processingAssets,
    results,
    selectedIngredient,
    studioHref,
    videoRef,
  } = useStudioEditDetail({ ingredientId });

  if (loadError && !isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8 bg-background shadow-lg">
          <h2 className="text-2xl font-semibold text-error mb-4">
            Error Loading Ingredient
          </h2>
          <p className="text-foreground/70 mb-6">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <Button
              label="Try Again"
              onClick={handleRetry}
              variant={ButtonVariant.DEFAULT}
            />
            <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
              <Link href={studioHref}>Go to Generate</Link>
            </PrimitiveButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <StudioEditDetailHeader
        categoryLabel={CATEGORY_LABELS[categoryType] ?? 'Media'}
        selectedIngredient={selectedIngredient}
        backHref={studioHref}
      />

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loading isFullSize={false} />
          </div>
        ) : selectedIngredient ? (
          <div className="flex flex-col lg:flex-row h-full">
            <div className="w-full lg:w-1/3 flex flex-col lg:border-r border-b lg:border-b-0 border-white/[0.08]">
              <div className="flex-1 overflow-y-auto p-6">
                <Card className="mb-4 bg-card">
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-foreground/60">Name</span>
                      <p className="font-medium mt-1">
                        {selectedIngredient.metadataLabel || 'Untitled'}
                      </p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Created</span>
                      <p className="font-medium mt-1">
                        <ClientFormattedDate
                          format="date"
                          locales="en-US"
                          options={{
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }}
                          value={selectedIngredient.createdAt}
                        />
                      </p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Status</span>
                      <div className="mt-1">
                        {renderStatusBadge(selectedIngredient.status)}
                      </div>
                    </div>
                    <div>
                      <span className="text-foreground/60">
                        Original Prompt:
                      </span>
                      <p className="font-medium mt-1">
                        {selectedIngredient.promptText || 'No prompt available'}
                      </p>
                    </div>
                  </div>
                </Card>

                <StudioEditDetailVersionHistory
                  processingAssets={processingAssets}
                  results={results}
                  onResultClick={handleResultClick}
                />
              </div>

              <div className="border-t border-white/[0.08] p-4 space-y-3">
                {categoryType === IngredientCategory.IMAGE && (
                  <div className="flex items-center gap-2 text-sm">
                    <label
                      htmlFor="outputFormat"
                      className="text-foreground/60 whitespace-nowrap"
                    >
                      Output Format
                    </label>
                    <Select
                      value={editForm.watch('outputFormat') ?? 'jpg'}
                      onValueChange={(value) =>
                        editForm.setValue(
                          'outputFormat',
                          value as ImageFormat.JPG | ImageFormat.PNG,
                          { shouldDirty: true, shouldTouch: true },
                        )
                      }
                    >
                      <SelectTrigger className="h-8 max-w-truncate-sm flex-1 bg-background px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpg">JPG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <PromptBar
                  mode="edit"
                  onSubmit={() => handleEditSubmit(editForm.getValues())}
                  form={editForm}
                  models={currentModels}
                  isProcessing={isProcessing}
                  selectedIngredient={selectedIngredient}
                  currentAssetFormat={
                    selectedIngredient?.ingredientFormat ||
                    IngredientFormat.SQUARE
                  }
                  categoryType={categoryType}
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center justify-center h-full">
                  <h3 className="text-lg font-semibold mb-4">Current Asset</h3>
                  <div className="relative max-w-full max-h-sidebar flex items-center justify-center">
                    <StudioEditDetailAssetPreview
                      selectedIngredient={selectedIngredient}
                      categoryType={categoryType}
                      videoRef={videoRef}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
