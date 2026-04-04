import { knowledgeBaseAttributes } from '@serializers/attributes/organizations/knowledge-base.attributes';
import { simpleConfig } from '@serializers/builders';

export const knowledgeBaseSerializerConfig = simpleConfig(
  'knowledge-base',
  knowledgeBaseAttributes,
);
