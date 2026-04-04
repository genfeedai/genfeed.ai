import { goalAttributes } from '@serializers/attributes/management/goal.attributes';
import { simpleConfig } from '@serializers/builders';

export const goalSerializerConfig = simpleConfig('goal', goalAttributes);
