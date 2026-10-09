import { knowledgeSourceVersionAttributes } from '@serializers/attributes/content/knowledge-source-version.attributes';

export const knowledgeSourceVersionSerializerConfig = {
  attributes: knowledgeSourceVersionAttributes,
  type: 'knowledge-source-version',
  attributeTransforms: {
    provenance: (record: Record<string, unknown>) => {
      const value = record.provenance;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
      const { initiatingActor: _authorizationProof, ...publicProvenance } =
        value as Record<string, unknown>;
      return publicProvenance;
    },
  },
};
