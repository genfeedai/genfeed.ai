import { VoiceProvider } from '@genfeedai/enums';
import {
  VoiceProvider as DbVoiceProvider,
  type ExternalVoice,
} from '@genfeedai/prisma';

export interface VoiceCatalogEntryDocument {
  id: string;
  provider: string;
  externalVoiceId: string;
  name: string;
  sampleAudioUrl: string | null;
  language: string | null;
  isActive: boolean;
  isDefaultSelectable: boolean;
  isFeatured: boolean;
  providerData: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export type SyncableDbVoiceProvider =
  | typeof DbVoiceProvider.ELEVENLABS
  | typeof DbVoiceProvider.HEYGEN;

const APP_TO_DB_PROVIDER: Record<VoiceProvider, DbVoiceProvider> = {
  [VoiceProvider.ELEVENLABS]: DbVoiceProvider.ELEVENLABS,
  [VoiceProvider.GENFEED_AI]: DbVoiceProvider.GENFEED_AI,
  [VoiceProvider.HEDRA]: DbVoiceProvider.HEDRA,
  [VoiceProvider.HEYGEN]: DbVoiceProvider.HEYGEN,
};

const DB_TO_APP_PROVIDER: Record<DbVoiceProvider, VoiceProvider> = {
  [DbVoiceProvider.ELEVENLABS]: VoiceProvider.ELEVENLABS,
  [DbVoiceProvider.GENFEED_AI]: VoiceProvider.GENFEED_AI,
  [DbVoiceProvider.HEDRA]: VoiceProvider.HEDRA,
  [DbVoiceProvider.HEYGEN]: VoiceProvider.HEYGEN,
};

const SYNCABLE_CATALOG_PROVIDERS: SyncableDbVoiceProvider[] = [
  DbVoiceProvider.ELEVENLABS,
  DbVoiceProvider.HEYGEN,
];
const SYNCABLE_CATALOG_PROVIDER_SET = new Set<DbVoiceProvider>(
  SYNCABLE_CATALOG_PROVIDERS,
);

const SUPPORTED_LIBRARY_PROVIDERS = new Set<VoiceProvider>([
  VoiceProvider.ELEVENLABS,
  VoiceProvider.HEYGEN,
  VoiceProvider.GENFEED_AI,
]);

export function parseVoiceCatalogProvider(
  value?: string,
): SyncableDbVoiceProvider | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return SYNCABLE_CATALOG_PROVIDERS.find((provider) => provider === normalized);
}

export function parseVoiceCatalogProviders(
  providers?: VoiceProvider[],
): SyncableDbVoiceProvider[] {
  if (!providers || providers.length === 0) {
    return [...SYNCABLE_CATALOG_PROVIDERS];
  }

  const parsed = providers
    .map((provider) => APP_TO_DB_PROVIDER[provider])
    .filter((provider): provider is SyncableDbVoiceProvider =>
      SYNCABLE_CATALOG_PROVIDER_SET.has(provider),
    );

  return parsed.length > 0 ? parsed : [...SYNCABLE_CATALOG_PROVIDERS];
}

export function parseVoiceProviders(
  providers?: string | VoiceProvider[],
): VoiceProvider[] {
  if (!providers) {
    return [...SUPPORTED_LIBRARY_PROVIDERS];
  }

  const rawProviders = Array.isArray(providers)
    ? providers
    : providers.split(',');
  const parsedProviders = rawProviders
    .map((value) => value.trim())
    .filter((value): value is VoiceProvider =>
      SUPPORTED_LIBRARY_PROVIDERS.has(value as VoiceProvider),
    );

  return parsedProviders.length > 0
    ? parsedProviders
    : [...SUPPORTED_LIBRARY_PROVIDERS];
}

export function toVoiceCatalogWireFormat(
  voice: ExternalVoice,
): VoiceCatalogEntryDocument {
  return {
    id: voice.id,
    createdAt: voice.createdAt,
    externalVoiceId: voice.externalId,
    isActive: voice.isActive,
    isDefaultSelectable: voice.isDefaultSelectable,
    isFeatured: voice.isFeatured,
    language: voice.language,
    name: voice.name,
    providerData: voice.providerData,
    provider: DB_TO_APP_PROVIDER[voice.externalProvider],
    sampleAudioUrl: voice.sampleAudioUrl,
    updatedAt: voice.updatedAt,
  };
}
