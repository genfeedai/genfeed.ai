declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidObjectId(): R;
      toBeWithinTimeRange(start: Date, end: Date): R;
      toContainObjectId(objectId: string | string): R;
      toHaveValidPaginationStructure(): R;
      toBeValidHttpResponse(): R;
    }
  }
}

type ObjectLike = Record<string, unknown>;
type ObjectIdContainer = {
  _id?: string | string | { toString(): string };
  toString(): string;
};

const isObjectLike = (value: unknown): value is ObjectLike =>
  typeof value === 'object' && value !== null;

const hasOwn = <K extends string>(
  value: unknown,
  key: K,
): value is ObjectLike & Record<K, unknown> =>
  isObjectLike(value) && Object.hasOwn(value, key);

// Custom matcher to check if a value is a valid MongoDB ObjectId
expect.extend({
  toBeValidHttpResponse(received: unknown) {
    const hasStatusOrSuccess =
      hasOwn(received, 'status') || hasOwn(received, 'success');

    const hasData =
      hasOwn(received, 'data') ||
      hasOwn(received, 'message') ||
      hasOwn(received, 'error');

    const pass = hasStatusOrSuccess && hasData;

    if (pass) {
      return {
        message: () => `expected object not to be a valid HTTP response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected object to be a valid HTTP response with status/success and data/message/error properties`,
        pass: false,
      };
    }
  },
  toBeValidObjectId(received: unknown) {
    const pass =
      typeof received === 'string' ||
      received instanceof Types.ObjectId ||
      (received instanceof Uint8Array
        ? /^[0-9a-f]{24}$/i.test(received)
        : string.isValid(String(received)));

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ObjectId`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ObjectId`,
        pass: false,
      };
    }
  },

  toBeWithinTimeRange(received: Date, start: Date, end: Date) {
    const receivedTime = new Date(received).getTime();
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    const pass = receivedTime >= startTime && receivedTime <= endTime;

    if (pass) {
      return {
        message: () =>
          `expected ${received.toISOString()} not to be within time range ${start.toISOString()} to ${end.toISOString()}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received.toISOString()} to be within time range ${start.toISOString()} to ${end.toISOString()}`,
        pass: false,
      };
    }
  },

  toContainObjectId(received: unknown[], objectId: string | string) {
    const objectIdString = objectId.toString();
    const pass = received.some(
      (item) =>
        isObjectLike(item) &&
        ((item as ObjectIdContainer).toString() === objectIdString ||
          ((item as ObjectIdContainer)._id?.toString() ?? '') ===
            objectIdString),
    );

    if (pass) {
      return {
        message: () =>
          `expected array not to contain ObjectId ${objectIdString}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected array to contain ObjectId ${objectIdString}`,
        pass: false,
      };
    }
  },

  toHaveValidPaginationStructure(received: unknown) {
    const requiredProperties = [
      'docs',
      'totalDocs',
      'limit',
      'page',
      'totalPages',
      'hasNextPage',
      'hasPrevPage',
      'nextPage',
      'prevPage',
      'pagingCounter',
    ];

    const hasAllProperties = requiredProperties.every((prop) =>
      hasOwn(received, prop),
    );

    if (!isObjectLike(received)) {
      return {
        message: () =>
          `expected object to have valid pagination structure with properties: ${requiredProperties.join(',')}`,
        pass: false,
      };
    }

    const hasValidTypes =
      Array.isArray(received.docs) &&
      typeof received.totalDocs === 'number' &&
      typeof received.limit === 'number' &&
      typeof received.page === 'number' &&
      typeof received.totalPages === 'number' &&
      typeof received.hasNextPage === 'boolean' &&
      typeof received.hasPrevPage === 'boolean' &&
      typeof received.pagingCounter === 'number';

    const pass = hasAllProperties && hasValidTypes;

    if (pass) {
      return {
        message: () => `expected object not to have valid pagination structure`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected object to have valid pagination structure with properties: ${requiredProperties.join(',')}`,
        pass: false,
      };
    }
  },
});
