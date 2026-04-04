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
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Default Models</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Brand overrides take priority. Empty brand values inherit the
            organization baseline.
          </p>
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const value = row.brandValue || row.orgValue;
            const source = row.brandValue
              ? 'Brand override'
              : 'Organization default';

            return (
              <div
                key={row.label}
                className="flex items-start justify-between gap-4"
              >
                <div>
                  <span className="text-sm text-muted-foreground">
                    {row.label}
                  </span>
                  <p className="text-xs text-muted-foreground">{source}</p>
                </div>
                <span className="text-right text-sm font-medium">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
