import {
  resolveOpenapiProperties,
  resolveOpenapiProperty,
} from '@workers/services/openapi-property.util';

const openapi = {
  components: {
    schemas: {
      mode: { enum: ['standard', 'pro'], title: 'mode', type: 'string' },
      quality: { enum: ['low', 'medium', 'high'], type: 'string' },
    },
  },
};

describe('resolveOpenapiProperty', () => {
  it('merges an allOf $ref enum while property-level keys win', () => {
    expect(
      resolveOpenapiProperty(
        {
          allOf: [{ $ref: '#/components/schemas/mode' }],
          default: 'standard',
          title: 'Mode',
        },
        openapi,
      ),
    ).toMatchObject({
      default: 'standard',
      enum: ['standard', 'pro'],
      title: 'Mode',
      type: 'string',
    });
  });

  it('takes the single non-null member of a nullable anyOf', () => {
    expect(
      resolveOpenapiProperty(
        {
          anyOf: [{ $ref: '#/components/schemas/quality' }, { type: 'null' }],
        },
        openapi,
      ),
    ).toMatchObject({ enum: ['low', 'medium', 'high'], type: 'string' });
  });

  it('leaves an unknown or cyclic $ref unresolved instead of looping', () => {
    const cyclic = {
      components: { schemas: { loop: { $ref: '#/components/schemas/loop' } } },
    };
    expect(
      resolveOpenapiProperty({ $ref: '#/components/schemas/loop' }, cyclic),
    ).toEqual({ $ref: '#/components/schemas/loop' });
    expect(
      resolveOpenapiProperty({ $ref: '#/components/schemas/missing' }, openapi),
    ).toEqual({ $ref: '#/components/schemas/missing' });
  });

  it('resolves every property of an input schema', () => {
    expect(
      resolveOpenapiProperties(
        {
          prompt: { type: 'string' },
          quality: { allOf: [{ $ref: '#/components/schemas/quality' }] },
        },
        openapi,
      ),
    ).toMatchObject({
      prompt: { type: 'string' },
      quality: { enum: ['low', 'medium', 'high'], type: 'string' },
    });
  });
});
