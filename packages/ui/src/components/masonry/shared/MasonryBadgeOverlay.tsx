'use client';

import { AssetScope, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { MasonryBadgeOverlayProps } from '@props/content/masonry.props';
import Badge from '@ui/display/badge/Badge';
import EvaluationBadge from '@ui/evaluation/badge/EvaluationBadge';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';
import {
  HiBuildingOffice,
  HiGlobeAlt,
  HiLockClosed,
  HiOutlineDocumentDuplicate,
  HiUsers,
} from 'react-icons/hi2';

const SCOPE_ICONS: Record<AssetScope, React.ReactNode> = {
  [AssetScope.USER]: <HiLockClosed className="w-3 h-3" />,
  [AssetScope.BRAND]: <HiUsers className="w-3 h-3" />,
  [AssetScope.ORGANIZATION]: <HiBuildingOffice className="w-3 h-3" />,
  [AssetScope.PUBLIC]: <HiGlobeAlt className="w-3 h-3" />,
};

/**
 * Shared badge overlay for masonry items
 * Displays evaluation score, model label, transformations, and version count
 */
export default function MasonryBadgeOverlay({
  ingredient,
  evaluationScore,
  isPublicGallery = false,
  className,
}: MasonryBadgeOverlayProps) {
  // Extract training label
  const trainingLabel =
    typeof ingredient.training === 'object' &&
    ingredient.training &&
    'label' in ingredient.training
      ? (ingredient.training as { label?: string }).label
      : undefined;

  const modelLabel =
    trainingLabel || ingredient.metadataModelLabel || ingredient.metadataModel;

  const badgeClasses = 'text-xs px-2 py-0.5 backdrop-blur-sm shadow-sm';

  // Get scope info
  const currentScope = ingredient.scope || AssetScope.USER;
  const scopeOption = SCOPE_OPTIONS.find((opt) => opt.value === currentScope);

  const scopeIcon = SCOPE_ICONS[currentScope] ?? SCOPE_ICONS[AssetScope.USER];

  return (
    <>
      {/* Left side badges - evaluation, model, transformations */}
      <div
        className={cn(
          'absolute top-2 left-2 z-10 flex flex-col gap-2',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          className,
        )}
      >
        {evaluationScore !== undefined && evaluationScore !== null && (
          <EvaluationBadge score={evaluationScore} size={ComponentSize.XS} />
        )}

        {modelLabel && (
          <Badge
            className={cn(badgeClasses, 'bg-muted/80 text-foreground')}
            value={modelLabel}
          />
        )}

        {ingredient.transformations &&
          Array.isArray(ingredient.transformations) &&
          ingredient.transformations.length > 0 && (
            <SimpleTooltip
              label={ingredient.transformations.join(', ')}
              position="right"
            >
              <div>
                <Badge
                  variant={ButtonVariant.SECONDARY}
                  className={badgeClasses}
                  value={
                    ingredient.transformations.length === 1
                      ? ingredient.transformations[0]
                      : `${ingredient.transformations[0]} +${ingredient.transformations.length - 1}`
                  }
                />
              </div>
            </SimpleTooltip>
          )}
      </div>

      {/* Right side badges - scope and version count */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 items-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {/* Scope badge - show if not USER (private is default, so only show if changed) */}
        {currentScope !== AssetScope.USER && scopeOption && (
          <SimpleTooltip label={`Scope: ${scopeOption.label}`} position="left">
            <Badge
              className={cn(
                badgeClasses,
                scopeOption.variant,
                'flex items-center gap-1',
              )}
              icon={scopeIcon}
              value={scopeOption.label}
            />
          </SimpleTooltip>
        )}

        {/* Version count */}
        {ingredient.totalChildren > 0 && !isPublicGallery && (
          <Badge
            className="text-xs px-2 py-0.5 flex items-center gap-2 bg-muted/80 text-foreground backdrop-blur-sm shadow-sm"
            icon={<HiOutlineDocumentDuplicate className="w-3 h-3" />}
            value={`${ingredient.totalChildren} version${ingredient.totalChildren > 1 ? 's' : ''}`}
          />
        )}
      </div>
    </>
  );
}
