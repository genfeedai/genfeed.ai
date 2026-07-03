import { buildSerializer } from '@serializers/builders';
import {
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
