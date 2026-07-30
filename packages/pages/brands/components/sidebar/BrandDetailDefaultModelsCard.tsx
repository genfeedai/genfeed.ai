'use client';

import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type { BrandDetailDefaultModelsCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';

export default function BrandDetailDefaultModelsCard({
  brand,
}: BrandDetailDefaultModelsCardProps) {
  const { settings } = useOrganization();

  const rows = [
    {
      brandValue: brand.defaultVideoModel,
      label: 'Video',
      orgValue: settings?.defaultVideoModel,
    },
    {
      brandValue: brand.defaultImageModel,
      label: 'Image',
      orgValue: settings?.defaultImageModel,
    },
    {
      brandValue: brand.defaultImageToVideoModel,
      label: 'Image-to-Video',
      orgValue: settings?.defaultImageToVideoModel,
    },
    {
      brandValue: brand.defaultMusicModel,
      label: 'Music',
      orgValue: settings?.defaultMusicModel,
    },
  ].filter((row) => row.brandValue || row.orgValue);

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card
      label="Default Models"
      description="Brand overrides take priority. Empty values inherit the organization baseline."
    >
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const value = row.brandValue || row.orgValue;
          const source = row.brandValue
            ? 'Brand override'
            : 'Organization default';

          return (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium">{row.label}</span>
                <p className="text-xs text-muted-foreground">{source}</p>
              </div>
              <span className="max-w-[50%] truncate text-right text-xs text-muted-foreground">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
