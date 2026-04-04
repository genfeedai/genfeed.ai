import { knowledgeBaseAttributes } from '../../attributes/organizations/knowledge-base.attributes';
import { simpleConfig } from '../../builders';

export const knowledgeBaseSerializerConfig = simpleConfig(
  'knowledge-base',
  knowledgeBaseAttributes,
);
