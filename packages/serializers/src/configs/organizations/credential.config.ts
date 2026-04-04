import {
  credentialAttributes,
  credentialFullAttributes,
  credentialInstagramAttributes,
  credentialOAuthAttributes,
} from '@serializers/attributes/organizations/credential.attributes';
import { simpleConfig } from '@serializers/builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  TAG_REL,
  USER_REL,
} from '@serializers/relationships';

const baseRelationships = {
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  tags: TAG_REL,
  user: USER_REL,
};

export const credentialSerializerConfig = {
  attributes: credentialAttributes,
  type: 'credential',
  ...baseRelationships,
};

export const credentialFullSerializerConfig = {
  attributes: credentialFullAttributes,
  type: 'credential-full',
  ...baseRelationships,
};

export const credentialOAuthSerializerConfig = simpleConfig(
  'credential-o-auth',
  credentialOAuthAttributes,
);

export const credentialInstagramPagesSerializerConfig = simpleConfig(
  'credential-instagram-pages',
  credentialInstagramAttributes,
);
