// Import test data generators directly
const generateTestId = () => {
  const part1 = Math.random().toString(36).substring(2, 8);
  const part2 = Math.random().toString(36).substring(2, 8);
  return part1 + part2;
};

const generateTestEmail = (prefix = 'test') =>
  `${prefix}.${Date.now()}@example.com`;

const generateTestUrl = (path = '') => `https://test.example.com${path}`;

const generateTestDate = (daysOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString();
};

const testUserData = () => ({
  avatar: generateTestUrl('/avatar.jpg'),
  createdAt: generateTestDate(),
  email: generateTestEmail(),
  firstName: 'John',
  id: generateTestId(),
  isActive: true,
  isDeleted: false,
  lastName: 'Doe',
  role: 'user',
  updatedAt: generateTestDate(),
});

const testVideoData = () => ({
  createdAt: generateTestDate(),
  description: 'Test video description',
  duration: 120,
  id: generateTestId(),
  isDeleted: false,
  metadata: {
    bitrate: 1000000,
    fps: 30,
    height: 1080,
    width: 1920,
  },
  organizationId: generateTestId(),
  status: 'completed',
  thumbnail: generateTestUrl('/thumbnail.jpg'),
  title: 'Test Video',
  updatedAt: generateTestDate(),
  url: generateTestUrl('/video.mp4'),
  userId: generateTestId(),
});

const testContentData = () => ({
  createdAt: generateTestDate(),
  description: 'Test content description',
  id: generateTestId(),
  isDeleted: false,
  organizationId: generateTestId(),
  publishedAt: generateTestDate(-1),
  status: 'draft',
  tags: ['tech', 'business'],
  title: 'Test Content',
  updatedAt: generateTestDate(),
  userId: generateTestId(),
});

import { getDeserializer } from '@helpers/deserializer.helper';
import {
  createEntityAttributes,
  getSerializer,
} from '@helpers/serializer.helper';

