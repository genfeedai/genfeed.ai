'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandDetailDefaultModelsCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ModelBrowserModal } from '@/components/models/ModelBrowserModal';
import RetiredModelAlert from '@/components/models/RetiredModelAlert';
import { useRetiredModels } from '@/features/models/hooks/useRetiredModels';
import { useWorkflowModelCatalog } from '@/features/workflows/hooks/useWorkflowModelCatalog';
import { useOrganization } from '@/hooks/data/organization/use-organization/use-organization';

type DefaultModelField =
  | 'defaultVideoModel'
  | 'defaultImageModel'
  | 'defaultImageToVideoModel'
  | 'defaultMusicModel';

interface DefaultModelRow {
  brandValue?: string | null;
  category: ModelCategory;
  field: DefaultModelField;
  label: string;
  orgValue?: string | null;
}

interface RetiredPick {
  category: ModelCategory;
  field: DefaultModelField;
  isBrandOverride: boolean;
  label: string;
}

export default function BrandDetailDefaultModelsCard({
  brand,
  onRefreshBrand,
}: BrandDetailDefaultModelsCardProps) {
  const translate = useTranslations('pages.models.retired');
  const notifications = NotificationsService.getInstance();
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const { getRetiredModel } = useRetiredModels();
  const [pick, setPick] = useState<RetiredPick | null>(null);
  const catalog = useWorkflowModelCatalog(pick ? [pick.category] : []);
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const allRows: DefaultModelRow[] = [
    {
      brandValue: brand.defaultVideoModel,
      category: ModelCategory.VIDEO,
      field: 'defaultVideoModel',
      label: 'Video',
      orgValue: settings?.defaultVideoModel,
    },
    {
      brandValue: brand.defaultImageModel,
      category: ModelCategory.IMAGE,
      field: 'defaultImageModel',
      label: 'Image',
      orgValue: settings?.defaultImageModel,
    },
    {
      brandValue: brand.defaultImageToVideoModel,
      category: ModelCategory.VIDEO,
      field: 'defaultImageToVideoModel',
      label: 'Image-to-Video',
      orgValue: settings?.defaultImageToVideoModel,
    },
    {
      brandValue: brand.defaultMusicModel,
      category: ModelCategory.MUSIC,
      field: 'defaultMusicModel',
      label: 'Music',
      orgValue: settings?.defaultMusicModel,
    },
  ];
  const rows = allRows.filter((row) => row.brandValue || row.orgValue);

  const handleSelect = useCallback(
    async (model: IModel) => {
      if (!pick) {
        return;
      }
      try {
        if (pick.isBrandOverride) {
          const service = await getBrandsService();
          await service.patch(brand.id, { [pick.field]: model.key });
          await onRefreshBrand?.();
        } else {
          if (!organizationId) {
            throw new Error('Organization context is unavailable');
          }
          const service = await getOrganizationsService();
          await service.patchSettings(organizationId, {
            [pick.field]: model.key,
          });
          await refresh();
        }
      } catch (error) {
        logger.error('Failed to save the replacement model', { error });
        notifications.error(translate('saveError'));
      } finally {
        setPick(null);
      }
    },
    [
      brand.id,
      getBrandsService,
      getOrganizationsService,
      notifications,
      onRefreshBrand,
      organizationId,
      pick,
      refresh,
      translate,
    ],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card label="Default Models">
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const value = row.brandValue || row.orgValue;
          const isBrandOverride = Boolean(row.brandValue);
          const source = isBrandOverride
            ? 'Brand override'
            : 'Organization default';
          const retired = getRetiredModel(value);

          return (
            <div key={row.label} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{row.label}</span>
                  <p className="text-xs text-muted-foreground">{source}</p>
                </div>
                <span className="flex max-w-[50%] items-center gap-2 text-right text-xs text-muted-foreground">
                  <span className="truncate">{retired?.label ?? value}</span>
                  {retired ? (
                    <Badge variant="warning">{translate('badge')}</Badge>
                  ) : null}
                </span>
              </div>
              {retired ? (
                <RetiredModelAlert
                  modelLabel={retired.label}
                  onPick={() =>
                    setPick({
                      category: row.category,
                      field: row.field,
                      isBrandOverride,
                      label: row.label,
                    })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <ModelBrowserModal
        hasError={catalog.hasError}
        isLoading={catalog.isLoading}
        isOpen={pick !== null}
        models={catalog.models}
        onClose={() => setPick(null)}
        onSelect={handleSelect}
        selectedKey={undefined}
      />
    </Card>
  );
}
