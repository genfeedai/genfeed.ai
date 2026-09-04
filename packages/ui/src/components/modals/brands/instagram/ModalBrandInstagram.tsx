'use client';

import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { InstagramIcon } from '@genfeedai/helpers/ui/icons/brands';
import {
  closeModal,
  isModalOpen,
  subscribeModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { CredentialInstagram } from '@genfeedai/models/auth/credential.model';
import type { ModalBrandInstagramProps } from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { CircleCheck } from 'lucide-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

function closeAccountInstagramModal(): void {
  closeModal(ModalEnum.BRAND_INSTAGRAM);
}

export default function ModalBrandInstagram({
  brand,
  credential,
  onConfirm,
}: ModalBrandInstagramProps) {
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );

  const getServicesService = useAuthedService(
    (token: string) => new ServicesService('instagram', token),
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [availableHandles, setAvailableHandles] = useState<
    CredentialInstagram[]
  >([]);

  const [selectedHandle, setSelectedHandle] =
    useState<CredentialInstagram | null>();

  const [error, setError] = useState<string | null>(null);

  const subscribeToModal = useCallback(
    (listener: () => void) =>
      subscribeModal(ModalEnum.BRAND_INSTAGRAM, listener),
    [],
  );
  const getIsModalOpen = useCallback(
    () => isModalOpen(ModalEnum.BRAND_INSTAGRAM),
    [],
  );
  const isOpen = useSyncExternalStore(
    subscribeToModal,
    getIsModalOpen,
    () => false,
  );

  const canConnectEnabled = useMemo(
    () => !!brand && !credential,
    [brand, credential],
  );

  // Load Instagram pages when the modal opens, and drop them when it closes.
  useEffect(() => {
    if (!isOpen) {
      setAvailableHandles([]);
      setSelectedHandle(null);
      setError(null);
      setIsLoading(false);
      return undefined;
    }

    if (!credential) {
      return undefined;
    }

    const controller = new AbortController();
    const url = `GET /credentials/${credential.id}/pages`;

    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const service = await getCredentialsService();
        const data = await service.findCredentialInstagramPages(
          credential.id,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setAvailableHandles(data);
        logger.info(`${url} success`, data);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        logger.error(`${url} failed`, error);
        // Without this the effect leaves an empty handle list behind, and the
        // modal reports "No Instagram Business Brands Found" for what is
        // actually a failed request.
        setError('Failed to load Instagram accounts. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [credential, getCredentialsService, isOpen]);

  const initiateOAuthFlow = async () => {
    if (!brand || isConnecting) {
      return;
    }

    setIsConnecting(true);
    const url = `POST /services/instagram/connect`;

    try {
      const service = await getServicesService();

      const credentialOAuth = await service.postConnect({
        brandId: brand.id,
      });

      // Redirect to Instagram OAuth
      window.open(credentialOAuth.url, '_self');

      logger.info(`${url} success (OAuth initiation)`);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setError('Failed to initiate Instagram connection. Please try again.');
      setIsConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!credential || !selectedHandle) {
      return;
    }

    setIsConnecting(true);
    const url = `POST /services/instagram/connect`;

    try {
      const service = await getCredentialsService();

      const data = await service.patch(credential.id, {
        externalAvatar: selectedHandle.image,
        externalHandle: selectedHandle.username,
        externalId: selectedHandle.id,
        externalName: selectedHandle.label,
      });

      logger.info(`${url} success`, data);

      setIsConnecting(false);
      closeAccountInstagramModal();

      onConfirm();
    } catch (error) {
      logger.error(`${url} failed`, error);
      setError('Failed to connect Instagram account');
      setIsConnecting(false);
    }
  };

  return (
    <Modal
      id={ModalEnum.BRAND_INSTAGRAM}
      title="Connect Instagram Business Account"
      error={error}
      onClose={() => setError(null)}
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-platform-instagram">
            <InstagramIcon
              className={
                'text-lg text-white' /* design-system-allow-content-color -- platform mark */
              }
            />
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Connect an Instagram Business account
            </p>
          </div>
        </div>
        {/* Error is displayed via Modal error prop */}

        {isLoading && (
          <div className="text-center py-12">
            <div className="size-16 mx-auto mb-4">
              <div className="animate-spin rounded-full size-16 border-b-2 border-primary"></div>
            </div>
            <p className="text-muted-foreground text-sm">
              Loading Instagram pages…
            </p>
          </div>
        )}

        {!isLoading && availableHandles.length > 0 && (
          <Alert type={AlertCategory.INFO} className="mb-4">
            <div className="flex items-start gap-2">
              <div>
                <p className="font-medium text-sm">
                  Complete Your Instagram Setup
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your Instagram account is connected but not linked to a
                  specific page. Select the Instagram Business account you want
                  to use for posting.
                </p>
              </div>
            </div>
          </Alert>
        )}

        {!isLoading && !error && availableHandles.length === 0 && (
          <div className="text-center py-8">
            <div className="size-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <InstagramIcon className="text-muted-foreground text-xl" />
            </div>
            <h4 className="font-semibold mb-2">
              No Instagram Business Brands Found
            </h4>

            <p className="text-muted-foreground text-sm mb-4">
              Make sure you have an Instagram Business account connected to a
              Facebook Page you manage.
            </p>

            <div className="text-xs text-muted-foreground bg-muted p-3">
              <strong>Note</strong> Only Instagram Business accounts can publish
              content through the API. Creator accounts are not supported.
            </div>
          </div>
        )}

        {!isLoading && availableHandles.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {availableHandles.map((handle: CredentialInstagram) => (
              <Button
                key={handle.id}
                className={`p-4 cursor-pointer transition-[box-shadow,background-color] ${
                  selectedHandle?.id === handle.id
                    ? 'shadow-border-strong bg-primary/10'
                    : 'hover:bg-hover'
                }`}
                onClick={() => setSelectedHandle(handle)}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-platform-instagram">
                    <Image
                      src={handle.image}
                      alt={handle.label}
                      className="size-10 rounded-full object-cover outline-media"
                      width={40}
                      height={40}
                      sizes="40px"
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{handle.label}</h4>
                    </div>
                    <p className="text-sm">{handle.username}</p>
                  </div>

                  {selectedHandle?.id === handle.id && (
                    <CircleCheck className="text-primary text-xl" />
                  )}
                </div>
              </Button>
            ))}
          </div>
        )}

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={closeAccountInstagramModal}
            isDisabled={isConnecting}
          />

          <Button
            label={
              canConnectEnabled ? 'Connect business account' : 'Re-connect'
            }
            variant={
              canConnectEnabled
                ? ButtonVariant.DEFAULT
                : ButtonVariant.DESTRUCTIVE
            }
            onClick={initiateOAuthFlow}
            isLoading={isConnecting}
            isDisabled={isConnecting}
          />

          {!canConnectEnabled && (
            <Button
              label="Connect Selected Account"
              variant={ButtonVariant.DEFAULT}
              onClick={handleConnect}
              isLoading={isConnecting}
              isDisabled={
                isConnecting || !selectedHandle || availableHandles.length === 0
              }
            />
          )}
        </ModalActions>
      </div>
    </Modal>
  );
}
