import { mapSerializedCredentialPlatform } from '@serializers/attributes/organizations/credential.attributes';
import { buildSerializer } from '@serializers/builders';
import {
  credentialInstagramPagesSerializerConfig,
  credentialOAuthSerializerConfig,
  credentialSerializerConfig,
} from '@serializers/configs';
import type { ISerializer } from '@serializers/interfaces';

function mapCredentialPlatformForSerialize(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => mapCredentialPlatformForSerialize(item));
  }

  if (!data || typeof data !== 'object') {
    return data;
  }

  const record = data as { platform?: unknown };
  if (typeof record.platform !== 'string') {
    return data;
  }

  return {
    ...record,
    platform: mapSerializedCredentialPlatform(record),
  };
}

function withMappedCredentialPlatform(serializer: ISerializer): ISerializer {
  const originalSerialize = serializer.serialize.bind(serializer);
  serializer.serialize = (data: unknown) =>
    originalSerialize(mapCredentialPlatformForSerialize(data));
  return serializer;
}

/** Excludes sensitive data */
const credentialSerializers = buildSerializer(
  'server',
  credentialSerializerConfig,
);
export const CredentialSerializer = withMappedCredentialPlatform(
  credentialSerializers.CredentialSerializer,
);

export const { CredentialOAuthSerializer } = buildSerializer(
  'server',
  credentialOAuthSerializerConfig,
);

const instagramPageSerializers = buildSerializer(
  'server',
  credentialInstagramPagesSerializerConfig,
);
export const CredentialInstagramPagesSerializer = withMappedCredentialPlatform(
  instagramPageSerializers.CredentialInstagramPagesSerializer,
);
