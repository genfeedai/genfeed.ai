import type { HTMLAttributes, ReactNode } from 'react';

export interface WebSectionProps extends HTMLAttributes<HTMLElement> {
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Background variant */
  bg?: 'default' | 'subtle' | 'bordered';
  /** Vertical padding */
  py?: 'md' | 'lg' | 'xl';
}

export interface CtaSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  bg?: 'default' | 'subtle';
  /** Content rendered between description and buttons */
  beforeButtons?: ReactNode;
}
