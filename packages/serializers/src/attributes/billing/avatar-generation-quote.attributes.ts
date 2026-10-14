import { createEntityAttributes } from '@genfeedai/helpers';

export const avatarGenerationQuoteAttributes: string[] = createEntityAttributes(
  ['billingMode', 'credits', 'estimatedSeconds', 'modelKey'],
);
