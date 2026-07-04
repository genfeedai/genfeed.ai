'use client';

import { Button, type ButtonProps } from '@ui/primitives/button';

type TrackingData = Record<string, string | number | boolean>;

interface ButtonTrackedProps extends ButtonProps {
  trackingName: string;
  trackingData?: TrackingData;
}

export default function ButtonTracked({
  trackingName,
  trackingData,
  onClick,
  ...props
}: ButtonTrackedProps) {
  const activateButtonTracked = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('genfeed:marketing:button-click', {
          detail: {
            trackingData,
            trackingName,
          },
        }),
      );
    }

    onClick?.(e);
  };

  return <Button onClick={activateButtonTracked} {...props} />;
}
