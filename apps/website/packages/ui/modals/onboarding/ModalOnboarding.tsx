'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
  OnboardingStep,
} from '@genfeedai/enums';
import type { IExtractedBrandData } from '@genfeedai/interfaces';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import OnboardingStepBrandUrl from '@ui/modals/onboarding/steps/OnboardingStepBrandUrl';
import OnboardingStepProcessing from '@ui/modals/onboarding/steps/OnboardingStepProcessing';
import OnboardingStepReview from '@ui/modals/onboarding/steps/OnboardingStepReview';
import OnboardingStepWelcome from '@ui/modals/onboarding/steps/OnboardingStepWelcome';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.WELCOME);
  const [brandUrl, setBrandUrl] = useState('');
  const [extractedData, setExtractedData] =
    useState<IExtractedBrandData | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getOnboardingService = useAuthedService((token: string) =>
    OnboardingService.getInstance(token),
  );

  useModalAutoOpen(ModalEnum.ONBOARDING, {
    isOpen,
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(OnboardingStep.WELCOME);
      setBrandUrl('');
      setExtractedData(null);
      setBrandId(null);
      setError(null);
    }
  }, [isOpen]);

  const isSkippingRef = useRef(false);

  const handleSkip = useCallback(async () => {
    if (isSkippingRef.current) {
      return;
    }
    isSkippingRef.current = true;

    try {
      const service = await getOnboardingService();
      await service.skip();
      closeModal(ModalEnum.ONBOARDING);
      onSkip?.();
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setError('Failed to skip onboarding. Please try again.');
    } finally {
      isSkippingRef.current = false;
    }
  }, [getOnboardingService, onSkip]);

  const handleStartAnalysis = useCallback(async () => {
    if (!brandUrl.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setError(null);
    setStep(OnboardingStep.PROCESSING);
    setIsProcessing(true);

    try {
      const service = await getOnboardingService();
      const result = await service.setupBrand({
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
  }, [brandUrl, getOnboardingService]);

  const handleConfirm = useCallback(async () => {
    if (!brandId) {
      return;
    }

    try {
      const service = await getOnboardingService();
      await service.confirmBrandData(brandId, {});
      closeModal(ModalEnum.ONBOARDING);
      onComplete?.();
    } catch (error) {
      logger.error('Failed to confirm brand data', error);
      setError('Failed to save brand data. Please try again.');
    }
  }, [brandId, getOnboardingService, onComplete]);

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

  const renderStep = () => {
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
  };

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

        <div className="flex-1">{renderStep()}</div>

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
                        ? 'w-10 h-10 bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30 text-primary-foreground'
                        : isCompleted
                          ? 'w-8 h-8 bg-gradient-to-br from-primary/40 to-primary/20 border border-primary/30 text-primary-foreground'
                          : 'w-8 h-8 bg-white/[0.05] border border-white/[0.08] text-muted-foreground'
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
