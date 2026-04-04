import { modelAttributes } from '@serializers/attributes/collections/model.attributes';
import { simpleConfig } from '@serializers/builders';

export const modelSerializerConfig = simpleConfig('model', modelAttributes);
