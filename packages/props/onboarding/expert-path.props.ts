import type { KnowledgeSourceVersion } from '@genfeedai/client/models';
import type {
  IContentPlanItem,
  IExpertPositioningScore,
} from '@genfeedai/contracts/interfaces';

export interface ExpertStepHeaderProps {
  description: string;
  title: string;
}

export interface ExpertStepActionsProps {
  continueLabel?: string;
  isContinueDisabled?: boolean;
  isSubmitting?: boolean;
  onContinue: () => void;
  onSkip?: () => void;
}

export interface PositioningScorecardProps {
  score: IExpertPositioningScore;
}

/** One corpus source row with its current ingestion state. */
export interface CorpusSourceView {
  id: string;
  title: string;
  version?: KnowledgeSourceVersion;
}

export interface CorpusSourceListProps {
  retryingSourceId: string | null;
  sources: CorpusSourceView[];
  onRetry: (sourceId: string) => void;
}

export interface FirstSystemItemRowProps {
  connectToSchedulePlatforms: string[];
  isBusy: boolean;
  item: IContentPlanItem;
  onApprove: (item: IContentPlanItem) => void;
  onEdit: (item: IContentPlanItem, topic: string) => void;
  onReject: (item: IContentPlanItem) => void;
}
