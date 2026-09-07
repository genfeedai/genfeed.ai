import type { ReactNode } from 'react';

export type CreditTopUpPanelProps = {
  helperContent?: ReactNode;
  isSubmitDisabled?: boolean;
  isStartingCheckout: boolean;
  /** Rendered next to the primary submit button (e.g. secondary portal link). */
  secondaryAction?: ReactNode;
  submitLabel?: string;
  title?: string;
  onSubmit: (selection: {
    credits: number;
    usd: number;
  }) => void | Promise<void>;
};
