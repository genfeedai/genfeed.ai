import type { ReactNode } from 'react';

export interface SkillsCheckoutButtonProps {
  /** Idle label; replaced by a spinner while the checkout session starts. */
  children: ReactNode;
  className?: string;
}
