import type {
  HeyGenCatalogVoice,
  HeyGenConnectionRef,
} from '@genfeedai/contracts/interfaces';

export interface HeyGenVoiceCatalogConnection {
  apiKey: string;
  binding: HeyGenConnectionRef;
}

export interface HeyGenPersonalVoiceCredential {
  apiKey: string;
  credentialId: string;
}

export interface HeyGenVoiceListingWarning {
  error: string;
}

export interface HeyGenVoiceListing {
  constructorName: string;
  getPlatformApiKey: () => string;
  lookupPersonalCredential: (
    organizationId: string,
  ) => Promise<HeyGenPersonalVoiceCredential | undefined>;
  platformCredentialVersion: (apiKey: string) => string;
  readVoiceCatalog: (
    connection: HeyGenVoiceCatalogConnection,
    ownership?: 'public' | 'private',
  ) => Promise<HeyGenCatalogVoice[]>;
  warn: (message: string, context: HeyGenVoiceListingWarning) => void;
}

/** Stock voices on the platform key, read live (the sync and DB fallback). */
export async function listPublicHeyGenVoices(
  listing: HeyGenVoiceListing,
  organizationId: string,
): Promise<HeyGenCatalogVoice[]> {
  const apiKey = listing.getPlatformApiKey();
  // No platform key means no stock voices, not a failure: a workspace with
  // its own key still lists its voices.
  if (!apiKey) return [];
  return listing.readVoiceCatalog(
    {
      apiKey,
      binding: {
        provider: 'heygen',
        kind: 'platform',
        organizationId,
        credentialVersionId: listing.platformCredentialVersion(apiKey),
      },
    },
    'public',
  );
}

/** The workspace's own HeyGen voices; empty without an entitled BYOK key. */
export async function listPersonalHeyGenVoices(
  listing: HeyGenVoiceListing,
  organizationId: string,
): Promise<HeyGenCatalogVoice[]> {
  // Lookup failure is not absence: let a storage error surface.
  const credential = await listing.lookupPersonalCredential(organizationId);
  if (!credential) return [];
  // Stock voices stay usable when the workspace's own listing fails.
  try {
    return await listing.readVoiceCatalog(
      {
        apiKey: credential.apiKey,
        binding: {
          provider: 'heygen',
          kind: 'byok',
          organizationId,
          credentialVersionId: credential.credentialId,
        },
      },
      'private',
    );
  } catch (error: unknown) {
    listing.warn(`${listing.constructorName} personal voices unavailable`, {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}
