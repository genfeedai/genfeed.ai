'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
  OnboardingStep,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { IExtractedBrandData } from '@genfeedai/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import OnboardingStepBrandUrl from '@ui/modals/onboarding/steps/OnboardingStepBrandUrl';
import OnboardingStepProcessing from '@ui/modals/onboarding/steps/OnboardingStepProcessing';
import OnboardingStepReview from '@ui/modals/onboarding/steps/OnboardingStepReview';
import OnboardingStepWelcome from '@ui/modals/onboarding/steps/OnboardingStepWelcome';
import { Button } from '@ui/primitives/button';
import { useCallback, useRef, useState } from 'react';

function getOnboardingStepContent(
  step: OnboardingStep,
  brandUrl: string,
  extractedData: IExtractedBrandData | null,
  setBrandUrl: (url: string) => void,
  isProcessing: boolean,
): React.ReactNode {
  switch (step) {
    case OnboardingStep.WELCOME:
      return <OnboardingStepWelcome />;
    case OnboardingStep.BRAND_URL:
      return (
        <OnboardingStepBrandUrl
          value={brandUrl}
          onChange={setBrandUrl}
          isDisabled={isProcessing}
        />
      );
    case OnboardingStep.PROCESSING:
      return <OnboardingStepProcessing url={brandUrl} />;
    case OnboardingStep.REVIEW:
      return <OnboardingStepReview data={extractedData} />;
    default:
      return null;
  }
}

export interface ModalOnboardingProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

/**
 * Onboarding wizard modal
 * Guides new users through brand setup process
 */
export default function ModalOnboarding({
  isOpen = false,
  onComplete,
  onSkip,
}: ModalOnboardingProps) {
  const resetKey = isOpen ? 'open' : 'closed';

  useModalAutoOpen(ModalEnum.ONBOARDING, {
    isOpen,
  });

  return (
    <ModalOnboardingContent
      key={resetKey}
      onComplete={onComplete}
      onSkip={onSkip}
    />
  );
}

