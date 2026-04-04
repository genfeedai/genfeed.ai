import {
  buildSerializer,
  createSerializerConfig,
  nestedRel,
  rel,
  simpleConfig,
} from '@serializers/builders/serializer.builder';

describe('serializer.builder', () => {
  describe('simpleConfig', () => {
    it('should create a simple config with type and attributes', () => {
      const config = simpleConfig('user', ['name', 'email']);
      expect(config).toEqual({
        attributes: ['name', 'email'],
        type: 'user',
      });
    });

    it('should handle empty attributes array', () => {
      const config = simpleConfig('user', []);
      expect(config).toEqual({
        attributes: [],
        type: 'user',
      });
    });
  });

  describe('rel', () => {
    it('should create a relationship with _id reference', () => {
      const relationship = rel('user', ['name', 'email']);
      expect(relationship).toEqual({
        attributes: ['name', 'email'],
        ref: '_id',
        type: 'user',
      });
    });

    it('should handle empty attributes', () => {
      const relationship = rel('user', []);
      expect(relationship).toEqual({
        attributes: [],
        ref: '_id',
        type: 'user',
      });
    });
  });

  describe('nestedRel', () => {
    it('should create a nested relationship with child relationships', () => {
      const nested = nestedRel('post', ['title', 'content'], {
        author: rel('user', ['name']),
      });

      expect(nested).toEqual({
        attributes: ['title', 'content'],
        author: {
          attributes: ['name'],
          ref: '_id',
          type: 'user',
        },
        ref: '_id',
        type: 'post',
      });
    });

    it('should handle multiple nested relationships', () => {
      const nested = nestedRel('post', ['title'], {
        author: rel('user', ['name']),
        category: rel('category', ['label']),
      });

      expect(nested).toMatchObject({
        attributes: ['title'],
        author: { type: 'user' },
        category: { type: 'category' },
        type: 'post',
      });
    });

    it('should handle empty nested relationships', () => {
      const nested = nestedRel('post', ['title'], {});
      expect(nested).toEqual({
        attributes: ['title'],
        ref: '_id',
        type: 'post',
      });
    });
  });

  describe('createSerializerConfig', () => {
    it('should create config with type and attributes only', () => {
      const config = createSerializerConfig('user', ['name', 'email']);
      expect(config).toEqual({
        attributes: ['name', 'email'],
        type: 'user',
      });
    });

    it('should create config with relationships', () => {
      const config = createSerializerConfig('post', ['title'], {
        author: rel('user', ['name']),
      });
      expect(config).toMatchObject({
        attributes: ['title'],
        author: { attributes: ['name'], ref: '_id', type: 'user' },
        type: 'post',
      });
    });

    it('should handle undefined relationships', () => {
      const config = createSerializerConfig('user', ['name'], undefined);
      expect(config).toEqual({
        attributes: ['name'],
        type: 'user',
      });
    });
  });

  describe('buildSerializer', () => {
    it('should create serializer with id mapping for client package', () => {
      const result = buildSerializer('client', {
        attributes: ['name', 'email'],
        type: 'user',
      });

      expect(result).toHaveProperty('UserSerializer');
      expect(result.UserSerializer).toBeDefined();
    });

    it('should create serializer with _id mapping for server package', () => {
      const result = buildSerializer('server', {
        attributes: ['name', 'email'],
        type: 'user',
      });

      expect(result).toHaveProperty('UserSerializer');
      expect(result.UserSerializer).toBeDefined();
    });

    it('should capitalize multi-word type names correctly', () => {
      const result = buildSerializer('client', {
        attributes: ['name'],
        type: 'user-profile',
      });

      expect(result).toHaveProperty('UserProfileSerializer');
    });

    it('should handle relationships passed through rest spread', () => {
      const result = buildSerializer('client', {
        attributes: ['title', 'content'],
        author: rel('user', ['name', 'email']),
        type: 'post',
      });

      expect(result).toHaveProperty('PostSerializer');
    });

    it('should handle explicit relationships object', () => {
      const result = buildSerializer('client', {
        attributes: ['title'],
        relationships: {
          author: {
            attributes: ['name'],
            ref: '_id',
            type: 'user',
          },
        },
        type: 'post',
      });

      expect(result).toHaveProperty('PostSerializer');
    });

    it('should handle mixed relationships and passthrough props', () => {
      const result = buildSerializer('client', {
        attributes: ['title'],
        author: rel('user', ['name']),
        customOption: 'value',
        type: 'post',
      });

      expect(result).toHaveProperty('PostSerializer');
    });

    it('should serialize data correctly with client id mapping', () => {
      const { UserSerializer } = buildSerializer('client', {
        attributes: ['name', 'email'],
        type: 'user',
      });

      const testData = { email: 'john@test.com', id: '123', name: 'John' };
      const serialized = UserSerializer.serialize(testData);

      expect(serialized.data.id).toBe('123');
      expect(serialized.data.type).toBe('user');
      expect(serialized.data.attributes).toMatchObject({
        email: 'john@test.com',
        name: 'John',
      });
    });

    it('should serialize data correctly with server _id mapping', () => {
      const { UserSerializer } = buildSerializer('server', {
        attributes: ['name', 'email'],
        type: 'user',
      });

      const testData = { _id: '123', email: 'john@test.com', name: 'John' };
      const serialized = UserSerializer.serialize(testData);

      expect(serialized.data.id).toBe('123');
      expect(serialized.data.type).toBe('user');
    });

    it('should handle serialization with relationships', () => {
      const { PostSerializer } = buildSerializer('client', {
        attributes: ['title', 'content'],
        author: rel('user', ['name', 'email']),
        type: 'post',
      });

      const testData = {
        author: {
          _id: 'user-1',
          email: 'john@test.com',
          name: 'John',
        },
        content: 'Test content',
        id: 'post-1',
        title: 'Test Post',
      };

      const serialized = PostSerializer.serialize(testData);

      expect(serialized.data.id).toBe('post-1');
      expect(serialized.data.type).toBe('post');
      expect(serialized.data.attributes).toMatchObject({
        content: 'Test content',
        title: 'Test Post',
      });
    });
  });
});
