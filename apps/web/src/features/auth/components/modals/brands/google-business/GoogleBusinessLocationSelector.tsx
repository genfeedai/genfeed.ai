'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IGoogleBusinessLocation } from '@genfeedai/contracts/interfaces';
import { GoogleColorIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { GoogleBusinessLocationSelectorProps } from '@/features/auth/props/google-business-location-selector.props';

export type { GoogleBusinessLocationSelectorProps } from '@/features/auth/props/google-business-location-selector.props';

const EMPTY_LOCATIONS: IGoogleBusinessLocation[] = [];

/**
 * Lets the operator choose which Google Business locations a brand posts to
 * when the Google account manages more than one. Each ticked location
 * connects as its own channel on the brand. Reused by the OAuth callback page.
 *
 * The picks are validated server-side: `handleConfirm` posts only the chosen
 * ids to `POST /services/google-business/:credentialId/select-location`,
 * which reads the names again from Google and rejects an id this token does
 * not grant.
 */
export default function GoogleBusinessLocationSelector({
  credentialId,
  onBack,
  onConnected,
  onError,
}: GoogleBusinessLocationSelectorProps) {
  const translate = useTranslations(
    'common.oauth.platformCallback.selectLocation',
  );
  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('google-business', token),
  );

  const [pickedLocationIds, setPickedLocationIds] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Set when only some ticked locations connected: the operator reads which
  // before moving on, since the rest need another connect.
  const [partialResult, setPartialResult] = useState<{
    account: ConnectionAccount;
    notice: string;
  } | null>(null);

  const locationsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      const url = `GET /services/google-business/${credentialId}/locations`;
      try {
        const data = await service.getGoogleBusinessLocations(
          credentialId,
          signal,
        );
        logger.info(`${url} success`, { count: data.length });
        return data;
      } catch (fetchError) {
        if (!signal.aborted) {
          logger.error(`${url} failed`, fetchError);
        }
        throw fetchError;
      }
    },
    queryKey: ['google-business-locations', credentialId],
    service: (token: string) => new ServicesService('google-business', token),
  });
  const availableLocations = locationsQuery.data ?? EMPTY_LOCATIONS;
  // A refresh that no longer lists a pick drops it, so Confirm never sends a
  // location this credential stopped granting. Kept in list order.
  const selectedLocationIds = availableLocations
    .map((location) => location.id)
    .filter((locationId) => pickedLocationIds.includes(locationId));
  const isLoading = locationsQuery.isLoading;
  // A failed background refresh keeps the cached locations on screen.
  const hasLoadError = Boolean(locationsQuery.error) && !locationsQuery.data;
  const loadErrorMessage = translate('error');
  const error = confirmError ?? (hasLoadError ? loadErrorMessage : null);

  // `onError` churns identity on every render (callers rarely memoize an
  // inline handler), so it is read through a ref.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const loadError = hasLoadError ? locationsQuery.error : null;

  useEffect(() => {
    if (loadError) {
      onErrorRef.current?.(loadErrorMessage);
    }
  }, [loadError, loadErrorMessage]);

  const retry = () => {
    setPickedLocationIds([]);
    setConfirmError(null);
    void locationsQuery.refetch();
  };

  const handleConfirm = async () => {
    if (selectedLocationIds.length === 0) {
      return;
    }

    setIsConnecting(true);
    setConfirmError(null);
    const url = `POST /services/google-business/${credentialId}/select-location`;

    try {
      const service = await getServicesService();
      const connected = await service.postSelectLocations(
        credentialId,
        selectedLocationIds,
      );

      logger.info(`${url} success`, {
        connectedCount: connected.length,
        selectedCount: selectedLocationIds.length,
      });
      const [first] = connected;
      const account: ConnectionAccount = {
        avatarUrl: first?.externalAvatar,
        name: first?.externalName || first?.externalHandle,
      };

      if (connected.length < selectedLocationIds.length) {
        const connectedIds = new Set(
          connected.map((credential) => credential.externalId),
        );
        const missingNames = availableLocations
          .filter(
            (candidate) =>
              selectedLocationIds.includes(candidate.id) &&
              !connectedIds.has(candidate.id),
          )
          .map((candidate) => candidate.title)
          .join(', ');
        setPartialResult({
          account,
          notice: translate('partial', {
            connected: connected.length,
            missing: missingNames,
            selected: selectedLocationIds.length,
          }),
        });
        return;
      }

      onConnected(account);
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
          <p className="text-sm text-muted-foreground">
            {partialResult.notice}
          </p>
          <Button
            label={translate('continue')}
            onClick={() => onConnected(partialResult.account)}
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

      {!isLoading && !error && availableLocations.length === 0 && (
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

      {!isLoading && !partialResult && availableLocations.length > 0 && (
        <OptionTileGroup
          ariaLabel={translate('title')}
          className="max-h-72 overflow-y-auto"
          columns={1}
          onValueChange={setPickedLocationIds}
          type="multiple"
          value={selectedLocationIds}
        >
          {availableLocations.map((location) => (
            <OptionTile
              icon={
                <Avatar
                  alt={location.title}
                  fallback={<GoogleColorIcon className="size-5" />}
                  name={location.title}
                  size="lg"
                />
              }
              key={location.id}
              value={location.id}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{location.title}</span>
                  {location.isAlreadyConnected && (
                    <Badge variant="info">
                      {translate('alreadyConnected')}
                    </Badge>
                  )}
                </span>
                {location.address && (
                  <span className="text-sm text-muted-foreground">
                    {location.address}
                  </span>
                )}
              </span>
              {selectedLocationIds.includes(location.id) && (
                <CircleCheck className="text-primary text-xl" />
              )}
            </OptionTile>
          ))}
        </OptionTileGroup>
      )}

      {!isLoading && !partialResult && availableLocations.length > 0 && (
        <div className="flex gap-2">
          <Button
            label={
              isConnecting
                ? translate('confirming')
                : translate('confirm', { count: selectedLocationIds.length })
            }
            onClick={handleConfirm}
            isLoading={isConnecting}
            isDisabled={isConnecting || selectedLocationIds.length === 0}
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
