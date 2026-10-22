import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type { CrunVideoQuoteRequest } from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';

export interface CrunVideoPromptBinding {
  prepareRequest: (draft: PromptTextareaSchema) => CrunVideoQuoteRequest | null;
  submit: (
    request: CrunVideoQuoteRequest & { crunQuoteId: string },
  ) => Promise<void>;
}
