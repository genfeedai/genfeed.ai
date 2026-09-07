export type TextSectionProps = {
  enabledModelIds: string[];
  defaultModel: string;
  defaultModelReview: string;
  defaultModelUpdate: string;
  onDefaultModelChange: (value: string) => void;
  onDefaultModelReviewChange: (value: string) => void;
  onDefaultModelUpdateChange: (value: string) => void;
};
