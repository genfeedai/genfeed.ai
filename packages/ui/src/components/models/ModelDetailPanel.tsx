import { ComponentSize } from '@genfeedai/contracts';
import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
  getModelProviderLabel,
} from '@genfeedai/helpers/ui/model-badge.helper';
import type { ModelDetailPanelProps } from '@props/ui/models/model-detail-panel.props';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

type QualityTierVariant = 'success' | 'info' | 'warning' | 'ghost';
type SpeedTierVariant = 'success' | 'info' | 'warning' | 'ghost';

function getQualityTierBadgeVariant(tier?: string): QualityTierVariant {
  switch (tier) {
    case 'ultra':
      return 'success';
    case 'high':
      return 'info';
    case 'standard':
      return 'warning';
    case 'basic':
      return 'ghost';
    default:
      return 'ghost';
  }
}

function getSpeedTierBadgeVariant(tier?: string): SpeedTierVariant {
  switch (tier) {
    case 'fast':
      return 'success';
    case 'medium':
      return 'info';
    case 'slow':
      return 'warning';
    default:
      return 'ghost';
  }
}

/** A model's tiers, capabilities and limits, shown in the right context sidebar. */
export default function ModelDetailPanel({ model }: ModelDetailPanelProps) {
  const translate = useTranslations('pages.models.detail');

  return (
    <div className="space-y-6 p-4" data-testid="model-detail-panel">
      <div className="flex flex-wrap gap-2">
        <Badge
          className={`border text-xs uppercase ${getModelProviderBadgeClass(model.provider)}`}
          size={ComponentSize.SM}
        >
          {getModelProviderLabel(model.provider)}
        </Badge>
        <Badge
          className={`border text-xs uppercase ${getModelCategoryBadgeClass(model.category)}`}
          size={ComponentSize.SM}
        >
          {model.category}
        </Badge>

        <Badge variant="accent" size={ComponentSize.SM}>
          {model.costTier === 'high'
            ? 'Best'
            : model.costTier === 'medium'
              ? 'Better'
              : 'Good'}
        </Badge>

        {model.qualityTier && (
          <Badge
            variant={getQualityTierBadgeVariant(model.qualityTier)}
            size={ComponentSize.SM}
          >
            {model.qualityTier}
          </Badge>
        )}

        {model.speedTier && (
          <Badge
            variant={getSpeedTierBadgeVariant(model.speedTier)}
            size={ComponentSize.SM}
          >
            {model.speedTier}
          </Badge>
        )}
      </div>

      {/* Description */}
      {model.description && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">
            {translate('description')}
          </h4>
          <p className="text-foreground">{model.description}</p>
        </div>
      )}

      {/* Recommended For */}
      {model.recommendedFor && model.recommendedFor.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">
            {translate('recommendedFor')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {model.recommendedFor.map((item) => (
              <Badge key={item} variant="outline" size={ComponentSize.SM}>
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {model.capabilities && model.capabilities.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">
            {translate('capabilities')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map((capability) => (
              <Badge key={capability} variant="outline" size={ComponentSize.SM}>
                {capability}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Supported Features */}
      {model.supportsFeatures && model.supportsFeatures.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">
            {translate('supportedFeatures')}
          </h4>
          <div className="flex flex-wrap gap-2">
            {model.supportsFeatures.map((feature) => (
              <Badge key={feature} variant="outline" size={ComponentSize.SM}>
                {feature}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Dimensions */}
      {(model.minDimensions || model.maxDimensions) && (
        <div>
          <h4 className="text-sm font-medium text-foreground/70 mb-2">
            {translate('supportedDimensions')}
          </h4>
          <div className="text-sm text-foreground bg-secondary shadow-border p-3">
            {model.minDimensions && (
              <div>
                {translate('minDimensions', {
                  height: model.minDimensions.height,
                  width: model.minDimensions.width,
                })}
              </div>
            )}
            {model.maxDimensions && (
              <div>
                {translate('maxDimensions', {
                  height: model.maxDimensions.height,
                  width: model.maxDimensions.width,
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model Key (technical info) */}
      <div className="pt-4 border-t border-border">
        <span className="text-xs text-foreground/50 font-mono">
          {model.key}
        </span>
      </div>
    </div>
  );
}
