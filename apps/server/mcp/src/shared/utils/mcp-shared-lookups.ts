import type { OrganizationOption } from '@genfeedai/contracts/interfaces';
import { SharedLookup } from './shared-lookup.util';

/** The same 60 s the identity cache keeps a session token's answer. */
const SHARED_LOOKUP_TTL_MS = 60_000;
const SHARED_LOOKUP_MAX_ENTRIES = 5_000;

/**
 * Account reads that every tool call of one connection would otherwise repeat.
 * One instance serves the whole process, so parallel calls share their answer
 * (#11452).
 */
export class McpSharedLookups {
  readonly organizationLists = new SharedLookup<OrganizationOption[]>(
    SHARED_LOOKUP_TTL_MS,
    SHARED_LOOKUP_MAX_ENTRIES,
  );
}
