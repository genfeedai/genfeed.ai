import { promptAttributes } from '@serializers/attributes/collections/prompt.attributes';
import { simpleConfig } from '@serializers/builders';

export const promptSerializerConfig = simpleConfig('prompt', promptAttributes);
