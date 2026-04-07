'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { SubscriptionChangePreview } from '@genfeedai/interfaces';
import type { SubscriptionPlanChangerProps } from '@props/content/subscription.props';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import { useState } from 'react';

export default function SubscriptionPlanChanger({
  subscription,
  onPreviewChange,
  onChangePlan,
}: SubscriptionPlanChangerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState<string>('');

  const [preview, setPreview] = useState<SubscriptionChangePreview | null>(
    null,
  );

  const monthlyPriceId = EnvironmentService.plans.monthly;
  const yearlyPriceId = EnvironmentService.plans.yearly;

  const isMonthly = subscription.category === 'monthly';
  const isYearly = subscription.category === 'yearly';

  const handlePreviewChange = async (newPriceId: string) => {
    if (newPriceId === subscription.stripePriceId) {
      return; // No change needed
    }

    setIsLoading(true);
    setSelectedPriceId(newPriceId);

    try {
      const previewData = await onPreviewChange(newPriceId);

      setPreview(previewData);
      setShowModal(true);
      setIsLoading(false);
    } catch (error) {
      logger.error('Failed to preview subscription change:', error);
      setIsLoading(false);
    }
  };

  const handleConfirmChange = async () => {
    if (!selectedPriceId) {
      return;
    }

    setIsLoading(true);
    try {
      await onChangePlan(selectedPriceId);
      setShowModal(false);
      setPreview(null);
      setIsLoading(false);
    } catch (error) {
      logger.error('Failed to change subscription plan:', error);
      setIsLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      currency: currency.toUpperCase(),
      style: 'currency',
    }).format(amount / 100);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Change Subscription Plan</h3>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex justify-between items-center p-4 border border-primary/10">
            <div>
              <h4 className="font-medium">Monthly Plan</h4>
              <p className="text-sm text-muted-foreground">$299/month</p>
            </div>

            <div className="flex items-center gap-2">
              {isMonthly && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800">
                  Current
                </span>
              )}

              {!isMonthly && (
                <Button
                  label="Switch to Monthly"
                  onClick={() =>
                    monthlyPriceId && handlePreviewChange(monthlyPriceId)
                  }
                  isDisabled={isLoading}
                  isLoading={isLoading}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex justify-between items-center p-4 border border-primary/10">
            <div>
              <h4 className="font-medium flex items-center gap-2">
                Yearly Plan
                <span className="text-xs text-success font-bold">
                  (20% Bonus)
                </span>
              </h4>
              <p className="text-sm text-muted-foreground">$2,990/year</p>
            </div>

            <div className="flex items-center gap-2">
              {isYearly && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800">
                  Current
                </span>
              )}

              {!isYearly && (
                <Button
                  label="Switch to Yearly"
                  onClick={() =>
                    yearlyPriceId && handlePreviewChange(yearlyPriceId)
                  }
                  isDisabled={isLoading}
                  isLoading={isLoading}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showModal && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Confirm Subscription Change
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2 gap-2">
                  You're switching from
                  <span className="font-medium">{subscription.category}</span>
                  to
                  <span className="font-medium">
                    {selectedPriceId === yearlyPriceId ? 'yearly' : 'monthly'}
                  </span>
                </p>
              </div>

              <div className="bg-muted p-4">
                <h4 className="font-medium mb-2">Billing Summary</h4>

                {preview.isUpgrade && (
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Amount due today
                      </span>
                      <span className="font-medium text-green-600">
                        {formatAmount(preview.prorationAmount)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This is the prorated amount for the plan upgrade.
                    </p>
                  </div>
                )}

                {preview.isDowngrade && (
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Credit applied
                      </span>
                      <span className="font-medium text-blue-600">
                        {formatAmount(Math.abs(preview.prorationAmount))}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This credit will be applied to your next billing cycle.
                    </p>
                  </div>
                )}

                {preview.prorationAmount === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No additional charges or credits apply.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  label="Cancel"
                  variant={ButtonVariant.SECONDARY}
                  className="flex-1"
                  isDisabled={isLoading}
                  onClick={() => {
                    setShowModal(false);
                    setPreview(null);
                  }}
                />

                <Button
                  label="Confirm Change"
                  onClick={handleConfirmChange}
                  variant={ButtonVariant.DEFAULT}
                  className="flex-1"
                  isDisabled={isLoading}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
