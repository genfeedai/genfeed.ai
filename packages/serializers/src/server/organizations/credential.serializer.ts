import { buildSerializer } from '@serializers/builders';
import {
  credentialInstagramAudioSerializerConfig,
  credentialInstagramPagesSerializerConfig,
  credentialOAuthSerializerConfig,
  credentialSerializerConfig,
} from '@serializers/configs';
/** Excludes sensitive data */
export const { CredentialSerializer } = buildSerializer(
  'server',
  credentialSerializerConfig,
);

export const { CredentialOAuthSerializer } = buildSerializer(
  'server',
  credentialOAuthSerializerConfig,
);

export const { CredentialInstagramPagesSerializer } = buildSerializer(
  'server',
  credentialInstagramPagesSerializerConfig,
);

export const { CredentialInstagramAudioSerializer } = buildSerializer(
  'server',
  credentialInstagramAudioSerializerConfig,
);
