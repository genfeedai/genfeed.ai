import type { CredentialPlatform } from '@genfeedai/enums';
import type {
  CredentialDocument,
  CredentialFindAllOptions,
  CredentialFindAllQuery,
  CredentialFindAllResult,
  CredentialPatch,
  CredentialQuery,
  ResolveBrandAccountOptions,
} from './credential.types';

/** Provider-facing credential persistence boundary. */
export interface ServerCredentialStore {
  findAll(
    query: CredentialFindAllQuery,
    options: CredentialFindAllOptions,
  ): Promise<CredentialFindAllResult>;
  findBrandAccounts(
    organizationId: string,
    brandId: string,
    platform: CredentialPlatform,
  ): Promise<CredentialDocument[]>;
  findOne(query: CredentialQuery): Promise<CredentialDocument | null>;
  mergeWarmupSignals(
    id: string,
    organizationId: string,
    signals: Record<string, unknown>,
  ): Promise<void>;
  patch(id: string, update: CredentialPatch): Promise<CredentialDocument>;
  resolveBrandAccount(
    options: ResolveBrandAccountOptions,
  ): Promise<CredentialDocument | null>;
}
