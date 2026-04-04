import { leadAttributes } from '@serializers/attributes/admin/lead.attributes';
import { simpleConfig } from '@serializers/builders';

export const leadSerializerConfig = simpleConfig('lead', leadAttributes);
