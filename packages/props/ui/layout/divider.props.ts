export type DividerSpacing = 'none' | 'sm' | 'md' | 'lg';
export type DividerVariant = 'gradient' | 'solid' | 'vertical';

export interface GradientDividerProps {
  /** Additional CSS classes */
  className?: string;
  /** Vertical margin spacing */
  spacing?: DividerSpacing;
  /** Divider style variant */
  variant?: DividerVariant;
}
