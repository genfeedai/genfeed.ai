/**
 * Custom Exceptions Test Suite
 *
 * Note: This is a pure unit test with no NestJS modules.
 * The performance tests intentionally create many exception instances for benchmarking.
 *
 * @vitest-environment node
 */

import {
  APIError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  RateLimitError,
  ResourceConflictError,
} from '@api/helpers/exceptions/api/api-error.exception';
import type { ExceptionMeta } from '@api/helpers/exceptions/base/base.exception';
import { BaseException } from '@api/helpers/exceptions/base/base.exception';
import {
  BusinessLogicException,
  InsufficientCreditsException,
  InvalidOperationException,
  ResourceNotReadyException,
} from '@api/helpers/exceptions/business/business-logic.exception';
import {
  AIServiceException,
  ExternalServiceException,
  PaymentServiceException,
  SocialMediaException,
  StorageServiceException,
} from '@api/helpers/exceptions/external/external-service.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { CredentialPlatform } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';

type ExceptionResponse = {
  title: string;
  detail: string;
  code?: string;
  status?: number;
  timestamp?: string;
  meta?: ExceptionMeta;
  source?: { pointer: string; parameter?: unknown };
  service?: string;
};

const getResponsePayload = (exception: HttpException): ExceptionResponse => {
  return exception.getResponse() as ExceptionResponse;
};

