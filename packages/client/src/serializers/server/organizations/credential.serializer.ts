import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import {
  credentialFullSerializerConfig,
  credentialInstagramPagesSerializerConfig,
  credentialOAuthSerializerConfig,
  credentialSerializerConfig,
} from '../../configs';

/** Excludes sensitive data */
export const CredentialSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  credentialSerializerConfig,
);

/** Includes sensitive data */
export const CredentialFullSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  credentialFullSerializerConfig,
);

export const CredentialOAuthSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  credentialOAuthSerializerConfig,
);

export const CredentialInstagramPagesSerializer: BuiltSerializer =
  buildSingleSerializer('server', credentialInstagramPagesSerializerConfig);
