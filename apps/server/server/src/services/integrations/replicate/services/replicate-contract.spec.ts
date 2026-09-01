import { ModelCategory } from '@genfeedai/enums';
import {
  classifyReplicateSchemaFamily,
  extractReplicateEndpointSchemas,
  isReplicateSchemaFamilyCompatible,
} from '@server/services/integrations/replicate/services/replicate-contract';

describe('Replicate provider contracts', () => {
  const openapi = {
    components: {
      schemas: {
        Input: {
          properties: { prompt: { type: 'string' } },
          type: 'object',
        },
        Output: { format: 'uri', type: 'string' },
      },
    },
  };

  it('extracts Replicate Input and Output component schemas', () => {
    expect(extractReplicateEndpointSchemas(openapi)).toEqual({
      input: openapi.components.schemas.Input,
      output: openapi.components.schemas.Output,
    });
  });

  it('classifies a valid schema using its detected registry category', () => {
    const schemas = extractReplicateEndpointSchemas(openapi);
    expect(
      classifyReplicateSchemaFamily(
        ModelCategory.IMAGE,
        schemas.input,
        schemas.output,
      ),
    ).toBe('replicate-image-v1');
  });

  it('rejects missing schema components and category mismatches', () => {
    expect(() => extractReplicateEndpointSchemas({})).toThrow();
    expect(
      isReplicateSchemaFamilyCompatible(
        ModelCategory.VIDEO,
        'replicate-image-v1',
      ),
    ).toBe(false);
  });
});