describe('Custom Exceptions Test Suite', () => {
  // Increase timeout for potential GC operations
  // vi timeout configured in vitest.config(10000);

  beforeEach(() => {
    // Use fake timers to prevent timer leaks
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Run pending timers to completion before clearing
    vi.runOnlyPendingTimers();
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // Cleanup to prevent false positive memory leak warnings
  // This is a pure unit test with no modules/connections
  afterAll(async () => {
    // Clear any remaining timers
    vi.clearAllTimers();
    vi.useRealTimers();

    // Allow event loop to clear
    await new Promise((resolve) => setImmediate(resolve));

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('BaseException', () => {
    class TestException extends BaseException {
      constructor(detail: string, meta?: ExceptionMeta) {
        super('Test Error', detail, HttpStatus.BAD_REQUEST, 'TEST_ERROR', meta);
      }
    }

    it('should create an exception with all required fields', () => {
      const exception = new TestException('Test detail');
      const response = getResponsePayload(exception);

      expect(response.title).toBe('Test Error');
      expect(response.detail).toBe('Test detail');
      expect(response.code).toBe('TEST_ERROR');
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.timestamp).toBeDefined();
    });

    it('should include meta data when provided', () => {
      const meta = { action: 'test', userId: '123' };
      const exception = new TestException('Test detail', meta);
      const response = getResponsePayload(exception);

      expect(response.meta).toEqual(meta);
    });

    it('should not include meta when not provided', () => {
      const exception = new TestException('Test detail');
      const response = getResponsePayload(exception);

      expect(response.meta).toBeUndefined();
    });

    it('should have correct HTTP status', () => {
      const exception = new TestException('Test detail');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should generate ISO timestamp', () => {
      const exception = new TestException('Test detail');
      const response = getResponsePayload(exception);
      const timestamp = new Date(response.timestamp);

      expect(timestamp.toISOString()).toBe(response.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('APIError', () => {
    it('should create API error with all properties', () => {
      const exception = new APIError(
        'Test message',
        HttpStatus.BAD_REQUEST,
        'TEST_CODE',
        { extra: 'data' },
      );
      const response = getResponsePayload(exception);

      expect(response.title).toBe('API Error');
      expect(response.detail).toBe('Test message');
      expect(response.code).toBe('TEST_CODE');
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.meta).toEqual({ extra: 'data' });
      expect(response.timestamp).toBeDefined();
      expect(exception.name).toBe('APIError');
      expect(exception.errorCode).toBe('TEST_CODE');
      expect(exception.errorContext).toEqual({ extra: 'data' });
    });

    it('should work without context', () => {
      const exception = new APIError(
        'Test message',
        HttpStatus.NOT_FOUND,
        'NOT_FOUND_CODE',
      );
      const response = getResponsePayload(exception);

      expect(response.meta).toBeUndefined();
      expect(exception.errorContext).toBeUndefined();
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const exception = new RateLimitError(60);
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Rate limit exceeded');
      expect(response.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(response.meta).toEqual({ retryAfter: 60 });
    });

    it('should work without retry after', () => {
      const exception = new RateLimitError();
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Rate limit exceeded');
      expect(response.meta).toEqual({ retryAfter: undefined });
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with operation details', () => {
      const exception = new DatabaseError('findOne', {
        collection: 'users',
        filter: { _id: '123' },
      });
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Database operation failed: findOne');
      expect(response.code).toBe('DATABASE_ERROR');
      expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(response.meta).toEqual({
        details: {
          collection: 'users',
          filter: { _id: '123' },
        },
        operation: 'findOne',
      });
    });

    it('should work without details', () => {
      const exception = new DatabaseError('insert');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Database operation failed: insert');
      expect(response.meta).toEqual({
        details: undefined,
        operation: 'insert',
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with custom message', () => {
      const exception = new AuthenticationError('Invalid token');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Invalid token');
      expect(response.code).toBe('AUTHENTICATION_ERROR');
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('should use default message when not provided', () => {
      const exception = new AuthenticationError();
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Authentication failed');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with resource and action', () => {
      const exception = new AuthorizationError('video', 'delete');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Access denied for delete on video');
      expect(response.code).toBe('AUTHORIZATION_ERROR');
      expect(response.status).toBe(HttpStatus.FORBIDDEN);
      expect(response.meta).toEqual({
        action: 'delete',
        resource: 'video',
      });
    });
  });

  describe('ResourceConflictError', () => {
    it('should create resource conflict error', () => {
      const exception = new ResourceConflictError('user', 'email@example.com');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'Resource conflict: user with identifier email@example.com already exists',
      );
      expect(response.code).toBe('RESOURCE_CONFLICT');
      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.meta).toEqual({
        identifier: 'email@example.com',
        resource: 'user',
      });
    });
  });

  describe('BusinessLogicException', () => {
    it('should create business logic exception with default code', () => {
      const exception = new BusinessLogicException('Invalid operation');
      const response = getResponsePayload(exception);

      expect(response.title).toBe('Business Logic Error');
      expect(response.detail).toBe('Invalid operation');
      expect(response.code).toBe('BUSINESS_LOGIC_ERROR');
      expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.name).toBe('BusinessLogicException');
      expect(exception.errorCode).toBe('BUSINESS_LOGIC_ERROR');
    });

    it('should include details when provided', () => {
      const details = { reason: 'test', value: 123 };
      const exception = new BusinessLogicException('Error', details);
      const response = getResponsePayload(exception);

      expect(response.meta).toEqual(details);
    });

    it('should use custom error code', () => {
      const exception = new BusinessLogicException(
        'Error',
        null,
        'CUSTOM_CODE',
      );
      const response = getResponsePayload(exception);

      expect(response.code).toBe('CUSTOM_CODE');
      expect(exception.errorCode).toBe('CUSTOM_CODE');
    });
  });

  describe('InsufficientCreditsException', () => {
    it('should create insufficient credits exception', () => {
      const exception = new InsufficientCreditsException(100, 50);
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'Insufficient credits: 100 required, 50 available',
      );
      expect(response.code).toBe('INSUFFICIENT_CREDITS');
      expect(response.meta).toEqual({
        available: 50,
        required: 100,
      });
    });
  });

  describe('InvalidOperationException', () => {
    it('should create invalid operation exception', () => {
      const exception = new InvalidOperationException(
        'delete',
        'Resource is locked',
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'Invalid operation: delete - Resource is locked',
      );
      expect(response.code).toBe('INVALID_OPERATION');
      expect(response.meta).toEqual({
        operation: 'delete',
        reason: 'Resource is locked',
      });
    });
  });

  describe('ResourceNotReadyException', () => {
    it('should create resource not ready exception', () => {
      const exception = new ResourceNotReadyException(
        'video',
        'processing',
        'completed',
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'Resource video is not ready: current state is processing, required state is completed',
      );
      expect(response.code).toBe('RESOURCE_NOT_READY');
      expect(response.meta).toEqual({
        currentState: 'processing',
        requiredState: 'completed',
        resource: 'video',
      });
    });
  });

  describe('ExternalServiceException', () => {
    it('should create external service exception with original error object', () => {
      const originalError = {
        code: 'TIMEOUT',
        message: 'Connection timeout',
        status: 504,
      };
      const exception = new ExternalServiceException(
        'Stripe',
        'Payment failed',
        originalError,
      );
      const response = getResponsePayload(exception);

      expect(response.title).toBe('External Service Error');
      expect(response.detail).toBe('Stripe: Payment failed');
      expect(response.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(response.service).toBe('Stripe');
      expect(response.status).toBe(HttpStatus.BAD_GATEWAY);
      expect(response.meta).toEqual({
        originalError: 'Connection timeout',
        statusCode: 504,
      });
      expect(exception.name).toBe('ExternalServiceException');
      expect(exception.service).toBe('Stripe');
      expect(exception.errorCode).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('should handle string original error', () => {
      const exception = new ExternalServiceException(
        'AWS',
        'Upload failed',
        'Network error',
      );
      const response = getResponsePayload(exception);

      expect(response.meta).toEqual({
        originalError: 'Network error',
        statusCode: undefined,
      });
    });

    it('should work without original error', () => {
      const exception = new ExternalServiceException('API', 'Request failed');
      const response = getResponsePayload(exception);

      expect(response.meta).toBeUndefined();
    });

    it('should use custom error code', () => {
      const exception = new ExternalServiceException(
        'Service',
        'Error',
        null,
        'CUSTOM_SERVICE_ERROR',
      );
      const response = getResponsePayload(exception);

      expect(response.code).toBe('CUSTOM_SERVICE_ERROR');
      expect(exception.errorCode).toBe('CUSTOM_SERVICE_ERROR');
    });
  });

  describe('AIServiceException', () => {
    it('should create AI service exception', () => {
      const originalError = { message: 'Model unavailable' };
      const exception = new AIServiceException(
        'OpenAI',
        'text generation',
        originalError,
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'OpenAI: AI operation failed: text generation',
      );
      expect(response.code).toBe('AI_SERVICE_ERROR');
      expect(response.service).toBe('OpenAI');
      expect(response.meta).toEqual({
        originalError: 'Model unavailable',
        statusCode: undefined,
      });
    });

    it('should work without original error', () => {
      const exception = new AIServiceException('Claude', 'image analysis');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        'Claude: AI operation failed: image analysis',
      );
      expect(response.meta).toBeUndefined();
    });
  });

  describe('PaymentServiceException', () => {
    it('should create payment service exception', () => {
      const originalError = { code: 'card_declined' };
      const exception = new PaymentServiceException(
        'Stripe',
        'charge',
        originalError,
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Stripe: Payment operation failed: charge');
      expect(response.code).toBe('PAYMENT_SERVICE_ERROR');
      expect(response.service).toBe('Stripe');
    });
  });

  describe('StorageServiceException', () => {
    it('should create storage service exception', () => {
      const originalError = { message: 'Access denied', statusCode: 403 };
      const exception = new StorageServiceException('upload', originalError);
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('AWS S3: Storage operation failed: upload');
      expect(response.code).toBe('STORAGE_SERVICE_ERROR');
      expect(response.service).toBe('AWS S3');
      expect(response.meta).toEqual({
        originalError: 'Access denied',
        statusCode: 403,
      });
    });
  });

  describe('SocialMediaException', () => {
    it('should create social media exception', () => {
      const originalError = { error: 'rate_limit' };
      const exception = new SocialMediaException(
        CredentialPlatform.TWITTER,
        'post tweet',
        originalError,
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(
        `${CredentialPlatform.TWITTER}: Social media operation failed: post tweet`,
      );
      expect(response.code).toBe('SOCIAL_MEDIA_ERROR');
      expect(response.service).toBe(CredentialPlatform.TWITTER);
    });
  });

  describe('NotFoundException', () => {
    it('should create not found exception with identifier', () => {
      const exception = new NotFoundException('User', '123');
      const response = getResponsePayload(exception);

      expect(response.title).toBe('Resource Not Found');
      expect(response.detail).toBe("User with identifier '123' not found");
      expect(response.source).toEqual({ parameter: '123' });
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('should create not found exception without identifier', () => {
      const exception = new NotFoundException('Configuration');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('Configuration not found');
      expect(response.source).toBeUndefined();
    });
  });

  describe('ValidationException', () => {
    it('should create validation exception with message only', () => {
      const exception = new ValidationException('Invalid email format');
      const response = getResponsePayload(exception);

      expect(response.title).toBe('Validation Error');
      expect(response.detail).toBe('Invalid email format');
      expect(response.source).toBeUndefined();
      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should include field information', () => {
      const exception = new ValidationException('Invalid format', 'email');
      const response = getResponsePayload(exception);

      expect(response.source).toEqual({
        pointer: '/data/attributes/email',
      });
    });

    it('should include field and value', () => {
      const exception = new ValidationException(
        'Invalid email',
        'email',
        'not-an-email',
      );
      const response = getResponsePayload(exception);

      expect(response.source).toEqual({
        parameter: 'not-an-email',
        pointer: '/data/attributes/email',
      });
    });

    it('should handle null value', () => {
      const exception = new ValidationException('Required field', 'name', null);
      const response = getResponsePayload(exception);

      expect(response.source).toEqual({
        parameter: null,
        pointer: '/data/attributes/name',
      });
    });

    it('should handle undefined value when field is provided', () => {
      const exception = new ValidationException(
        'Field missing',
        'description',
        undefined,
      );
      const response = getResponsePayload(exception);

      expect(response.source).toEqual({
        pointer: '/data/attributes/description',
      });
    });
  });

  describe('Exception Error Handling Patterns', () => {
    it('should handle nested exceptions', () => {
      const innerException = new ValidationException('Invalid data', 'field');
      const outerException = new APIError(
        'Request processing failed',
        HttpStatus.BAD_REQUEST,
        'REQUEST_FAILED',
        { innerError: getResponsePayload(innerException) },
      );
      const response = getResponsePayload(outerException);

      expect(response.meta.innerError).toBeDefined();
      expect(response.meta.innerError.title).toBe('Validation Error');
    });

    it('should maintain exception chain', () => {
      const exceptions: HttpException[] = [];

      try {
        throw new ValidationException('Initial validation error');
      } catch (error: unknown) {
        if (error instanceof HttpException) {
          exceptions.push(error);
        }
        try {
          throw new BusinessLogicException('Business rule violation', {
            cause: getResponsePayload(error),
          });
        } catch (error: unknown) {
          if (error instanceof HttpException) {
            exceptions.push(error);
          }
          const finalException = new APIError(
            'Final API error',
            HttpStatus.BAD_REQUEST,
            'FINAL_ERROR',
            { chain: exceptions.map((e) => getResponsePayload(e)) },
          );
          const response = getResponsePayload(finalException);
          const chain = (response.meta as { chain?: ExceptionResponse[] })
            .chain;

          expect(chain).toHaveLength(2);
          expect(chain?.[0]?.title).toBe('Validation Error');
          expect(chain?.[1]?.title).toBe('Business Logic Error');
        }
      }
    });

    it('should handle async exception scenarios', async () => {
      // Use real timers for async test
      vi.useRealTimers();

      const asyncOperation = async () => {
        await Promise.resolve();
        throw new ExternalServiceException(
          'Database',
          'Connection failed',
          'Timeout',
        );
      };

      await expect(asyncOperation()).rejects.toThrow(ExternalServiceException);

      try {
        await asyncOperation();
      } catch (error: unknown) {
        const exception = error as ExternalServiceException;
        const response = getResponsePayload(exception);
        expect(response.code).toBe('EXTERNAL_SERVICE_ERROR');
        expect(response.service).toBe('Database');
      }

      // Restore fake timers for cleanup
      vi.useFakeTimers();
    });
  });

  describe('Exception Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const exception = new ValidationException(
        'Test error',
        'email',
        'test@example.com',
      );
      const response = getResponsePayload(exception);
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      expect(parsed.title).toBe('Validation Error');
      expect(parsed.source.pointer).toBe('/data/attributes/email');
      expect(parsed.source.parameter).toBe('test@example.com');
    });

    it('should handle date serialization', () => {
      const exception = new BusinessLogicException('Error', {
        createdAt: new Date('2024-01-01'),
      });
      const response = getResponsePayload(exception);
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      expect(parsed.meta.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle undefined values in serialization', () => {
      const exception = new APIError('Error', HttpStatus.BAD_REQUEST, 'ERROR', {
        nullValue: null,
        value: undefined,
      });
      const response = getResponsePayload(exception);
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      expect(parsed.meta.value).toBeUndefined();
      expect(parsed.meta.nullValue).toBeNull();
    });
  });

  describe('Exception Status Codes', () => {
    const testCases = [
      {
        exception: new ValidationException('Error'),
        expectedStatus: HttpStatus.UNPROCESSABLE_ENTITY,
        name: 'ValidationException',
      },
      {
        exception: new NotFoundException('Resource'),
        expectedStatus: HttpStatus.NOT_FOUND,
        name: 'NotFoundException',
      },
      {
        exception: new BusinessLogicException('Error'),
        expectedStatus: HttpStatus.UNPROCESSABLE_ENTITY,
        name: 'BusinessLogicException',
      },
      {
        exception: new ExternalServiceException('Service', 'Error'),
        expectedStatus: HttpStatus.BAD_GATEWAY,
        name: 'ExternalServiceException',
      },
      {
        exception: new AuthenticationError(),
        expectedStatus: HttpStatus.UNAUTHORIZED,
        name: 'AuthenticationError',
      },
      {
        exception: new AuthorizationError('resource', 'action'),
        expectedStatus: HttpStatus.FORBIDDEN,
        name: 'AuthorizationError',
      },
      {
        exception: new RateLimitError(),
        expectedStatus: HttpStatus.TOO_MANY_REQUESTS,
        name: 'RateLimitError',
      },
      {
        exception: new DatabaseError('operation'),
        expectedStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        name: 'DatabaseError',
      },
      {
        exception: new ResourceConflictError('resource', 'id'),
        expectedStatus: HttpStatus.CONFLICT,
        name: 'ResourceConflictError',
      },
    ];

    testCases.forEach(({ name, exception, expectedStatus }) => {
      it(`${name} should have status ${expectedStatus}`, () => {
        expect(exception.getStatus()).toBe(expectedStatus);
      });
    });
  });

  describe('Exception Instance Checks', () => {
    it('should be instance of HttpException', () => {
      const exceptions = [
        new ValidationException('Error'),
        new NotFoundException('Resource'),
        new BusinessLogicException('Error'),
        new ExternalServiceException('Service', 'Error'),
        new APIError('Error', 500, 'ERROR'),
      ];

      exceptions.forEach((exception) => {
        expect(exception).toBeInstanceOf(HttpException);
      });
    });

    it('should be instance of their respective classes', () => {
      expect(new ValidationException('Error')).toBeInstanceOf(
        ValidationException,
      );
      expect(new NotFoundException('Resource')).toBeInstanceOf(
        NotFoundException,
      );
      expect(new BusinessLogicException('Error')).toBeInstanceOf(
        BusinessLogicException,
      );
      expect(new InsufficientCreditsException(10, 5)).toBeInstanceOf(
        InsufficientCreditsException,
      );
      expect(new InvalidOperationException('op', 'reason')).toBeInstanceOf(
        InvalidOperationException,
      );
      expect(
        new ResourceNotReadyException('res', 'current', 'required'),
      ).toBeInstanceOf(ResourceNotReadyException);
    });

    it('should inherit from parent classes correctly', () => {
      const insufficientCredits = new InsufficientCreditsException(10, 5);
      expect(insufficientCredits).toBeInstanceOf(BusinessLogicException);
      expect(insufficientCredits).toBeInstanceOf(HttpException);

      const aiError = new AIServiceException('OpenAI', 'generation');
      expect(aiError).toBeInstanceOf(ExternalServiceException);
      expect(aiError).toBeInstanceOf(HttpException);
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle empty strings', () => {
      const exception = new ValidationException('', '', '');
      const response = getResponsePayload(exception);

      expect(response.detail).toBe('');
      expect(response.source).toBeUndefined();
    });

    it('should handle very long error messages', () => {
      const longMessage = 'a'.repeat(10000);
      const exception = new BusinessLogicException(longMessage);
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(longMessage);
      expect(response.detail.length).toBe(10000);
    });

    it('should handle special characters in messages', () => {
      const specialChars = `Special chars: <>&"'\`\n\t\r`;
      const exception = new APIError(
        specialChars,
        HttpStatus.BAD_REQUEST,
        'TEST',
      );
      const response = getResponsePayload(exception);

      expect(response.detail).toBe(specialChars);
    });

    it('should handle numeric values in string fields', () => {
      const exception = new NotFoundException('Resource', '12345');
      const response = getResponsePayload(exception);

      expect(response.detail).toContain('12345');
    });

    it('should handle arrays and objects in meta', () => {
      const complexMeta = {
        array: [1, 2, 3],
        fn: () => 'function',
        nested: {
          deep: {
            value: 'test',
          },
        },
      };
      const exception = new BusinessLogicException('Error', complexMeta);
      const response = getResponsePayload(exception);

      expect(response.meta.array).toEqual([1, 2, 3]);
      expect(response.meta.nested.deep.value).toBe('test');
      expect(typeof response.meta.fn).toBe('function');
    });
  });

  describe('Exception Factory Patterns', () => {
    const createException = (
      type: string,
      ...args: unknown[]
    ): HttpException | null => {
      switch (type) {
        case 'validation':
          return new ValidationException(
            args[0] as string,
            args[1] as string,
            args[2],
          );
        case 'notFound':
          return new NotFoundException(args[0] as string, args[1] as string);
        case 'business':
          return new BusinessLogicException(
            args[0] as string,
            args[1] as Record<string, unknown>,
            args[2] as string,
          );
        case 'external':
          return new ExternalServiceException(
            args[0] as string,
            args[1] as string,
            args[2],
            args[3] as string,
          );
        default:
          return null;
      }
    };

    it('should create exceptions using factory pattern', () => {
      const validation = createException('validation', 'Invalid input');
      expect(validation).toBeInstanceOf(ValidationException);

      const notFound = createException('notFound', 'User', '123');
      expect(notFound).toBeInstanceOf(NotFoundException);

      const business = createException('business', 'Rule violation');
      expect(business).toBeInstanceOf(BusinessLogicException);

      const external = createException('external', 'API', 'Failed');
      expect(external).toBeInstanceOf(ExternalServiceException);
    });

    it('should return null for unknown type', () => {
      const unknown = createException('unknown', 'test');
      expect(unknown).toBeNull();
    });
  });

  describe('Exception Performance', () => {
    it('should create many exceptions without performance issues', () => {
      // Use real timers for accurate performance measurement
      vi.useRealTimers();

      const startTime = Date.now();
      let count = 0;

      // Create exceptions without storing them to avoid memory leak detection false positives
      for (let i = 0; i < 1000; i++) {
        const exception = new ValidationException(`Error ${i}`, `field${i}`);
        expect(exception).toBeDefined();
        count++;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(count).toBe(1000);
      expect(duration).toBeLessThan(500); // Increased threshold for CI stability

      // Restore fake timers
      vi.useFakeTimers();
    });

    it('should serialize large exception data efficiently', () => {
      // Use real timers for accurate performance measurement
      vi.useRealTimers();

      const largeData = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: i,
          timestamp: new Date().toISOString(),
          value: `value${i}`,
        }));

      const exception = new BusinessLogicException('Large data error', {
        items: largeData,
      });
      const response = getResponsePayload(exception);

      const startTime = Date.now();
      const json = JSON.stringify(response);
      const endTime = Date.now();

      expect(json).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Increased threshold for CI stability

      // Restore fake timers
      vi.useFakeTimers();
    });
  });
});
