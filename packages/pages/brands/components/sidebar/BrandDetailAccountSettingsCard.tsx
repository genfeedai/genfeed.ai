'use client';

import type { BrandDetailAccountSettingsCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';

export default function BrandDetailAccountSettingsCard({
  isPublic,
  onToggle,
}: BrandDetailAccountSettingsCardProps) {
  return (
    <Card>
      <div className="space-y-4">
        <FormToggle
          label="Public Profile"
          description="Make your profile visible to everyone"
          isChecked={isPublic}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </div>
    </Card>
  );
}
