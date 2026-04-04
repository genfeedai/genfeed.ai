import {
  type BuiltSerializer,
  brandSerializerConfig,
  buildSingleSerializer,
  credentialFullSerializerConfig,
  credentialInstagramPagesSerializerConfig,
  credentialOAuthSerializerConfig,
  credentialSerializerConfig,
  memberSerializerConfig,
  organizationSerializerConfig,
  organizationSettingsSerializerConfig,
} from '..';

// Build all organization serializers
export const BrandSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  brandSerializerConfig,
);
export const CredentialSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  credentialSerializerConfig,
);
export const CredentialFullSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  credentialFullSerializerConfig,
);
export const CredentialOAuthSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  credentialOAuthSerializerConfig,
);
export const CredentialInstagramPagesSerializer: BuiltSerializer =
  buildSingleSerializer('client', credentialInstagramPagesSerializerConfig);
export const MemberInvitationSerializer: BuiltSerializer =
  buildSingleSerializer('client', {
    attributes: ['email', 'firstName', 'lastName', 'role'],
    type: 'member-invitation',
  });
export const MemberSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  memberSerializerConfig,
);
export const OrganizationSettingSerializer: BuiltSerializer =
  buildSingleSerializer('client', organizationSettingsSerializerConfig);
export const OrganizationSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  organizationSerializerConfig,
);
