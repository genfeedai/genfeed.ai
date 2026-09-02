import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  Credential,
  CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';

export type { Credential } from '@genfeedai/prisma';

/** Canonical credential row shape shared across server runtimes. */
export type CredentialDocument = Credential;

type CredentialDateQuery = {
  equals?: Date | null;
  gt?: Date;
  gte?: Date;
  lt?: Date;
  lte?: Date;
  not?: Date | null;
};

/**
 * Provider-facing credential lookup fields.
 *
 * Domain callers use lowercase `CredentialPlatform` values while the concrete
 * store also accepts Prisma's persisted enum values at its normalization
 * boundary. Keeping both here preserves that intentional boundary without
 * exposing the API service's generic query implementation.
 */
export type CredentialQuery = Partial<{
  accessTokenExpiry: Date | null | CredentialDateQuery;
  brandId: string | null;
  externalId: string | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  oauthState: string | null;
  oauthTokenHash: string | null;
  organizationId: string | null;
  platform: CredentialPlatform | PrismaCredentialPlatform;
  updatedAt: Date | CredentialDateQuery;
  userId: string | null;
}>;

export type CredentialFindAllQuery = {
  where?: CredentialQuery;
};

export type CredentialFindAllOptions = {
  [key: string]: unknown;
  limit?: number;
  page?: number;
  pagination?: boolean;
  sort?: Record<string, 1 | -1>;
};

export type CredentialFindAllResult = {
  docs: CredentialDocument[];
};

/** Provider-owned fields that may be updated through the credential port. */
export type CredentialPatch = Partial<
  Omit<
    CredentialDocument,
    | 'brandId'
    | 'createdAt'
    | 'id'
    | 'organizationId'
    | 'platform'
    | 'updatedAt'
    | 'userId'
  >
> & {
  tagIds?: string[];
};

/** The account identity a provider operation resolves within one tenant. */
export type ResolveBrandAccountOptions = {
  brandId: string;
  credentialId?: string | null;
  /** Token-repair paths may include a connection whose auth has lapsed. */
  isDisconnectedIncluded?: boolean;
  organizationId: string;
  platform: CredentialPlatform;
};
