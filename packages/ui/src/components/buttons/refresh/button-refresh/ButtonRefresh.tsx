'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ButtonRefreshProps } from '@genfeedai/props/ui/forms/button.props';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { RefreshCw } from 'lucide-react';

const SPOKE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const SPINNER_STYLES = `
  .gen-refresh-spinner-spoke {
    animation: gen-refresh-spinner-fade 1s linear infinite;
  }

  @keyframes gen-refresh-spinner-fade {
    0%, 100% { opacity: 1; }
    80% { opacity: 0.2; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gen-refresh-spinner-spoke { animation: none; opacity: 0.65; }
  }
`;

function RefreshSpinner() {
  return (
    <>
      {/* Hoisted to <head>: an in-place <style> breaks hydration (#6601). */}
      <style href="genfeed-refresh-spinner" precedence="genfeed-component">
        {SPINNER_STYLES}
      </style>
      <svg
        aria-hidden="true"
        className={SHELL_ICON_CLASS}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        {SPOKE_ANGLES.map((angle, index) => (
          <line
            key={angle}
            className="gen-refresh-spinner-spoke"
            style={{ animationDelay: `${index * 0.125 - 1}s` }}
            transform={`rotate(${angle} 12 12)`}
            x1="12"
            x2="12"
            y1="2"
            y2="6"
          />
        ))}
      </svg>
    </>
  );
}

export default function ButtonRefresh({
  onClick,
  isRefreshing = false,
  className = '',
}: ButtonRefreshProps) {
  return (
    <Button
      onClick={onClick}
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      ariaLabel="Refresh"
      aria-busy={isRefreshing}
      className={cn(SHELL_ICON_BUTTON_CLASS, className)}
      tooltip="Refresh"
      withWrapper={false}
      icon={
        isRefreshing ? (
          <RefreshSpinner />
        ) : (
          <RefreshCw className={SHELL_ICON_CLASS} aria-hidden="true" />
        )
      }
    />
  );
}
