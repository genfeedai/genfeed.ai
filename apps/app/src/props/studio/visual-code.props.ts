import type {
  IVisualCodeQuote,
  VisualCodeQuoteRequest,
} from '@genfeedai/contracts/interfaces';
export interface UseVisualProjectsOptions {
  brandId?: string;
  projectId?: string;
}
export interface VisualCodeQuoteReview {
  request: VisualCodeQuoteRequest;
  quote: IVisualCodeQuote;
}
