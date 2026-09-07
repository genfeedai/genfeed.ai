export interface GeneratePlanFormState {
  periodStart: string;
  periodEnd: string;
  itemCount: string;
  topics: string;
  /** Watched-advertiser IDs currently checked in the seed picker. */
  advertiserIds: string[];
  /** Followed-creator social source IDs currently checked in the seed picker. */
  sourceIds: string[];
  isImportedHistoryIncluded: boolean;
  isPatternsIncluded: boolean;
}

export interface GeneratePlanDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (form: GeneratePlanFormState) => Promise<void>;
}

export interface ContentPlansSectionProps {
  brandId?: string;
}
