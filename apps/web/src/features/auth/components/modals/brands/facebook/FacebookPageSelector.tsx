'use client';

import { ButtonVariant, CredentialPlatform } from '@genfeedai/contracts';
import { FACEBOOK_MAX_SELECTED_PAGES } from '@genfeedai/contracts/constants';
import type {
  ICredential,
  IFacebookPageCandidate,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FacebookPageSelectorProps } from '@/features/auth/props/facebook-page-selector.props';

export type { FacebookPageSelectorProps } from '@/features/auth/props/facebook-page-selector.props';

const EMPTY_PAGES: IFacebookPageCandidate[] = [];

/**
 * Lets the operator choose which Facebook Pages a brand posts to when the
 * Facebook account manages more than one. Each ticked Page connects as its own
 * channel on the brand. Reused by the OAuth callback page.
 *
 * The picks are validated server-side: `handleConfirm` posts only the chosen
 * ids to `POST /services/facebook/:credentialId/select-page`, which reads the
 * names again from Facebook and rejects an id this token does not grant.
 */
export default function FacebookPageSelector({
  credentialId,
  onBack,
  onConnected,
  onError,
}: FacebookPageSelectorProps) {
  const translate = useTranslations('common.oauth.platformCallback.selectPage');
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('facebook', token),
  );

  const [pickedPageIds, setPickedPageIds] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Set when only some ticked pages connected: the operator reads which
  // before moving on, since the rest need another connect.
  const [partialResult, setPartialResult] = useState<{
    account: ConnectionAccount;
    credentials: readonly ICredential[];
    notice: string;
  } | null>(null);

  const pagesQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      const url = `GET /services/facebook/${credentialId}/pages`;
      try {
        const data = await service.getFacebookPages(credentialId, signal);
        logger.info(`${url} success`, { count: data.length });
        return data;
      } catch (fetchError) {
        if (!signal.aborted) {
          logger.error(`${url} failed`, fetchError);
        }
        throw fetchError;
      }
    },
    queryKey: ['facebook-pages', credentialId],
    service: (token: string) => new ServicesService('facebook', token),
  });
  const availablePages = pagesQuery.data ?? EMPTY_PAGES;
  // A refresh that no longer lists a pick drops it, so Confirm never sends a
  // page this credential stopped granting. Kept in list order.
  const selectedPageIds = availablePages
    .map((page) => page.id)
    .filter((pageId) => pickedPageIds.includes(pageId));
  const isSelectionFull = selectedPageIds.length >= FACEBOOK_MAX_SELECTED_PAGES;
  const isLoading = pagesQuery.isLoading;
  // A failed background refresh keeps the cached pages on screen.
  const hasLoadError = Boolean(pagesQuery.error) && !pagesQuery.data;
  const loadErrorMessage = translate('error');
  const error = confirmError ?? (hasLoadError ? loadErrorMessage : null);

  // `onError` churns identity on every render (callers rarely memoize an
  // inline handler), so it is read through a ref.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loadError = hasLoadError ? pagesQuery.error : null;

  // use-effect-audit: ignore reports a failed load to the logger or a notification
  useEffect(() => {
    if (loadError) {
      onErrorRef.current?.(loadErrorMessage);
    }
  }, [loadError, loadErrorMessage]);

  // The server rejects more than the maximum with one generic error, so a tick
  // past it is ignored here and the limit is stated instead.
  const handlePickedChange = (nextIds: string[]) => {
    if (nextIds.length > FACEBOOK_MAX_SELECTED_PAGES) {
      return;
    }
    setPickedPageIds(nextIds);
  };

  const retry = () => {
    setPickedPageIds([]);
    setConfirmError(null);
    void pagesQuery.refetch();
  };

  const handleConfirm = async () => {
    if (selectedPageIds.length === 0) {
      return;
    }

    setIsConnecting(true);
    setConfirmError(null);
    const url = `POST /services/facebook/${credentialId}/select-page`;

    try {
      const service = await getServicesService();
      const connected = await service.postSelectPages(
        credentialId,
        selectedPageIds,
      );

      logger.info(`${url} success`, {
        connectedCount: connected.length,
        selectedCount: selectedPageIds.length,
      });
      const [first] = connected;
      const account: ConnectionAccount = {
        avatarUrl: first?.externalAvatar,
        name: first?.externalName || first?.externalHandle,
      };

      if (connected.length < selectedPageIds.length) {
        const connectedIds = new Set(
          connected.map((credential) => credential.externalId),
        );
        const missingNames = availablePages
          .filter(
            (candidate) =>
              selectedPageIds.includes(candidate.id) &&
              !connectedIds.has(candidate.id),
          )
          .map((candidate) => candidate.name)
          .join(', ');
        setPartialResult({
          account,
          credentials: connected,
          notice: translate('partial', {
            connected: connected.length,
            missing: missingNames,
            selected: selectedPageIds.length,
          }),
        });
        return;
      }

      onConnected(account, connected);
    } catch (confirmFailure) {
      logger.error(`${url} failed`, confirmFailure);
      const message = translate('confirmError');
      setConfirmError(message);
      onError?.(message);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold">{translate('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{translate('loading')}</p>
      )}

      {partialResult && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground" role="status">
            {partialResult.notice}
          </p>
          <Button
            label={translate('continue')}
            onClick={() =>
              onConnected(partialResult.account, partialResult.credentials)
            }
          />
        </div>
      )}

      {!isLoading && error && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <div className="flex gap-2">
            <Button
              label={translate('retry')}
              onClick={retry}
              variant={ButtonVariant.SECONDARY}
            />
            {onBack && (
              <Button
                label={translate('back')}
                onClick={onBack}
                variant={ButtonVariant.LINK}
                withWrapper={false}
              />
            )}
          </div>
        </div>
      )}

      {!isLoading && !error && availablePages.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{translate('empty')}</p>
          <div className="flex gap-2">
            <Button
              label={translate('retry')}
              onClick={retry}
              variant={ButtonVariant.SECONDARY}
            />
            {onBack && (
              <Button
                label={translate('back')}
                onClick={onBack}
                variant={ButtonVariant.LINK}
                withWrapper={false}
              />
            )}
          </div>
        </div>
      )}

      {!isLoading && !partialResult && availablePages.length > 0 && (
        <OptionTileGroup
          ariaLabel={translate('title')}
          className="max-h-72 overflow-y-auto"
          columns={1}
          onValueChange={handlePickedChange}
          type="multiple"
          value={selectedPageIds}
        >
          {availablePages.map((page) => (
            <OptionTile
              icon={
                <ConnectedAccountAvatar
                  account={{
                    avatarUrl: page.picture,
                    name: page.name,
                    platform: CredentialPlatform.FACEBOOK,
                  }}
                  size="lg"
                />
              }
              key={page.id}
              value={page.id}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{page.name}</span>
                  {page.isAlreadyConnected && (
                    <Badge variant="info">
                      {translate('alreadyConnected')}
                    </Badge>
                  )}
                </span>
                {page.category && (
                  <span className="text-sm text-muted-foreground">
                    {page.category}
                  </span>
                )}
              </span>
              {selectedPageIds.includes(page.id) && (
                <CircleCheck className="text-primary text-xl" />
              )}
            </OptionTile>
          ))}
        </OptionTileGroup>
      )}

      {!isLoading &&
        !partialResult &&
        availablePages.length > FACEBOOK_MAX_SELECTED_PAGES && (
          <p
            className={
              isSelectionFull
                ? 'text-sm text-destructive'
                : 'text-sm text-muted-foreground'
            }
            role="status"
          >
            {translate(isSelectionFull ? 'limitReached' : 'limit', {
              max: FACEBOOK_MAX_SELECTED_PAGES,
            })}
          </p>
        )}

      {!isLoading && !partialResult && availablePages.length > 0 && (
        <div className="flex gap-2">
          <Button
            label={
              isConnecting
                ? translate('confirming')
                : translate('confirm', { count: selectedPageIds.length })
            }
            onClick={handleConfirm}
            isLoading={isConnecting}
            isDisabled={isConnecting || selectedPageIds.length === 0}
          />
          {onBack && (
            <Button
              label={translate('cancel')}
              onClick={onBack}
              isDisabled={isConnecting}
              variant={ButtonVariant.SECONDARY}
            />
          )}
        </div>
      )}
    </div>
  );
}
