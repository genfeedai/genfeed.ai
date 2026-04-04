'use client';

import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal, isModalOpen } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { CredentialInstagram } from '@models/auth/credential.model';
import type { ModalBrandInstagramProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaInstagram } from 'react-icons/fa6';
import { HiCheckCircle } from 'react-icons/hi2';

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

  const modalWasOpenRef = useRef(false);

  const canConnectEnabled = useMemo(
    () => !!brand && !credential,
    [brand, credential],
  );

  // Load Instagram pages when modal opens
  useEffect(() => {
    const intervalId = setInterval(() => {
      const modalIsOpen = isModalOpen(ModalEnum.BRAND_INSTAGRAM);

      // Modal just opened
      if (modalIsOpen && !modalWasOpenRef.current) {
        modalWasOpenRef.current = true;

        if (credential) {
          (async () => {
            setError(null);
            setIsLoading(true);

            const url = `GET /credentials/${credential.id}/pages`;

            try {
              const service = await getCredentialsService();
              const data = await service.findCredentialInstagramPages(
                credential.id,
              );

              setAvailableHandles(data);

              logger.info(`${url} success`, data);
            } catch (error) {
              logger.error(`${url} failed`, error);
            } finally {
              setIsLoading(false);
            }
          })();
        }
      }

      // Modal just closed
      if (!modalIsOpen && modalWasOpenRef.current) {
        modalWasOpenRef.current = false;
        // Reset state on close
        setAvailableHandles([]);
        setSelectedHandle(null);
        setError(null);
        setIsLoading(false);
      }
    }, 100); // Check every 100ms

    return () => clearInterval(intervalId);
  }, [credential, getCredentialsService]);

  const initiateOAuthFlow = async () => {
    if (!brand || isConnecting) {
      return;
    }

    setIsConnecting(true);
    const url = `POST /services/instagram/connect`;

    try {
      const service = await getServicesService();

      const credentialOAuth = await service.postConnect({
        brand: brand.id,
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
        externalHandle: selectedHandle.username,
        externalId: selectedHandle.id,
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

  const closeAccountInstagramModal = () => {
    closeModal(ModalEnum.BRAND_INSTAGRAM);
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
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <FaInstagram className="text-white text-lg" />
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
            <div className="w-16 h-16 mx-auto mb-4">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
            <p className="text-muted-foreground text-sm">
              Loading Instagram pages...
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

        {!isLoading && availableHandles.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <FaInstagram className="text-muted-foreground text-xl" />
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
              <div
                key={handle.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedHandle?.id === handle.id
                    ? 'border-2 border-white bg-primary/10'
                    : 'border-2 border-transparent hover:bg-white/5'
                }`}
                onClick={() => setSelectedHandle(handle)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Image
                      src={handle.image}
                      alt={handle.label}
                      className="w-10 h-10 rounded-full object-cover"
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
                    <HiCheckCircle className="text-primary text-xl" />
                  )}
                </div>
              </div>
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
