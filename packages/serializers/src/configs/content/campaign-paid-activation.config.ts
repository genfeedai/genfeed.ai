import { campaignPaidActivationAttributes } from '@serializers/attributes/content/campaign-paid-activation.attributes';
import { simpleConfig } from '@serializers/builders';

export const campaignPaidActivationSerializerConfig = simpleConfig(
  'campaign-paid-activation',
  campaignPaidActivationAttributes,
);
