'use client';

import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import type { BrandPublicAnalyticsSettingProps } from '@/features/brands/props/brand-public-analytics-setting.props';

/**
 * Whether the public profile shows the numbers: the reach line under the name
 * and the likes, comments and reposts on each post. The owner always sees them
 * on this page; the setting only decides what visitors get.
 */
export default function BrandPublicAnalyticsSetting({
  isEnabled,
  isUpdating = false,
  onToggle,
}: BrandPublicAnalyticsSettingProps) {
  const t = useTranslations('pages.brandDetailOverview');

  return (
    <Switch
      description={t('publicAnalyticsDescription')}
      isChecked={isEnabled}
      isDisabled={isUpdating}
      label={t('publicAnalytics')}
      onCheckedChange={onToggle}
    />
  );
}
