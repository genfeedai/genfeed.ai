import { CredentialPlatform } from '@genfeedai/enums';

export class TestDataFactory {
  static createObjectId(): string {
    return '507f191e810c19729de860ee';
  }

  static createMockUser(overrides?: Partial<unknown>) {
    return {
      emailAddresses: [{ emailAddress: 'test@example.com' }],
      firstName: 'Test',
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      lastName: 'User',
      ...overrides,
    };
  }

  static createMockOrganization(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      isDeleted: false,
      name: 'Test Organization',
      slug: 'test-org',
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMockAccount(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      isDeleted: false,
      organization: TestDataFactory.createObjectId(),
      updatedAt: new Date(),
      userId: `user-${Math.random().toString(36).substr(2, 9)}`,
      ...overrides,
    };
  }

  static createMockVideo(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      brand: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      description: 'Test video description',
      isDeleted: false,
      organization: TestDataFactory.createObjectId(),
      status: 'active',
      title: 'Test Video',
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMockRole(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      displayName: 'Test Role',
      isDeleted: false,
      name: 'test-role',
      permissions: ['read', 'write'],
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMockCredentials(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      accessToken: `token-${Math.random().toString(36).substr(2, 32)}`,
      brand: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      externalId: `ext-${Math.random().toString(36).substr(2, 9)}`,
      isDeleted: false,
      platform: CredentialPlatform.INSTAGRAM,
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMockPaginatedResult<T>(docs: T[], overrides?: Partial<unknown>) {
    return {
      docs,
      hasNextPage: false,
      hasPrevPage: false,
      limit: 10,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: docs.length,
      totalPages: Math.ceil(docs.length / 10),
      ...overrides,
    };
  }

  static createMockHttpRequest(overrides?: Partial<unknown>) {
    return {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      query: {},
      url: '/test',
      ...overrides,
    };
  }

  static createMockResponse(overrides?: Partial<unknown>) {
    return {
      // @ts-expect-error TS2339
      json: vi.fn().mockReturnThis(),
      // @ts-expect-error TS2339
      send: vi.fn().mockReturnThis(),
      // @ts-expect-error TS2339
      status: vi.fn().mockReturnThis(),
      ...overrides,
    };
  }

  // Helper for creating multiple mock objects
  static createMockArray<T>(factory: () => T, count: number): T[] {
    return Array.from({ length: count }, factory);
  }

  // Helper for creating date ranges
  static createDateRange(daysAgo: number = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    return { endDate, startDate };
  }

  // Helper for creating mock files
  static createMockFile(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      createdAt: new Date(),
      filename: 'test-file.jpg',
      isDeleted: false,
      mimetype: 'image/jpeg',
      organization: TestDataFactory.createObjectId(),
      size: 1024,
      updatedAt: new Date(),
      url: 'https://example.com/test-file.jpg',
      ...overrides,
    };
  }

  // Helper for creating mock ingredients
  static createMockIngredient(overrides?: Partial<unknown>) {
    return {
      _id: TestDataFactory.createObjectId(),
      category: 'test-category',
      createdAt: new Date(),
      isDeleted: false,
      name: 'Test Ingredient',
      organization: TestDataFactory.createObjectId(),
      updatedAt: new Date(),
      ...overrides,
    };
  }
}
