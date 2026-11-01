import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
  getModelProviderLabel,
} from '@genfeedai/helpers/ui/model-badge.helper';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import type { ModelDetailPanelProps } from '@/features/models/props/model-detail-panel.props';

type QualityTierVariant = 'success' | 'info' | 'warning' | 'secondary';
type SpeedTierVariant = 'success' | 'info' | 'warning' | 'secondary';

function getQualityTierBadgeVariant(tier?: string): QualityTierVariant {
  switch (tier) {
    case 'ultra':
      return 'success';
    case 'high':
      return 'info';
    case 'standard':
      return 'warning';
    case 'basic':
      return 'secondary';
    default:
      return 'secondary';
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
      return 'secondary';
  }
}

/** A model's tiers, capabilities and limits, shown in the right context sidebar. */
export default function ModelDetailPanel({ model }: ModelDetailPanelProps) {
  const translate = useTranslations('pages.models.detail');

  return (
    <div className="space-y-6 p-4" data-testid="model-detail-panel">
      <div className="flex flex-wrap gap-2">
        <Badge
          className={`border ${getModelProviderBadgeClass(model.provider)}`}
        >
          {getModelProviderLabel(model.provider)}
        </Badge>
        <Badge
          className={`border ${getModelCategoryBadgeClass(model.category)}`}
        >
          {model.category}
        </Badge>

        <Badge variant="default">
          {model.costTier === 'high'
            ? 'Best'
            : model.costTier === 'medium'
              ? 'Better'
              : 'Good'}
        </Badge>

        {model.qualityTier && (
          <Badge variant={getQualityTierBadgeVariant(model.qualityTier)}>
            {model.qualityTier}
          </Badge>
        )}

        {model.speedTier && (
          <Badge variant={getSpeedTierBadgeVariant(model.speedTier)}>
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
              <Badge key={item} variant="outline">
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
              <Badge key={capability} variant="outline">
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
              <Badge key={feature} variant="outline">
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
          <div className="text-sm text-foreground bg-muted shadow-border p-3">
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
