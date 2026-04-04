'use client';

import { Button, type ButtonProps } from '@ui/primitives/button';
import { track } from '@vercel/analytics';

interface ButtonTrackedProps extends ButtonProps {
  trackingName: string;
  trackingData?: Record<string, string | number | boolean>;
}

export default function ButtonTracked({
  trackingName,
  trackingData,
  onClick,
  ...props
}: ButtonTrackedProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    track(trackingName, trackingData);
    onClick?.(e);
  };

  return <Button onClick={handleClick} {...props} />;
}
