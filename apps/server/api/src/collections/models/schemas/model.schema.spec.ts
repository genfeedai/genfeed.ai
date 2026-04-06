import { ModelSchema } from '@api/collections/models/schemas/model.schema';

describe('ModelSchema', () => {
  it('should be defined', () => {
    expect(ModelSchema).toBeDefined();
  });

  describe('Dynamic Registry Fields (v6)', () => {
    it('should have organization field with ref Organization and default null', () => {
      const path = ModelSchema.path('organization');
      expect(path).toBeDefined();
      expect((path as { options: Record<string, unknown> }).options.ref).toBe(
        'Organization',
      );
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });

    it('should have training field with ref Training and default null', () => {
      const path = ModelSchema.path('training');
      expect(path).toBeDefined();
      expect((path as { options: Record<string, unknown> }).options.ref).toBe(
        'Training',
      );
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });

    it('should have parentModel field with ref Model and default null', () => {
      const path = ModelSchema.path('parentModel');
      expect(path).toBeDefined();
      expect((path as { options: Record<string, unknown> }).options.ref).toBe(
        'Model',
      );
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });

    it('should have providerModelId String field with default null', () => {
      const path = ModelSchema.path('providerModelId');
      expect(path).toBeDefined();
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });

    it('should have providerConfig Mixed field with default null', () => {
      const path = ModelSchema.path('providerConfig');
      expect(path).toBeDefined();
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });

    it('should have triggerWord String field with default null', () => {
      const path = ModelSchema.path('triggerWord');
      expect(path).toBeDefined();
      expect(
        (path as { options: Record<string, unknown> }).options.default,
      ).toBeNull();
    });
  });
});
