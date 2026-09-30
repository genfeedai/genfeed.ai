import { storyboardRunAttributes } from '@serializers/attributes/content/storyboard-run.attributes';
import { simpleConfig } from '@serializers/builders';
export const storyboardRunSerializerConfig = simpleConfig(
  'storyboard-run',
  storyboardRunAttributes,
);
