'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { PricingCardProps } from '@genfeedai/props/content/pricing.props';
import type { PricingPlanProps } from '@genfeedai/props/content/subscription.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useState } from 'react';
import { FaCheck } from 'react-icons/fa6';

export default function PricingCard({
  plan,
  buttonLabel,
  className,
  subscription,
  onSubscribe,
}: PricingCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isActive = subscription?.status === 'active';
  const isMostPopular = plan.label === 'Professional' || plan.label === 'Pro';

  // Determine CTA text and href
  const ctaText = plan.cta || buttonLabel;
  const ctaHref = plan.ctaHref;

  return (
    <Card className={`text-center relative ${className}`}>
      {isMostPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge variant="success" size={ComponentSize.LG}>
            ⭐ MOST POPULAR
          </Badge>
        </div>
      )}

      <div className="flex flex-col h-full">
        <div className="flex-1">
          <h2 className="text-2xl font-bold mb-1">{plan.label}</h2>
          <p className="text-muted-foreground mb-4">{plan.description}</p>

          {/* Price Display */}
          {plan.price !== null && plan.price !== undefined && (
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">
              {plan.price === 0 ? (
                <span>Free</span>
              ) : (
                <span>${plan.price.toLocaleString()}</span>
              )}

              {plan.type === 'subscription' && plan.price > 0 && (
                <span className="text-base font-normal ml-1">
                  /{plan.interval}
                </span>
              )}

              {/* Output-driven display (NEW) */}
              {plan.outputs && (
                <div className="mt-4 py-4 border-y border-white/[0.08]">
                  <div className="text-2xl font-bold text-primary">
                    {plan.outputs.videoMinutes} min video
                  </div>
                  <div className="text-sm text-foreground/60 font-normal">
                    {plan.outputs.images?.toLocaleString()} images ·{' '}
                    {plan.outputs.voiceMinutes} min voice
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact Sales for Enterprise */}
          {plan.price === null && (
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">
              <span>Custom</span>
              <div className="text-sm text-foreground/60 font-normal mt-2">
                Contact us for pricing
              </div>
            </div>
          )}

          {plan.features && plan.features.length > 0 && (
            <ul className="text-sm text-muted-foreground mb-6 space-y-2 text-left">
              {plan.features.map((feature: string, index: number) => {
                const isEverythingIn = feature.startsWith('Everything in');

                if (isEverythingIn) {
                  return (
                    <li key={index} className="mt-4 mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {feature}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={index} className="flex items-start">
                    <FaCheck className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-auto">
          {isActive && (
            <Button
              label="Current Plan"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              className="w-full"
              isDisabled={true}
            />
          )}

          {/* Custom href link (for self-hosted, enterprise, etc.) */}
          {ctaHref && !isActive && (
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-8 w-full"
            >
              {ctaText}
            </Link>
          )}

          {/* Default subscribe button */}
          {onSubscribe && !isActive && !ctaHref && (
            <Button
              label={ctaText || buttonLabel}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              className="w-full"
              isLoading={isSubmitting}
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  await onSubscribe(plan as PricingPlanProps);
                } finally {
                  setIsSubmitting(false);
                }
              }}
            />
          )}

          {/* Fallback for plans without onSubscribe or ctaHref */}
          {!onSubscribe && !ctaHref && !isActive && (
            <Button
              label={ctaText || buttonLabel}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              className="w-full"
              isDisabled={true}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
