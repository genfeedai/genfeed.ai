'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CampaignCreativeContextFieldsProps } from '@/features/campaigns/props/campaign.props';

const CONTEXT_FIELDS = ['audience', 'tone', 'creativeDirection'] as const;

export default function CampaignCreativeContextFields({
  brandId,
  value,
  onChange,
}: CampaignCreativeContextFieldsProps) {
  const translate = useTranslations('pages.publishing.campaigns');
  const { openGallery } = useGalleryModal();
  const { href } = useOrgUrl();
  const assetIds = value.assetIds ?? [];

  function chooseAssets(category: IngredientCategory): void {
    openGallery({
      category,
      maxSelectableItems: 50 - assetIds.length,
      title: translate('context.assets'),
      onSelect: (items) => {
        const owned = items.filter(
          (item) => item.brandId === brandId && !item.isDeleted,
        );
        onChange({
          assetIds: [
            ...new Set([...assetIds, ...owned.map((item) => item.id)]),
          ].slice(0, 50),
        });
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {translate('context.inheritance')}
      </p>
      {CONTEXT_FIELDS.map((field) => (
        <div className="flex flex-col gap-2" key={field}>
          <Label htmlFor={`campaign-${field}`}>
            {translate(`context.${field}`)}
          </Label>
          <Textarea
            id={`campaign-${field}`}
            value={value[field] ?? ''}
            onChange={(event) => onChange({ [field]: event.target.value })}
            rows={field === 'creativeDirection' ? 3 : 2}
          />
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{translate('context.assets')}</p>
        <p className="text-sm text-muted-foreground">
          {translate('context.assetCount', { count: assetIds.length })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            label={translate('context.addImages')}
            isDisabled={!brandId || assetIds.length >= 50}
            onClick={() => chooseAssets(IngredientCategory.IMAGE)}
          />
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            label={translate('context.addVideos')}
            isDisabled={!brandId || assetIds.length >= 50}
            onClick={() => chooseAssets(IngredientCategory.VIDEO)}
          />
        </div>
        {assetIds.map((assetId, index) => (
          <div className="flex items-center gap-2" key={assetId}>
            <Link
              className="text-sm underline underline-offset-4"
              href={href(createLibraryAssetRoute(undefined, assetId))}
            >
              {translate('context.viewAsset', { number: index + 1 })}
            </Link>
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              label={translate('context.removeAsset', { number: index + 1 })}
              onClick={() =>
                onChange({ assetIds: assetIds.filter((id) => id !== assetId) })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