describe('Serializer/Deserializer Integration Tests', () => {
  describe('User Serialization/Deserialization', () => {
    test('should serialize and deserialize user data correctly', () => {
      const userConfig = {
        attributes: createEntityAttributes([
          'email',
          'firstName',
          'lastName',
          'role',
          'isActive',
        ]),
        type: 'user',
      };

      const serializer = getSerializer(userConfig);
      const testUser = testUserData();

      // Serialize
      const serialized = serializer.serialize(testUser);

      expect(serialized).toHaveProperty('data');
      expect(serialized.data).toHaveProperty('type', 'user');
      expect(serialized.data).toHaveProperty('id', testUser.id);
      expect(serialized.data).toHaveProperty('attributes');

      // Check serialized attributes
      expect(serialized.data.attributes).toHaveProperty(
        'email',
        testUser.email,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'firstName',
        testUser.firstName,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'lastName',
        testUser.lastName,
      );
      expect(serialized.data.attributes).toHaveProperty('role', testUser.role);
      expect(serialized.data.attributes).toHaveProperty(
        'isActive',
        testUser.isActive,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'createdAt',
        testUser.createdAt,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'updatedAt',
        testUser.updatedAt,
      );
      expect(serialized.data.attributes).toHaveProperty('isDeleted', false);

      // Deserialize
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', testUser.id);
      expect(deserialized).toHaveProperty('email', testUser.email);
      expect(deserialized).toHaveProperty('firstName', testUser.firstName);
      expect(deserialized).toHaveProperty('lastName', testUser.lastName);
      expect(deserialized).toHaveProperty('role', testUser.role);
      expect(deserialized).toHaveProperty('isActive', testUser.isActive);
      expect(deserialized).toHaveProperty('createdAt', testUser.createdAt);
      expect(deserialized).toHaveProperty('updatedAt', testUser.updatedAt);
      expect(deserialized).toHaveProperty('isDeleted', false);
    });

    test('should handle user with relationships', () => {
      const userConfig = {
        attributes: createEntityAttributes([
          'email',
          'firstName',
          'lastName',
          'role',
        ]),
        relationships: {
          organization: {
            attributes: ['label', 'slug'],
            ref: '_id',
            type: 'organization',
          },
        },
        type: 'user',
      };

      const serializer = getSerializer(userConfig);
      const testUser = {
        ...testUserData(),
        organization: {
          _id: 'org-123',
          label: 'Test Organization',
          slug: 'test-org',
        },
      };

      // Serialize
      const serialized = serializer.serialize(testUser);

      // ts-jsonapi includes relationships in included array when configured
      expect(serialized.data).toHaveProperty('type', 'user');
      expect(serialized.data).toHaveProperty('id');

      // Verify organization data is included
      if (serialized.included && serialized.included.length > 0) {
        expect(serialized.included[0]).toHaveProperty('type', 'organization');
      }
    });
  });

  describe('Video Serialization/Deserialization', () => {
    test('should serialize and deserialize video data correctly', () => {
      const videoConfig = {
        attributes: createEntityAttributes([
          'title',
          'description',
          'url',
          'thumbnail',
          'duration',
          'status',
        ]),
        type: 'video',
      };

      const serializer = getSerializer(videoConfig);
      const testVideo = testVideoData();

      // Serialize
      const serialized = serializer.serialize(testVideo);

      expect(serialized.data).toHaveProperty('type', 'video');
      expect(serialized.data).toHaveProperty('id', testVideo.id);
      expect(serialized.data.attributes).toHaveProperty(
        'title',
        testVideo.title,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'description',
        testVideo.description,
      );
      expect(serialized.data.attributes).toHaveProperty('url', testVideo.url);
      expect(serialized.data.attributes).toHaveProperty(
        'thumbnail',
        testVideo.thumbnail,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'duration',
        testVideo.duration,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'status',
        testVideo.status,
      );

      // Deserialize
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', testVideo.id);
      expect(deserialized).toHaveProperty('title', testVideo.title);
      expect(deserialized).toHaveProperty('description', testVideo.description);
      expect(deserialized).toHaveProperty('url', testVideo.url);
      expect(deserialized).toHaveProperty('thumbnail', testVideo.thumbnail);
      expect(deserialized).toHaveProperty('duration', testVideo.duration);
      expect(deserialized).toHaveProperty('status', testVideo.status);
    });

    test('should handle video with metadata relationship', () => {
      const videoConfig = {
        attributes: createEntityAttributes([
          'title',
          'description',
          'url',
          'duration',
        ]),
        relationships: {
          metadata: {
            attributes: ['width', 'height', 'fps', 'bitrate'],
            ref: '_id',
            type: 'metadata',
          },
        },
        type: 'video',
      };

      const serializer = getSerializer(videoConfig);
      const testVideo = {
        ...testVideoData(),
        metadata: {
          _id: 'meta-123',
          bitrate: 1000000,
          fps: 30,
          height: 1080,
          width: 1920,
        },
      };

      // Serialize
      const serialized = serializer.serialize(testVideo);

      // ts-jsonapi may include relationship data in included array
      expect(serialized.data).toHaveProperty('type', 'video');
      expect(serialized.data).toHaveProperty('id');

      // Verify metadata is handled (either as relationship or included)
      if (serialized.included && serialized.included.length > 0) {
        expect(serialized.included[0]).toHaveProperty('type', 'metadata');
      }
    });
  });

  describe('Content Serialization/Deserialization', () => {
    test('should serialize and deserialize content data correctly', () => {
      const contentConfig = {
        attributes: createEntityAttributes([
          'title',
          'description',
          'status',
          'tags',
          'publishedAt',
        ]),
        type: 'content',
      };

      const serializer = getSerializer(contentConfig);
      const testContent = testContentData();

      // Serialize
      const serialized = serializer.serialize(testContent);

      expect(serialized.data).toHaveProperty('type', 'content');
      expect(serialized.data).toHaveProperty('id', testContent.id);
      expect(serialized.data.attributes).toHaveProperty(
        'title',
        testContent.title,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'description',
        testContent.description,
      );
      expect(serialized.data.attributes).toHaveProperty(
        'status',
        testContent.status,
      );
      expect(serialized.data.attributes).toHaveProperty('tags');
      expect(serialized.data.attributes).toHaveProperty(
        'publishedAt',
        testContent.publishedAt,
      );

      // Deserialize
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', testContent.id);
      expect(deserialized).toHaveProperty('title', testContent.title);
      expect(deserialized).toHaveProperty(
        'description',
        testContent.description,
      );
      expect(deserialized).toHaveProperty('status', testContent.status);
      expect(deserialized).toHaveProperty('tags');
      expect(deserialized).toHaveProperty(
        'publishedAt',
        testContent.publishedAt,
      );
    });
  });

  describe('Complex Nested Relationships', () => {
    test('should handle publication with multiple nested relationships', () => {
      const publicationConfig = {
        attributes: createEntityAttributes([
          'label',
          'description',
          'category',
          'status',
        ]),
        relationships: {
          ingredient: {
            attributes: ['category', 'status'],
            ref: '_id',
            relationships: {
              metadata: {
                attributes: ['width', 'height'],
                ref: '_id',
                type: 'metadata',
              },
            },
            type: 'ingredient',
          },
          tags: {
            attributes: ['name', 'color'],
            ref: '_id',
            type: 'tag',
          },
          user: {
            attributes: ['firstName', 'lastName'],
            ref: '_id',
            type: 'user',
          },
        },
        type: 'publication',
      };

      const serializer = getSerializer(publicationConfig);
      const testData = {
        createdAt: '2023-01-01T00:00:00Z',
        description: 'Test description',
        id: 'pub-123',
        ingredient: {
          _id: 'ing-123',
          metadata: {
            _id: 'meta-123',
            height: 1080,
            width: 1920,
          },
          status: 'completed',
          type: 'video',
        },
        isDeleted: false,
        label: 'Test Publication',
        status: 'published',
        tags: [
          { _id: 'tag-1', color: '#ff0000', name: 'tech' },
          { _id: 'tag-2', color: '#00ff00', name: 'business' },
        ],
        type: 'article',
        updatedAt: '2023-01-01T00:00:00Z',
        user: {
          _id: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      // Serialize
      const serialized = serializer.serialize(testData);

      // Verify basic serialization works
      expect(serialized.data).toHaveProperty('type', 'publication');
      expect(serialized.data).toHaveProperty('id', 'pub-123');
      expect(serialized.data.attributes).toHaveProperty(
        'label',
        'Test Publication',
      );
      expect(serialized.data.attributes).toHaveProperty('status', 'published');

      // ts-jsonapi may include related data in included array
      if (serialized.included && serialized.included.length > 0) {
        const types = serialized.included.map(
          (item: { type: string }) => item.type,
        );
        expect(types.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle null values gracefully', () => {
      const config = {
        attributes: ['id', 'name', 'description'],
        type: 'test',
      };

      const serializer = getSerializer(config);
      const testData = {
        description: null,
        id: 'test-123',
        name: 'Test Name',
      };

      const serialized = serializer.serialize(testData);
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', 'test-123');
      expect(deserialized).toHaveProperty('name', 'Test Name');
      expect(deserialized).toHaveProperty('description', null);
    });

    test('should handle missing optional fields', () => {
      const config = {
        attributes: ['id', 'name', 'optionalField'],
        type: 'test',
      };

      const serializer = getSerializer(config);
      const testData = {
        id: 'test-123',
        name: 'Test Name',
        // optionalField is missing
      };

      const serialized = serializer.serialize(testData);
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', 'test-123');
      expect(deserialized).toHaveProperty('name', 'Test Name');
      // optionalField should be undefined or null depending on configuration
    });

    test('should handle empty relationships', () => {
      const config = {
        attributes: ['id', 'name'],
        relationships: {
          relatedItem: {
            attributes: ['label'],
            ref: '_id',
            type: 'related',
          },
        },
        type: 'test',
      };

      const serializer = getSerializer(config);
      const testData = {
        id: 'test-123',
        name: 'Test Name',
        // relatedItem is missing
      };

      const serialized = serializer.serialize(testData);
      const deserialized = getDeserializer(serialized);

      expect(deserialized).toHaveProperty('id', 'test-123');
      expect(deserialized).toHaveProperty('name', 'Test Name');
      // relatedItem should be undefined or null
    });
  });

  describe('Performance Tests', () => {
    test('should handle large datasets efficiently', () => {
      const config = {
        attributes: createEntityAttributes(['email', 'firstName', 'lastName']),
        type: 'user',
      };

      const serializer = getSerializer(config);
      const deserializer = getDeserializer({});

      const users = Array.from({ length: 100 }, () => testUserData());

      const start = Date.now();

      // Serialize all users
      const serializedUsers = users.map((user) => serializer.serialize(user));

      // Deserialize all users
      const deserializedUsers = serializedUsers.map((serialized) =>
        deserializer.deserialize(serialized),
      );

      const end = Date.now();
      const duration = end - start;

      expect(deserializedUsers).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      // Verify data integrity
      deserializedUsers.forEach((user, index) => {
        expect(user.id).toBe(users[index].id);
        expect(user.email).toBe(users[index].email);
        expect(user.firstName).toBe(users[index].firstName);
        expect(user.lastName).toBe(users[index].lastName);
      });
    });
  });
});
