import { brandIdentityPreviewAttributes } from '@serializers/attributes/content/brand-identity-preview.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandIdentityPreviewSerializerConfig = simpleConfig(
  'brand-identity-preview',
  brandIdentityPreviewAttributes,
);
