import type { ActivityKey, ActivitySource } from '@genfeedai/enums';

/** Activity fields required by server-owned integration services. */
export type ServerActivityCreateInput = {
  brandId: string;
  key: ActivityKey | string;
  organizationId: string;
  source: ActivitySource | string;
  userId?: string;
  value: string;
};

/** Narrow activity persistence boundary for server-owned domains. */
export interface ServerActivityWriter {
  create(input: ServerActivityCreateInput): Promise<unknown>;
}
