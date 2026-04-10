'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IUser } from '@genfeedai/interfaces';
import type { IngredientTabsMetadataProps } from '@genfeedai/interfaces/components/ingredient-tabs.interface';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import { HiArrowPath } from 'react-icons/hi2';

export default function IngredientTabsMetadata({
  ingredient,
  onRefresh,
}: IngredientTabsMetadataProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const notificationsService = NotificationsService.getInstance();

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const user = ingredient.user as IUser;

  // Check if metadata object exists and get values directly from ingredient.metadata
  const metadataExists =
    typeof ingredient.metadata === 'object' && ingredient.metadata !== null;

  // Access metadata properties directly if it's an object
  const metadataObj = metadataExists ? ingredient.metadata : null;
  const metadataWidth =
    metadataObj && typeof metadataObj === 'object' && 'width' in metadataObj
      ? (metadataObj as { width?: number }).width
      : null;

  const metadataHeight =
    metadataObj && typeof metadataObj === 'object' && 'height' in metadataObj
      ? (metadataObj as { height?: number }).height
      : null;

  const metadataDuration =
    metadataObj && typeof metadataObj === 'object' && 'duration' in metadataObj
      ? (metadataObj as { duration?: number }).duration
      : null;

  // Default values indicate missing/invalid metadata
  // Defaults: width=1080, height=1920, duration=8, size=0
  // If metadata doesn't exist OR values match defaults, treat as invalid
  const hasZeroOrUnknownWidth =
    !metadataExists ||
    ingredient.metadataWidth === 0 ||
    (ingredient.metadataWidth === 1080 && metadataWidth == null);

  const hasZeroOrUnknownHeight =
    !metadataExists ||
    ingredient.metadataHeight === 0 ||
    (ingredient.metadataHeight === 1920 && metadataHeight == null);

  const hasZeroOrUnknownDuration =
    !metadataExists ||
    ingredient.metadataDuration === 0 ||
    (ingredient.metadataDuration === 8 && metadataDuration == null);

  const hasZeroOrUnknownSize = !metadataExists || ingredient.metadataSize === 0;

  // Check if any critical metadata is zero or unknown
  const hasInvalidMetadata =
    hasZeroOrUnknownWidth ||
    hasZeroOrUnknownHeight ||
    hasZeroOrUnknownDuration ||
    hasZeroOrUnknownSize;

  // Helper function to format value or show '-'
  const formatValue = (
    value: number,
    formatter: (val: number) => string,
  ): string => {
    if (value === 0) {
      return '-';
    }
    return formatter(value);
  };

  const metadataRows = [
    // Dimensions: always show, use '-' for zero/unknown, otherwise use getters
    {
      label: 'Dimensions',
      value:
        hasZeroOrUnknownWidth || hasZeroOrUnknownHeight
          ? `${formatValue(ingredient.metadataWidth ?? 0, (w) => w.toString())}x${formatValue(ingredient.metadataHeight ?? 0, (h) => h.toString())}`
          : `${ingredient.metadataWidth ?? 0}x${ingredient.metadataHeight ?? 0}`,
    },
    // Duration: always show, use '-' for zero/unknown, otherwise use getter
    {
      label: 'Duration',
      value: hasZeroOrUnknownDuration
        ? formatValue(
            ingredient.metadataDuration ?? 0,
            (d) => `${Math.round(d)}s`,
          )
        : `${Math.round(ingredient.metadataDuration ?? 0)}s`,
    },
    // File Size: always show, use '-' for zero/unknown, otherwise use getter
    {
      label: 'File Size',
      value: hasZeroOrUnknownSize
        ? formatValue(
            ingredient.metadataSize ?? 0,
            (s) => `${(s / 1024 / 1024).toFixed(2)} MB`,
          )
        : `${((ingredient.metadataSize ?? 0) / 1024 / 1024).toFixed(2)} MB`,
    },
    ingredient.metadataModel
      ? {
          label: 'Model',
          value: ingredient.metadataModelLabel || ingredient.metadataModel,
        }
      : null,
    ingredient.metadataStyle
      ? {
          label: 'Style',
          value: ingredient.metadataStyle,
        }
      : null,
    ingredient.metadataTags && ingredient.metadataTags.length > 0
      ? {
          label: 'Tags',
          value: (
            <div className="flex flex-wrap gap-2 mt-1">
              {ingredient.metadataTags.map((tag) => {
                const tagKey = typeof tag === 'string' ? tag : tag.id;
                const tagLabel =
                  typeof tag === 'string' ? tag : tag.label || tag.id;
                return (
                  <Badge key={tagKey} variant="ghost">
                    {tagLabel}
                  </Badge>
                );
              })}
            </div>
          ),
        }
      : null,
    ingredient.status
      ? {
          label: 'Status',
          value: <span className="uppercase">{ingredient.status}</span>,
        }
      : null,
    ingredient.ingredientFormat
      ? {
          label: 'Format',
          value: (
            <span className="uppercase">{ingredient.ingredientFormat}</span>
          ),
        }
      : null,
    ingredient.createdAt
      ? {
          label: 'Created At',
          value: new Date(ingredient.createdAt).toLocaleString(),
        }
      : null,
    ingredient.updatedAt
      ? {
          label: 'Updated At',
          value: new Date(ingredient.updatedAt).toLocaleString(),
        }
      : null,
    ingredient.user
      ? {
          label: 'Created By',
          value: user.handle || user.email || 'Unknown',
        }
      : null,
  ].filter(Boolean);

  const handleRefreshMetadata = async () => {
    if (!ingredient?.id) {
      return;
    }

    setIsRefreshing(true);
    try {
      const service = await getIngredientsService();
      await service.refreshMetadata(ingredient.id);
      notificationsService.success('Metadata refreshed successfully');

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      logger.error('Failed to refresh metadata', error);
      notificationsService.error('Failed to refresh metadata');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert when metadata is zero or unknown */}
      {hasInvalidMetadata && (
        <Alert type={AlertCategory.WARNING}>
          <p>
            Some metadata values are missing or zero. Please refresh the data to
            update the metadata information.
          </p>
        </Alert>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metadataRows.map((row, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="font-semibold opacity-50">{row?.label}</span>
            <span className="text-white mt-0.5">{row?.value}</span>
          </div>
        ))}
      </div>

      <Button
        icon={
          <HiArrowPath
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        }
        tooltip="Refresh metadata"
        variant={ButtonVariant.OUTLINE}
        size={ButtonSize.SM}
        onClick={handleRefreshMetadata}
        isDisabled={isRefreshing}
        ariaLabel="Refresh metadata"
      />
    </div>
  );
}
