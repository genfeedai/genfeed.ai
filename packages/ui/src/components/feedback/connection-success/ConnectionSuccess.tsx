'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
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
    animation: connection-success-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 1150ms forwards;
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
  }
`;

export default function ConnectionSuccess({
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
