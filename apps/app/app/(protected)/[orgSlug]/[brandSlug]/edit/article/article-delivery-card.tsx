import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isArticleDeliveryPlatform,
} from '@genfeedai/contracts/constants';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ArticleDeliveryCardProps } from '@props/edit/long-form-delivery.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { ArticlesService } from '@services/content/articles.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Clipboard, PlugZap, Send } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import ExternalUrlField from '../long-form-delivery/external-url-field';
import LongFormDeliveryHistory from '../long-form-delivery/long-form-delivery-history';
import { useSourceDeliveries } from '../long-form-delivery/use-source-deliveries';

function accountLabel(credential: ICredential): string {
  return (
    credential.label ||
    credential.externalName ||
    credential.externalHandle ||
    formatPlatformLabel(credential.platform) ||
    credential.platform
  );
}

/**
 * Article → connected Ghost / WordPress / Medium account. With no blog
 * connected, the article stays workspace-only and can be copied out.
 */
export default function ArticleDeliveryCard({
  article,
  content,
  isDirty,
  isSavingExternalUrl,
  onDelivered,
  onSaveExternalUrl,
}: ArticleDeliveryCardProps) {
  const translate = useTranslations('common.longFormDelivery');
  const { credentials } = useBrand();
  const { href } = useOrgUrl();
  const { openConfirm } = useConfirmModal();
  const [deliveringCredentialId, setDeliveringCredentialId] = useState<
    string | null
  >(null);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const accounts = useMemo(
    () =>
      credentials.filter(
        (credential) =>
          credential.isConnected &&
          isArticleDeliveryPlatform(credential.platform),
      ),
    [credentials],
  );

  const loadDeliveries = useCallback(
    async (signal: AbortSignal) => {
      const service = await getArticlesService();
      return service.findDeliveries(article.id, signal);
    },
    [article.id, getArticlesService],
  );
  const { reload, targets } = useSourceDeliveries(loadDeliveries);

  const hasContent = content.replace(/<[^>]*>/g, '').trim().length > 0;
  const blockedReason = isDirty
    ? translate('saveFirst')
    : hasContent
      ? null
      : translate('addContentFirst');

  const deliver = useCallback(
    async (credential: ICredential) => {
      const account = accountLabel(credential);
      setDeliveringCredentialId(credential.id);
      try {
        const service = await getArticlesService();
        await service.deliver(article.id, { credentialId: credential.id });
        notificationsService.success(translate('publishQueued', { account }));
        onDelivered();
        void reload();
      } catch (error) {
        logger.error('Failed to deliver article', error);
        notificationsService.error(translate('publishFailed', { account }));
      } finally {
        setDeliveringCredentialId(null);
      }
    },
    [
      article.id,
      getArticlesService,
      notificationsService,
      onDelivered,
      reload,
      translate,
    ],
  );

  return (
    <Card bodyClassName="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
          {translate('title')}
        </h3>
        <p className="text-sm text-foreground/70">
          {accounts.length > 0
            ? translate('articleIntro')
            : translate('noArticleAccounts')}
        </p>
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((credential) => {
            const account = accountLabel(credential);
            return (
              <Button
                key={credential.id}
                label={translate('publishTo', { account })}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                className="w-full justify-start"
                icon={<Send className="size-4" />}
                isLoading={deliveringCredentialId === credential.id}
                isDisabled={
                  Boolean(blockedReason) || deliveringCredentialId !== null
                }
                onClick={() =>
                  openConfirm({
                    cancelLabel: 'Cancel',
                    confirmLabel: translate('publishTo', { account }),
                    label: translate('publishConfirmTitle', { account }),
                    message: translate('publishConfirmMessage', { account }),
                    onConfirm: () => deliver(credential),
                  })
                }
              />
            );
          })}
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
            label={translate('copyHtml')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            icon={<Clipboard className="size-4" />}
            isDisabled={!hasContent}
            onClick={() => void clipboardService.copyToClipboard(content)}
          />
        </div>
      )}

      <LongFormDeliveryHistory credentials={credentials} targets={targets} />

      <ExternalUrlField
        id="article-external-url"
        isSaving={isSavingExternalUrl}
        value={article.externalUrl}
        onSave={onSaveExternalUrl}
      />
    </Card>
  );
}
