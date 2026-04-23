import type { Credential } from '@genfeedai/prisma';

export type { Credential } from '@genfeedai/prisma';

export interface CredentialDocument extends Credential {
  _id: string;
  avatar?: string | null;
  brand?: string | null;
  handle?: string | null;
  name?: string | null;
  organization?: string | null;
  user?: string | null;
  [key: string]: unknown;
}
