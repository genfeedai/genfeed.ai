'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { TrendItem } from '@props/trends/trends-page.props';
import { Button } from '@ui/primitives/button';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { HiArrowLeft } from 'react-icons/hi2';

type TrendDetailHeaderProps = {
  backHref: string;
  trend: TrendItem;
  onBack: () => void;
};

export default function TrendDetailHeader({
  backHref: _backHref,
  trend,
  onBack,
}: TrendDetailHeaderProps) {
  const platformConfig = PLATFORM_CONFIGS[trend.platform];

  return (
    <div className="space-y-3">
      <Button
        label="Back to Trends"
        variant={ButtonVariant.GHOST}
        size={ButtonSize.SM}
        icon={<HiArrowLeft className="size-4" />}
        onClick={onBack}
      />
      <div className="flex items-center gap-3">
        {platformConfig && (
          <div
            className="flex items-center justify-center size-10 rounded-full"
            style={{ backgroundColor: `${platformConfig.color}20` }}
          >
            <platformConfig.icon
              className="size-5"
              style={{ color: platformConfig.color }}
            />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <span className="uppercase tracking-wide font-semibold">
              {platformConfig?.label || trend.platform}
            </span>
            <span>•</span>
            <span>Trending Topic</span>
          </div>
          <h1 className="text-2xl font-bold">{trend.topic}</h1>
        </div>
      </div>
    </div>
  );
}
