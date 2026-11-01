'use client';

import type { BrandDetailAccountSettingsCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';

export default function BrandDetailAccountSettingsCard({
  isPublic,
  isUpdating = false,
  onToggle,
}: BrandDetailAccountSettingsCardProps) {
  return (
    <Card>
      <Switch
        aria-label="Public Profile"
        label="Public Profile"
        description="Make your profile visible to everyone"
        isChecked={isPublic}
        isDisabled={isUpdating}
        onCheckedChange={onToggle}
      />
    </Card>
  );
}
