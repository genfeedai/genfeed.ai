import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** `grid` fills the width with cards; `row` is one compact scrolling row. */
export type StudioPresetLayout = 'grid' | 'row';

/** Hero block shown above preset cards on a studio app's first-run landing. */
export interface StudioOnboardingHeroProps {
  /** Optional primary action rendered under the description. */
  actions?: ReactNode;
  description: string;
  /** Decorative illustration built from design-token elements. */
  illustration: ReactNode;
  testId: string;
  title: string;
}

/** List wrapper that lays preset cards out as a grid or a scrolling row. */
export interface StudioPresetListProps {
  ariaLabel: string;
  children: ReactNode;
  layout?: StudioPresetLayout;
  testId: string;
}

/**
 * One preset card. Provide `onSelect` for an in-place action or `href` for
 * navigation; `href` wins when both are set.
 */
export interface StudioPresetCardProps {
  actionAriaLabel: string;
  actionLabel: string;
  /** Short facts such as format, duration or count. */
  chips: readonly string[];
  description: string;
  href?: string;
  icon: LucideIcon;
  /** Decorative illustration built from design-token elements. */
  illustration: ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  layout?: StudioPresetLayout;
  onSelect?: () => void;
  testId: string;
  title: string;
}

/** Collapsed preset row for returning users that expands to the full grid. */
export interface StudioPresetShelfProps<TPreset> {
  /** How many presets show while the shelf is collapsed. */
  collapsedCount?: number;
  presets: readonly TPreset[];
  renderPresets: (
    presets: readonly TPreset[],
    layout: StudioPresetLayout,
  ) => ReactNode;
  seeAllLabel: string;
  showFewerLabel: string;
  title: string;
}
