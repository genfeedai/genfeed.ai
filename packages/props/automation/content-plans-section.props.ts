export interface GeneratePlanFormState {
  periodStart: string;
  periodEnd: string;
  itemCount: string;
  topics: string;
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
