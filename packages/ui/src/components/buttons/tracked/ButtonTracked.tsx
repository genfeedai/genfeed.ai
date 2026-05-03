'use client';

import { Button, type ButtonProps } from '@ui/primitives/button';
import { track } from '@vercel/analytics';

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
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    track(trackingName, trackingData);

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

  return <Button onClick={handleClick} {...props} />;
}
