'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createPublishingCampaignRoute,
} from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCampaign } from '@hooks/data/campaigns/use-campaign';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { toDateInputValue } from '@pages/campaigns/campaigns-status';
import CampaignUnavailableState from '@pages/campaigns/detail/CampaignUnavailableState';
import { CampaignsService } from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface CampaignFormState {
  brandId: string;
  brief: string;
  endDate: string;
  name: string;
  objective: string;
  startDate: string;
}

function emptyForm(brandId: string): CampaignFormState {
  return {
    brandId,
    brief: '',
    endDate: '',
    name: '',
    objective: '',
    startDate: '',
  };
}

export default function CampaignFormPage({
  campaignId,
}: {
  campaignId?: string;
}) {
  const translate = useTranslations('pages.publishing.campaigns');
  const collectionScope = useCollectionScope();
  const { brands } = useBrand();
  const { href } = useOrgUrl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getService = useAuthedService((token: string) =>
    CampaignsService.getInstance(token),
  );
  const isEdit = Boolean(campaignId);
  const { campaign, isLoading, isUnavailable } = useCampaign(campaignId);
  const defaultBrandId = collectionScope.brandId ?? '';
  const [form, setForm] = useState<CampaignFormState>(() =>
    emptyForm(defaultBrandId),
  );
  const [isSaving, setIsSaving] = useState(false);
  const canPickBrand = collectionScope.pageScope === 'org' && !isEdit;

  useEffect(() => {
    if (!campaign) {
      return;
    }
    setForm({
      brandId: campaign.brandId,
      brief: campaign.brief ?? '',
      endDate: toDateInputValue(campaign.endDate),
      name: campaign.name,
      objective: campaign.objective ?? '',
      startDate: toDateInputValue(campaign.startDate),
    });
  }, [campaign]);

  if (isEdit && isUnavailable) {
    return <CampaignUnavailableState />;
  }

  if (isEdit && (isLoading || !campaign)) {
    return (
      <Container label={translate('editTitle')} titleVisibility="sr-only">
        <LoadingState isFullSize />
      </Container>
    );
  }

  async function handleSubmit(): Promise<void> {
    if (!form.name.trim()) {
      notificationsService.error(translate('nameRequired'));
      return;
    }
    if (!form.brandId) {
      notificationsService.error(translate('brandRequired'));
      return;
    }
    if (
      !isEdit &&
      !isBrandResourceReady({ ...collectionScope, brandId: form.brandId })
    ) {
      notificationsService.error(translate('brandRequired'));
      return;
    }

    setIsSaving(true);
    try {
      const service = await getService();
      const payload = {
        brandId: form.brandId,
        brief: form.brief.trim() || null,
        endDate: form.endDate || null,
        name: form.name.trim(),
        objective: form.objective.trim() || null,
        startDate: form.startDate || null,
        ...(isEdit ? {} : { idempotencyKey: crypto.randomUUID() }),
      };
      const saved =
        isEdit && campaignId
          ? await service.update(campaignId, payload)
          : await service.create(payload);
      await queryClient.invalidateQueries({ queryKey: ['publish-campaigns'] });
      await queryClient.invalidateQueries({
        queryKey: ['publish-campaign', saved.id],
      });
      notificationsService.success(
        isEdit ? translate('updated') : translate('created'),
      );
      router.push(href(createPublishingCampaignRoute(saved.id)));
    } catch (error) {
      logger.error('Failed to save campaign', error);
      notificationsService.error(translate('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Container
      description={
        isEdit ? translate('editDescription') : translate('createDescription')
      }
      icon={Flag}
      label={isEdit ? translate('editTitle') : translate('newCampaign')}
      titleVisibility="sr-only"
    >
      <form
        className="mx-auto flex max-w-xl flex-col gap-4 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {canPickBrand ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-brand">{translate('columns.brand')}</Label>
            <Select
              onValueChange={(brandId) =>
                setForm((current) => ({ ...current, brandId }))
              }
              value={form.brandId}
            >
              <SelectTrigger id="campaign-brand">
                <SelectValue placeholder={translate('selectBrand')} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="campaign-name">{translate('columns.name')}</Label>
          <Input
            id="campaign-name"
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            value={form.name}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="campaign-objective">
            {translate('columns.objective')}
          </Label>
          <Input
            id="campaign-objective"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                objective: event.target.value,
              }))
            }
            value={form.objective}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="campaign-brief">{translate('brief')}</Label>
          <Textarea
            id="campaign-brief"
            onChange={(event) =>
              setForm((current) => ({ ...current, brief: event.target.value }))
            }
            rows={5}
            value={form.brief}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-start">{translate('startDate')}</Label>
            <Input
              id="campaign-start"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
              type="date"
              value={form.startDate}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-end">{translate('endDate')}</Label>
            <Input
              id="campaign-end"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
              type="date"
              value={form.endDate}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            isDisabled={isSaving}
            label={isEdit ? translate('saveChanges') : translate('create')}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          />
          <Button asChild variant={ButtonVariant.GHOST}>
            <Link href={href(APP_ROUTES.PUBLISHING.CAMPAIGNS)}>
              {translate('cancel')}
            </Link>
          </Button>
        </div>
      </form>
    </Container>
  );
}
