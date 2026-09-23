'use client';

import { ButtonVariant, formatPlatformLabel } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingCampaignRoute,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCampaignAccounts } from '@hooks/data/campaigns/use-campaign-accounts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { summarizeCampaignLifecycleItems } from '@pages/campaigns/campaigns-status';
import type { CampaignGenerateDialogProps } from '@props/content/campaign-setup.props';
import { CampaignsService } from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function CampaignGenerateDialog({
  campaign,
  onClose,
}: CampaignGenerateDialogProps) {
  const t = useTranslations('pages.publishing.campaigns');
  const { href } = useOrgUrl();
  const queryClient = useQueryClient();
  const { eligibleAccounts, isPending, isError, refetch } = useCampaignAccounts(
    campaign.brandId,
  );
  const getService = useAuthedService((token: string) =>
    CampaignsService.getInstance(token),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const request = useRef({ fingerprint: '', key: '' });
  const isSubmitting = useRef(false);
  const credentialIds = selectedIds.filter((id) =>
    eligibleAccounts.some((account) => account.id === id),
  );

  async function generate() {
    if (isSubmitting.current || !credentialIds.length) return;
    isSubmitting.current = true;
    setIsGenerating(true);
    setError('');
    setResultMessage('');
    const fingerprint = JSON.stringify([...credentialIds].sort());
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const service = await getService();
      const result = await service.generate(campaign.id, {
        credentialIds,
        idempotencyKey: request.current.key,
      });
      const summary = summarizeCampaignLifecycleItems(result.items);
      if (summary.failed || summary.ineligible) {
        setError(t('accounts.partial', summary));
      } else if (summary.succeeded) {
        setResultMessage(t('accounts.generated', summary));
      } else {
        setResultMessage(t('accounts.alreadyGenerated'));
      }
      await queryClient.invalidateQueries({
        queryKey: ['publish-campaign', campaign.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['publishing-posts-library'],
      });
    } catch (cause) {
      logger.error('Campaign content generation failed', cause);
      setError(t('accounts.generateFailed'));
    } finally {
      isSubmitting.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isGenerating) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!isGenerating}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t('generate')}</DialogTitle>
          <DialogDescription>
            {t('accounts.generateDescription')}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p role="status">{t('accounts.loading')}</p>
        ) : isError ? (
          <div role="alert">
            <p>{t('accounts.failed')}</p>
            <Button onClick={() => void refetch()}>
              {t('accounts.retry')}
            </Button>
          </div>
        ) : eligibleAccounts.length ? (
          <div className="flex flex-col gap-3">
            {eligibleAccounts.map((account) => (
              <Checkbox
                key={account.id}
                isDisabled={isGenerating}
                isChecked={selectedIds.includes(account.id)}
                label={`${formatPlatformLabel(account.platform)} · ${account.externalHandle || account.externalName || account.label || t('accounts.unnamed')}`}
                onCheckedChange={(checked) =>
                  setSelectedIds((current) =>
                    checked === true
                      ? [...current, account.id]
                      : current.filter((id) => id !== account.id),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p>{t('accounts.empty')}</p>
        )}
        <Button asChild variant={ButtonVariant.LINK}>
          <Link href={href(APP_ROUTES.SETTINGS.INTEGRATIONS)}>
            {t('accounts.manage')}
          </Link>
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {resultMessage ? (
          <p role="status" className="text-sm">
            {resultMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant={ButtonVariant.GHOST}
            isDisabled={isGenerating}
            onClick={onClose}
          >
            {t('accounts.close')}
          </Button>
          {resultMessage ? (
            <Button asChild>
              <Link
                href={href(
                  createPublishingCampaignRoute(campaign.id, 'content'),
                )}
                onClick={onClose}
              >
                {t('accounts.review')}
              </Link>
            </Button>
          ) : (
            <Button
              isDisabled={
                isGenerating || isPending || isError || !credentialIds.length
              }
              onClick={() => void generate()}
            >
              <Sparkles className="size-4" />
              {t(isGenerating ? 'accounts.generating' : 'generate')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
