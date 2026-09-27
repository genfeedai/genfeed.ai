'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import type { SkillsCheckoutButtonProps } from '@props/website/skills-checkout-button.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Loader } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';

interface SkillsCheckoutState {
  isLoading: boolean;
  startCheckout: () => Promise<void>;
}

const SkillsCheckoutContext = createContext<SkillsCheckoutState | null>(null);

/**
 * One checkout for every CTA on /skills. The page renders two buy buttons;
 * with a loading state each, the second stayed clickable while the first
 * request was in flight and could open a second Stripe Checkout Session.
 * The provider is a client island, so the page around it stays on the server.
 */
export function SkillsCheckoutProvider({
  children,
}: LayoutProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);

  const startCheckout = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/skills-pro/checkout`,
        {
          body: JSON.stringify({
            cancelUrl: `${window.location.origin}/skills`,
            successUrl: `${window.location.origin}/skills/success?session_id={CHECKOUT_SESSION_ID}`,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error(`Checkout failed: ${response.status}`);
      }

      const data = await response.json();

      // The API answers `{ url: '' }` when Stripe returns no session URL; treat
      // it as a failure so the buttons do not stay disabled forever.
      if (!data.url) {
        throw new Error('Checkout session URL missing');
      }

      // Stays loading while the browser leaves for Stripe.
      window.location.href = data.url;
    } catch {
      setIsLoading(false);
    }
  }, []);

  return (
    <SkillsCheckoutContext.Provider value={{ isLoading, startCheckout }}>
      {children}
    </SkillsCheckoutContext.Provider>
  );
}

/** A buy button; every button under one provider shares its pending state. */
export default function SkillsCheckoutButton({
  children,
  className,
}: SkillsCheckoutButtonProps): React.ReactElement {
  const checkout = useContext(SkillsCheckoutContext);
  if (!checkout) {
    throw new Error(
      'SkillsCheckoutButton must be rendered inside SkillsCheckoutProvider',
    );
  }

  return (
    <Button
      variant={ButtonVariant.DEFAULT}
      size={ButtonSize.PUBLIC}
      className={className}
      disabled={checkout.isLoading}
      onClick={checkout.startCheckout}
    >
      {checkout.isLoading ? (
        <Loader className="size-4 animate-spin" />
      ) : (
        children
      )}
    </Button>
  );
}