function ModalOnboardingContent({
  onComplete,
  onSkip,
}: Omit<ModalOnboardingProps, 'isOpen'>) {
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.WELCOME);
  const [brandUrl, setBrandUrl] = useState('');
  const [extractedData, setExtractedData] =
    useState<IExtractedBrandData | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const isSkippingRef = useRef(false);

  const handleSkip = useCallback(async () => {
    if (isSkippingRef.current) {
      return;
    }
    isSkippingRef.current = true;

    try {
      // Mark first-login complete on the org settings resource (REST audit #1354).
      const [usersService, organizationsService] = await Promise.all([
        getUsersService(),
        getOrganizationsService(),
      ]);
      const organizations = await usersService.findMeOrganizations();
      const orgId = organizations[0]?.id;
      if (orgId) {
        await organizationsService.patchSettings(orgId, {
          isFirstLogin: false,
        });
      }
      closeModal(ModalEnum.ONBOARDING);
      onSkip?.();
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setError('Failed to skip onboarding. Please try again.');
    } finally {
      isSkippingRef.current = false;
    }
  }, [getUsersService, getOrganizationsService, onSkip]);

  const handleStartAnalysis = useCallback(async () => {
    if (!brandUrl.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setError(null);
    setStep(OnboardingStep.PROCESSING);
    setIsProcessing(true);

    try {
      // Scrape into the workspace's brand resource (was POST /onboarding/brand-setup;
      // now POST /brands/:id/scrape — REST audit #1354).
      const [usersService, brandsService] = await Promise.all([
        getUsersService(),
        getBrandsService(),
      ]);
      const brands = await usersService.findMeBrands({ pagination: false });
      const targetBrandId = brands[0]?.id;
      if (!targetBrandId) {
        throw new Error('No brand found for the current workspace');
      }

      const result = await brandsService.scrape(targetBrandId, {
        brandUrl: brandUrl.trim(),
      });

      if (result.success && result.extractedData) {
        setExtractedData(result.extractedData);
        setBrandId(result.brandId);
        setStep(OnboardingStep.REVIEW);
      } else {
        throw new Error(result.message || 'Failed to analyze website');
      }
    } catch (error: unknown) {
      logger.error('Brand analysis failed', error);
      setError(
        (error as Error)?.message ||
          'Failed to analyze website. Please try again.',
      );
      setStep(OnboardingStep.BRAND_URL);
    } finally {
      setIsProcessing(false);
    }
  }, [brandUrl, getUsersService, getBrandsService]);

  const handleConfirm = useCallback(() => {
    // The scrape step already persisted all extracted brand data; confirmation
    // is now a client-side acknowledgement (the empty-override confirm RPC was
    // dissolved in REST audit #1354).
    if (!brandId) {
      return;
    }

    closeModal(ModalEnum.ONBOARDING);
    onComplete?.();
  }, [brandId, onComplete]);

  const handleBack = useCallback(() => {
    setError(null);
    switch (step) {
      case OnboardingStep.BRAND_URL:
        setStep(OnboardingStep.WELCOME);
        break;
      case OnboardingStep.REVIEW:
        setStep(OnboardingStep.BRAND_URL);
        break;
      default:
        break;
    }
  }, [step]);

  const handleNext = useCallback(() => {
    setError(null);
    switch (step) {
      case OnboardingStep.WELCOME:
        setStep(OnboardingStep.BRAND_URL);
        break;
      case OnboardingStep.BRAND_URL:
        handleStartAnalysis();
        break;
      case OnboardingStep.REVIEW:
        handleConfirm();
        break;
      default:
        break;
    }
  }, [step, handleStartAnalysis, handleConfirm]);

  const stepContent = getOnboardingStepContent(
    step,
    brandUrl,
    extractedData,
    setBrandUrl,
    isProcessing,
  );

  const getStepNumber = (): number => {
    switch (step) {
      case OnboardingStep.WELCOME:
        return 1;
      case OnboardingStep.BRAND_URL:
        return 2;
      case OnboardingStep.PROCESSING:
        return 3;
      case OnboardingStep.REVIEW:
        return 4;
      default:
        return 1;
    }
  };

  const canGoBack =
    step === OnboardingStep.BRAND_URL || step === OnboardingStep.REVIEW;
  const showSkip =
    step !== OnboardingStep.PROCESSING && step !== OnboardingStep.COMPLETED;

  return (
    <Modal
      id={ModalEnum.ONBOARDING}
      title="Welcome to Genfeed"
      onClose={handleSkip}
    >
      <div className="flex flex-col min-h-form">
        {error && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            {error}
          </Alert>
        )}

        <div className="flex-1">{stepContent}</div>

        {/* Step indicator */}
        <div className="flex flex-col items-center gap-2 my-4">
          <div className="flex items-center gap-0">
            {[1, 2, 3, 4].map((num) => {
              const currentStep = getStepNumber();
              const isActive = num === currentStep;
              const isCompleted = num < currentStep;

              return (
                <div key={num} className="flex items-center">
                  {num > 1 && (
                    <div
                      className={`w-8 h-0.5 ${
                        num <= currentStep
                          ? 'bg-gradient-to-r from-primary/40 to-primary/20'
                          : 'bg-white/[0.08]'
                      }`}
                    />
                  )}
                  <div
                    className={`flex items-center justify-center text-xs font-semibold transition-all ${
                      isActive
                        ? 'size-10 bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30 text-primary-foreground'
                        : isCompleted
                          ? 'size-8 bg-gradient-to-br from-primary/40 to-primary/20 border border-primary/30 text-primary-foreground'
                          : 'size-8 bg-white/[0.05] border border-white/[0.08] text-muted-foreground'
                    }`}
                  >
                    {num}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Step {getStepNumber()} of 4
          </p>
        </div>

        <ModalActions className="border-t border-white/[0.05] pt-6 mt-8 justify-between items-center">
          {showSkip ? (
            <Button
              label="Skip for now"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.LG}
              onClick={handleSkip}
              isDisabled={isProcessing}
            />
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            {canGoBack && (
              <Button
                label="Back"
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.LG}
                onClick={handleBack}
                isDisabled={isProcessing}
              />
            )}

            {step !== OnboardingStep.PROCESSING && (
              <Button
                label={
                  step === OnboardingStep.REVIEW ? 'Complete Setup' : 'Continue'
                }
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.LG}
                className="min-w-onboarding-btn"
                onClick={handleNext}
                isLoading={isProcessing}
                isDisabled={
                  step === OnboardingStep.BRAND_URL && !brandUrl.trim()
                }
              />
            )}
          </div>
        </ModalActions>
      </div>
    </Modal>
  );
}
