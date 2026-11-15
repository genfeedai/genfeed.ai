import { createEntityAttributes } from '@genfeedai/helpers';

export const waitlistEntryAttributes = createEntityAttributes([
  'email',
  'name',
  'website',
  'useCase',
  'status',
  'reviewNote',
  'reviewedAt',
  'reviewedByUserId',
  'referrerDomain',
  'createdAt',
  'updatedAt',
]);
