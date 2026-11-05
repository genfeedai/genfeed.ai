'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Avatar } from '@ui/primitives/avatar';
import type { ConnectionSuccessProps } from '@genfeedai/props/ui/feedback/connection-success.props';
import { useEffect, useRef } from 'react';

const TRACE_SHAPES = 'path, circle, ellipse, line, polygon, polyline, rect';

/**
 * Same language as BrandMark: the logo outline traces in, the filled mark
 * settles over it, then a success check pops in. Plays once.
 */
const ANIMATION_STYLES = `
  .connection-success-disc {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  .connection-success-ring {
    border: 2px solid currentColor;
    opacity: 0;
    animation: connection-success-ring 900ms cubic-bezier(0.22, 1, 0.36, 1) 900ms both;
  }

  .connection-success-trace {
    opacity: 0;
  }

  .connection-success-trace[data-ready='true'] {
    animation: connection-success-trace 1300ms ease both;
  }

  .connection-success-trace svg * {
    fill: none !important;
    stroke: currentColor;
    stroke-width: 1.5px;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    vector-effect: non-scaling-stroke;
  }

  .connection-success-trace[data-ready='true'] svg * {
    animation: connection-success-draw 950ms cubic-bezier(0.72, 0, 0.2, 1) 120ms forwards;
  }

  .connection-success-fill {
    opacity: 0;
    transform: scale(0.92);
    animation: connection-success-pop 500ms cubic-bezier(0.22, 1, 0.36, 1) 820ms forwards;
  }

  .connection-success-badge {
    opacity: 0;
    transform: scale(0.4);
    animation: connection-success-pop 420ms cubic-bezier(0.32, 0.72, 0, 1) 1150ms forwards;
  }

  .connection-success-check {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: connection-success-draw 320ms ease-out 1350ms forwards;
  }

  .connection-success-avatar {
    opacity: 0;
    transform: scale(0.8);
    animation: connection-success-pop 520ms cubic-bezier(0.22, 1, 0.36, 1) 150ms forwards;
  }

  .connection-success-avatar-brand {
    opacity: 0;
    transform: scale(0.4);
    animation: connection-success-pop 420ms cubic-bezier(0.32, 0.72, 0, 1) 650ms forwards;
  }

  .connection-success-avatar-ring {
    border: 2px solid currentColor;
    opacity: 0;
    animation: connection-success-ring 900ms cubic-bezier(0.22, 1, 0.36, 1) 500ms both;
  }

  .connection-success-avatar-check {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: connection-success-draw 320ms ease-out 1100ms forwards;
  }

  .connection-success-avatar-badge {
    opacity: 0;
    transform: scale(0.4);
    animation: connection-success-pop 420ms cubic-bezier(0.32, 0.72, 0, 1) 900ms forwards;
  }

  @keyframes connection-success-draw {
    to { stroke-dashoffset: 0; }
  }

  @keyframes connection-success-trace {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes connection-success-pop {
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes connection-success-ring {
    0% { opacity: 0.5; transform: scale(0.85); }
    100% { opacity: 0; transform: scale(1.35); }
  }

  @media (prefers-reduced-motion: reduce) {
    .connection-success-ring,
    .connection-success-trace { display: none; }
    .connection-success-fill,
    .connection-success-badge { animation: none; opacity: 1; transform: none; }
    .connection-success-check { animation: none; stroke-dashoffset: 0; }
    .connection-success-avatar-ring { display: none; }
    .connection-success-avatar,
    .connection-success-avatar-brand,
    .connection-success-avatar-badge { animation: none; opacity: 1; transform: none; }
    .connection-success-avatar-check { animation: none; stroke-dashoffset: 0; }
  }
`;

export default function ConnectionSuccess({
  account,
  brand,
  className,
  description,
  title,
}: ConnectionSuccessProps) {
  const traceRef = useRef<HTMLSpanElement>(null);
  const { color, Icon } = brand;

  // Brand icons ship as filled glyphs of arbitrary length; normalizing every
  // shape to pathLength=1 lets one dash animation trace any logo.
  useEffect(() => {
    const trace = traceRef.current;
    if (!trace) {
      return;
    }

    for (const shape of trace.querySelectorAll(TRACE_SHAPES)) {
      shape.setAttribute('pathLength', '1');
    }
    trace.dataset.ready = 'true';
  }, []);

  const hasAccount = Boolean(account?.avatarUrl || account?.name);

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 text-center text-foreground',
        className,
      )}
    >
      {/* Hoisted to <head>: an in-place <style> breaks hydration (#6601). */}
      <style href="genfeed-connection-success" precedence="genfeed-component">
        {ANIMATION_STYLES}
      </style>
      {hasAccount ? (
        <div
          aria-hidden="true"
          className="relative size-24"
          data-connection-account=""
          data-connection-brand={brand.name}
          style={color ? { color } : undefined}
        >
          <span className="connection-success-avatar-ring absolute inset-0 rounded-full" />
          <Avatar
            className="connection-success-avatar size-24"
            name={account?.name}
            size="2xl"
            src={account?.avatarUrl}
          />
          <span
            className="connection-success-avatar-brand absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-background p-1.5 ring-4 ring-background"
            data-connection-platform={brand.name}
          >
            <Icon className="size-full" />
          </span>
          <span className="connection-success-avatar-badge absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-success text-success-foreground ring-4 ring-background">
            <svg className="size-3.5" viewBox="0 0 24 24">
              <path
                className="connection-success-avatar-check"
                d="M5 12.5l4.5 4.5L19 7.5"
                pathLength="1"
              />
            </svg>
          </span>
        </div>
      ) : (
      <div
        aria-hidden="true"
        className="relative size-24"
        data-connection-brand={brand.name}
        style={color ? { color } : undefined}
      >
        <span className="connection-success-disc absolute inset-0 rounded-full" />
        <span className="connection-success-ring absolute inset-0 rounded-full" />
        <span className="connection-success-fill absolute inset-[22%]">
          <Icon className="size-full" />
        </span>
        <span
          className="connection-success-trace absolute inset-[22%]"
          ref={traceRef}
        >
          <Icon className="size-full" />
        </span>
        <span className="connection-success-badge absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-success text-success-foreground ring-4 ring-background">
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              className="connection-success-check"
              d="M5 12.5l4.5 4.5L19 7.5"
              pathLength="1"
            />
          </svg>
        </span>
      </div>
      )}
      <output aria-live="polite" className="block space-y-1">
        <span className="block text-base font-semibold">{title}</span>
        {description ? (
          <span className="block text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </output>
    </div>
  );
}
