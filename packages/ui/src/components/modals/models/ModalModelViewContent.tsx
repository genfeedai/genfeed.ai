import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';

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

type ModalModelViewContentProps = {
  model: IModel;
  cancelModalModel: () => void;
};

export default function ModalModelViewContent({
  model,
  cancelModalModel,
}: ModalModelViewContentProps) {
  return (
    <>
      <div className="space-y-6">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2">
          <Badge variant={ButtonVariant.SECONDARY} size={ComponentSize.SM}>
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
              Description
            </h4>
            <p className="text-foreground">{model.description}</p>
          </div>
        )}

        {/* Recommended For */}
        {model.recommendedFor && model.recommendedFor.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground/70 mb-2">
              Recommended For
            </h4>
            <div className="flex flex-wrap gap-2">
              {model.recommendedFor.map((item) => (
                <span
                  key={item}
                  className="px-3 py-1 bg-background rounded-full text-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Capabilities */}
        {model.capabilities && model.capabilities.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground/70 mb-2">
              Capabilities
            </h4>
            <div className="flex flex-wrap gap-2">
              {model.capabilities.map((capability) => (
                <Badge
                  key={capability}
                  variant="outline"
                  size={ComponentSize.SM}
                >
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
              Supported Features
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
              Supported Dimensions
            </h4>
            <div className="text-sm text-foreground bg-secondary shadow-border p-3">
              {model.minDimensions && (
                <div>
                  Min: {model.minDimensions.width} x{' '}
                  {model.minDimensions.height}px
                </div>
              )}
              {model.maxDimensions && (
                <div>
                  Max: {model.maxDimensions.width} x{' '}
                  {model.maxDimensions.height}px
                </div>
              )}
            </div>
          </div>
        )}

        {/* Model Key (technical info) */}
        <div className="pt-4 border-t border-white/[0.08]">
          <span className="text-xs text-foreground/50 font-mono">
            {model.key}
          </span>
        </div>
      </div>
      <ModalActions>
        <Button
          label="Close"
          variant={ButtonVariant.DEFAULT}
          onClick={cancelModalModel}
        />
      </ModalActions>
    </>
  );
}
