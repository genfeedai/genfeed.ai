'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCampaignActivations } from '@hooks/data/campaigns/use-campaign-activations';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { CampaignsService } from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import LoadingState from '@ui/feedback/LoadingState';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export default function CampaignDetailAds({
  campaignId,
}: {
  campaignId: string;
}) {
  const translate = useTranslations('pages.publishing.campaigns');
  const { activations, isLoading, refetch } =
    useCampaignActivations(campaignId);
  const { openConfirm } = useConfirmModal();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getService = useAuthedService((token: string) =>
    CampaignsService.getInstance(token),
  );
  const [platform, setPlatform] = useState('meta');
  const [credentialId, setCredentialId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  function handlePrepare(): void {
    openConfirm({
      cancelLabel: translate('cancel'),
      confirmLabel: translate('prepareActivation'),
      label: translate('prepareActivationTitle'),
      message: translate('prepareActivationMessage'),
      onConfirm: async () => {
        setIsMutating(true);
        try {
          const service = await getService();
          await service.prepareActivation(campaignId, {
            adAccountId,
            credentialId,
            platform,
          });
          notificationsService.success(translate('activationPrepared'));
          await refetch();
        } catch (error) {
          logger.error('Failed to prepare campaign activation', error);
          notificationsService.error(translate('activationFailed'));
        } finally {
          setIsMutating(false);
        }
      },
    });
  }

  if (isLoading) {
    return <LoadingState isFullSize />;
  }

  return (
    <div className="grid gap-6 p-5 sm:p-6">
      <p className="text-sm text-foreground/70">{translate('adsDisclaimer')}</p>
      <Card label={translate('prepareActivation')}>
        <div className="grid gap-3">
          <Label htmlFor="activation-platform">
            {translate('adsPlatform')}
          </Label>
          <Input
            id="activation-platform"
            onChange={(event) => setPlatform(event.target.value)}
            value={platform}
          />
          <Label htmlFor="activation-credential">
            {translate('adsCredential')}
          </Label>
          <Input
            id="activation-credential"
            onChange={(event) => setCredentialId(event.target.value)}
            value={credentialId}
          />
          <Label htmlFor="activation-account">{translate('adsAccount')}</Label>
          <Input
            id="activation-account"
            onChange={(event) => setAdAccountId(event.target.value)}
            value={adAccountId}
          />
          <Button
            isDisabled={isMutating || !credentialId || !adAccountId}
            label={translate('prepareActivation')}
            onClick={handlePrepare}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      </Card>
      <Card label={translate('activations')}>
        {activations.length === 0 ? (
          <p className="text-sm text-foreground/70">
            {translate('emptyActivations')}
          </p>
        ) : (
          <ul className="grid gap-3 text-sm">
            {activations.map((activation) => (
              <li key={activation.id}>
                {activation.platform} · {activation.status}
                {activation.externalCampaignId
                  ? ` · ${activation.externalCampaignId}`
                  : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
