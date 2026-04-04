import { linkAttributes } from '../../attributes';
import { brandAttributes } from '../../attributes/organizations/brand.attributes';
import { credentialAttributes } from '../../attributes/organizations/credential.attributes';
import { rel } from '../../builders';
import {
  ASSET_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

export const brandSerializerConfig = {
  attributes: brandAttributes,
  banner: ASSET_REL,
  credentials: rel('credential', credentialAttributes),
  links: rel('link', linkAttributes),
  logo: ASSET_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  references: ASSET_REL,
  type: 'brand',
  user: USER_REL,
};
