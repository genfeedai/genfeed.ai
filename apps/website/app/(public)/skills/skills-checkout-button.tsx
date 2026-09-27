'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { SkillsCheckoutButtonProps } from '@props/website/skills-checkout-button.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Loader } from 'lucide-react';
import { useState } from 'react';

/**
 * Starts a Skills Pro checkout session and sends the browser to it. The only
 * stateful part of /skills: it owns its own loading state so the rest of the
 * page renders on the server.
 */
export default function SkillsCheckoutButton({
  children,
  className,
}: SkillsCheckoutButtonProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);

  async function handleCheckout(): Promise<void> {
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

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant={ButtonVariant.DEFAULT}
      size={ButtonSize.PUBLIC}
      className={className}
      disabled={isLoading}
      onClick={handleCheckout}
    >
      {isLoading ? <Loader className="size-4 animate-spin" /> : children}
    </Button>
  );
}
