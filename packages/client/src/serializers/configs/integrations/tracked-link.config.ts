import { trackedLinkAttributes } from '../../attributes/integrations/tracked-link.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '../../relationships';

export const trackedLinkSerializerConfig = {
  attributes: trackedLinkAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'tracked-link',
};
