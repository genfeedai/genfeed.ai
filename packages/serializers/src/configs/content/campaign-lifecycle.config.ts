import { campaignLifecycleAttributes } from '@serializers/attributes/content/campaign-lifecycle.attributes';
import { simpleConfig } from '@serializers/builders';

export const campaignLifecycleSerializerConfig = simpleConfig(
  'campaign-lifecycle',
  campaignLifecycleAttributes,
);
