import { getDeserializer } from '@helpers/deserializer.helper';

describe('Deserializer Helper', () => {
  describe('getDeserializer', () => {
    test('should deserialize data with basic options', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should deserialize simple data structure', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should handle data with relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
          },
          type: 'publication',
        },
        included: [
          {
            attributes: {
              email: 'john@example.com',
              name: 'John Doe',
            },
            id: 'user-123',
            type: 'user',
          },
        ],
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', 'pub-123');
      expect(result).toHaveProperty('title', 'Test Publication');
      expect(result).toHaveProperty('content', 'Test content');
      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result.author).toHaveProperty('name', 'John Doe');
      expect(result.author).toHaveProperty('email', 'john@example.com');
    });

    test('should handle data without relationships', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should handle multiple relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
            organization: {
              data: {
                id: 'org-123',
                type: 'organization',
              },
            },
          },
          type: 'publication',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result).toHaveProperty('organization');
      expect(result.organization).toHaveProperty('id', 'org-123');
    });

    test('should handle null relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: null,
            },
          },
          type: 'publication',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author', null);
    });

    test('should handle array relationships', () => {
      const data = {
        data: {
          attributes: {
            name: 'Test Organization',
          },
          id: 'org-123',
          relationships: {
            members: {
              data: [
                { id: 'user-1', type: 'user' },
                { id: 'user-2', type: 'user' },
              ],
            },
          },
          type: 'organization',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('members');
      expect(Array.isArray(result.members)).toBe(true);
      expect(result.members).toHaveLength(2);
      expect(result.members[0]).toHaveProperty('id', 'user-1');
      expect(result.members[1]).toHaveProperty('id', 'user-2');
    });

    test('should return deserializer runtime when no data provided', () => {
      const data = {};

      const result = getDeserializer(data);

      // When no primary data, returns the deserializer runtime object
      expect(result).toBeDefined();
      expect(typeof (result as any).deserialize).toBe('function');
    });

    test('should handle data without attributes', () => {
      const data = {
        data: {
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
    });

    test('should preserve camelCase key transformation', () => {
      const data = {
        data: {
          attributes: {
            email_address: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      // The deserializer should convert snake_case to camelCase
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('emailAddress');
    });

    test('should handle complex nested relationships', () => {
      const data = {
        data: {
          attributes: {
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
            ingredients: {
              data: [
                {
                  id: 'ing-1',
                  type: 'ingredient',
                },
                {
                  id: 'ing-2',
                  type: 'ingredient',
                },
              ],
            },
          },
          type: 'publication',
        },
        included: [
          {
            attributes: {
              name: 'John Doe',
            },
            id: 'user-123',
            type: 'user',
          },
          {
            attributes: {
              type: 'video',
              url: 'https://example.com/video1.mp4',
            },
            id: 'ing-1',
            type: 'ingredient',
          },
          {
            attributes: {
              type: 'image',
              url: 'https://example.com/image1.jpg',
            },
            id: 'ing-2',
            type: 'ingredient',
          },
        ],
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result).toHaveProperty('ingredients');
      expect(Array.isArray(result.ingredients)).toBe(true);
      expect(result.ingredients).toHaveLength(2);
      expect(result.ingredients[0]).toHaveProperty('id', 'ing-1');
      expect(result.ingredients[1]).toHaveProperty('id', 'ing-2');
    });
  });
});
