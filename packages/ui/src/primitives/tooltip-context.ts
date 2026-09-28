import { type ComponentType, createContext } from 'react';
import type { SimpleTooltipProps } from './tooltip.types';

/**
 * Set by `TooltipProvider`. It carries `SimpleTooltip` itself, so a `Button`
 * under a provider can render its tooltip without importing Radix Tooltip.
 * Only the provider's module imports Radix; a page with no provider (the
 * website) never downloads it unless a tooltip is actually rendered.
 */
export const TooltipProviderContext =
  createContext<ComponentType<SimpleTooltipProps> | null>(null);
