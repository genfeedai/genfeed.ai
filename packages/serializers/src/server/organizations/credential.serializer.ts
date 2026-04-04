import { buildSerializer } from '@serializers/builders';
import {
  credentialFullSerializerConfig,
  credentialInstagramPagesSerializerConfig,
  credentialOAuthSerializerConfig,
  credentialSerializerConfig,
} from '@serializers/configs';

/** Excludes sensitive data */
export const { CredentialSerializer } = buildSerializer(
  'server',
  credentialSerializerConfig,
);

/** Includes sensitive data */
export const { CredentialFullSerializer } = buildSerializer(
  'server',
  credentialFullSerializerConfig,
);

export const { CredentialOAuthSerializer } = buildSerializer(
  'server',
  credentialOAuthSerializerConfig,
);

export const { CredentialInstagramPagesSerializer } = buildSerializer(
  'server',
  credentialInstagramPagesSerializerConfig,
);
