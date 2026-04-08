'use client';

import type { BrandDetailAccountSettingsCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';

export default function BrandDetailAccountSettingsCard({
  isPublic,
  onToggle,
}: BrandDetailAccountSettingsCardProps) {
  return (
    <Card>
      <div className="space-y-4">
        <Switch
          label="Public Profile"
          description="Make your profile visible to everyone"
          isChecked={isPublic}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </div>
    </Card>
  );
}
