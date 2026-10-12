import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isNewsletterDeliveryPlatform,
  NEWSLETTER_DELIVERY_MODES,
  type NewsletterDeliveryMode,
} from '@genfeedai/contracts/constants';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { NewsletterDeliveryCardProps } from '@props/edit/long-form-delivery.props';
import { NewslettersService } from '@services/content/newsletters.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
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
import { Clipboard, PlugZap, Send } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import ExternalUrlField from '../long-form-delivery/external-url-field';
import LongFormDeliveryHistory from '../long-form-delivery/long-form-delivery-history';
import { useSourceDeliveries } from '../long-form-delivery/use-source-deliveries';

const MODE_LABEL_KEYS = {
  draft: 'modeDraft',
  schedule: 'modeSchedule',
  send: 'modeSend',
} as const satisfies Record<NewsletterDeliveryMode, string>;

function accountLabel(credential: ICredential): string {
  return (
    credential.label ||
    credential.externalName ||
    credential.externalHandle ||
    'Beehiiv'
  );
}

/**
 * Newsletter → connected Beehiiv publication, plus the brand's Substack
 * import feed (Substack has no publishing API, #2087).
 */
export default function NewsletterDeliveryCard({
  isDirty,
  isSavingExternalUrl,
  newsletter,
  onDelivered,
  onSaveExternalUrl,
}: NewsletterDeliveryCardProps) {
  const translate = useTranslations('common.longFormDelivery');
  const { brandId, credentials } = useBrand();
  const { href } = useOrgUrl();
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getNewslettersService = useAuthedService(
    useCallback((token: string) => NewslettersService.getInstance(token), []),
  );

  const accounts = useMemo(
    () =>
      credentials.filter(
        (credential) =>
          credential.isConnected &&
          isNewsletterDeliveryPlatform(credential.platform),
      ),
    [credentials],
  );
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [mode, setMode] = useState<NewsletterDeliveryMode>('send');
  const [sendAt, setSendAt] = useState('');
  const [isDelivering, setIsDelivering] = useState(false);

  const credentialId = selectedCredentialId || accounts[0]?.id || '';

  const loadDeliveries = useCallback(
    async (signal: AbortSignal) => {
      const service = await getNewslettersService();
      return service.findDeliveries(newsletter.id, signal);
    },
    [getNewslettersService, newsletter.id],
  );
  const { reload, targets } = useSourceDeliveries(loadDeliveries);

  const hasContent = Boolean(newsletter.content?.trim());
  const blockedReason = isDirty
    ? translate('saveFirst')
    : hasContent
      ? null
      : translate('addContentFirst');
  const feedUrl = brandId
    ? `${EnvironmentService.apiEndpoint}/public/rss/brands/${brandId}/newsletters`
    : null;

  const handleDeliver = useCallback(async () => {
    const scheduledDate =
      mode === 'schedule' && sendAt ? new Date(sendAt) : undefined;
    if (
      mode === 'schedule' &&
      (!scheduledDate ||
        Number.isNaN(scheduledDate.getTime()) ||
        scheduledDate <= new Date())
    ) {
      notificationsService.error(translate('scheduleRequired'));
      return;
    }

    setIsDelivering(true);
    try {
      const service = await getNewslettersService();
      await service.deliver(newsletter.id, {
        credentialId,
        mode,
        ...(scheduledDate
          ? { scheduledDate: scheduledDate.toISOString() }
          : {}),
      });
      notificationsService.success(translate('deliverQueued'));
      void reload();
      await onDelivered();
    } catch (error) {
      logger.error('Failed to deliver newsletter', error);
      notificationsService.error(translate('deliverFailed'));
    } finally {
      setIsDelivering(false);
    }
  }, [
    credentialId,
    getNewslettersService,
    mode,
    newsletter.id,
    notificationsService,
    onDelivered,
    reload,
    sendAt,
    translate,
  ]);

  return (
    <div className="space-y-4 rounded-lg bg-tertiary p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
          {translate('title')}
        </h3>
        <p className="text-sm text-foreground/70">
          {accounts.length > 0
            ? translate('newsletterIntro')
            : translate('noNewsletterAccounts')}
        </p>
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="newsletter-delivery-account">
                {translate('account')}
              </Label>
              <Select
                value={credentialId}
                onValueChange={setSelectedCredentialId}
              >
                <SelectTrigger id="newsletter-delivery-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {accountLabel(credential)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="newsletter-delivery-mode">
              {translate('mode')}
            </Label>
            <Select
              value={mode}
              onValueChange={(value) =>
                setMode(value as NewsletterDeliveryMode)
              }
            >
              <SelectTrigger id="newsletter-delivery-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEWSLETTER_DELIVERY_MODES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {translate(MODE_LABEL_KEYS[option])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'schedule' ? (
            <div className="space-y-1.5">
              <Label htmlFor="newsletter-delivery-send-at">
                {translate('sendAt')}
              </Label>
              <Input
                id="newsletter-delivery-send-at"
                type="datetime-local"
                value={sendAt}
                onChange={(event) => setSendAt(event.target.value)}
              />
            </div>
          ) : null}

          <Button
            label={translate('deliver')}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            icon={<Send className="size-4" />}
            isLoading={isDelivering}
            isDisabled={Boolean(blockedReason) || isDelivering || !credentialId}
            onClick={() => void handleDeliver()}
          />
          {blockedReason ? (
            <p className="text-xs text-foreground/60">{blockedReason}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <NextLink href={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}>
              <PlugZap className="size-4" />
              {translate('connectAccounts')}
            </NextLink>
          </Button>
          <Button
            label={translate('copyMarkdown')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            icon={<Clipboard className="size-4" />}
            isDisabled={!hasContent}
            onClick={() =>
              void clipboardService.copyToClipboard(newsletter.content)
            }
          />
        </div>
      )}

      <LongFormDeliveryHistory credentials={credentials} targets={targets} />

      {feedUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground/60">
            {translate('substackTitle')}
          </p>
          <p className="text-xs text-foreground/60">
            {translate('substackHint')}
          </p>
          <p className="break-all text-sm font-medium">{feedUrl}</p>
          <Button
            label={translate('copyFeed')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            icon={<Clipboard className="size-4" />}
            onClick={() => void clipboardService.copyToClipboard(feedUrl)}
          />
        </div>
      ) : null}

      <ExternalUrlField
        id="newsletter-external-url"
        isSaving={isSavingExternalUrl}
        value={newsletter.externalUrl}
        onSave={onSaveExternalUrl}
      />
    </div>
  );
}
