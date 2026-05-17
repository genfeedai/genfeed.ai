import type { GenerationType } from '@genfeedai/enums';
import type { AppContext } from '@genfeedai/interfaces';

export interface MergedSwitcherProps {
  orgSlug: string;
  brandSlug?: string;
  currentApp: AppContext;
  currentGenerationType?: GenerationType;
  onGenerationTypeChange?: (type: GenerationType) => void;
  preservedSearch?: string;
}
