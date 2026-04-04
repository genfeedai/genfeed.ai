import { roleAttributes } from '@serializers/attributes/collections/role.attributes';
import { simpleConfig } from '@serializers/builders';

export const roleSerializerConfig = simpleConfig('role', roleAttributes);
