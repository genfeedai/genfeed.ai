import { logger } from '@genfeedai/services/core/logger.service';

/**
 * Runtime type validation for API responses
 */
export class TypeValidator {
  static isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  static isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  static isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  static isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  static isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  static validate<T>(
    value: unknown,
    schema: ValidationSchema,
    context?: string,
  ): value is T {
    const errors = TypeValidator.validateSchema(
      value,
      schema,
      context || 'root',
    );

    if (errors.length > 0) {
      logger.error('Type validation failed', { context, errors, value });
      return false;
    }

    return true;
  }

  static assertType<T>(
    value: unknown,
    schema: ValidationSchema,
    context?: string,
  ): asserts value is T {
    const errors = TypeValidator.validateSchema(
      value,
      schema,
      context || 'root',
    );

    if (errors.length > 0) {
      const errorMessage = `Type validation failed at ${context || 'root'}: ${errors.join(', ')}`;
      logger.error(errorMessage, { errors, value });
      throw new TypeError(errorMessage);
    }
  }

  private static validateSchema(
    value: unknown,
    schema: ValidationSchema,
    path: string,
  ): string[] {
    const errors: string[] = [];

    if (schema.required && (value === undefined || value === null)) {
      return [`${path} is required`];
    }

    if (!schema.required && (value === undefined || value === null)) {
      return errors;
    }

    switch (schema.type) {
      case 'string':
        if (!TypeValidator.isString(value)) {
          errors.push(`${path} must be a string`);
        }
        break;

      case 'number':
        if (!TypeValidator.isNumber(value)) {
          errors.push(`${path} must be a number`);
        }
        break;

      case 'boolean':
        if (!TypeValidator.isBoolean(value)) {
          errors.push(`${path} must be a boolean`);
        }
        break;

      case 'array':
        if (!TypeValidator.isArray(value)) {
          errors.push(`${path} must be an array`);
        } else if (schema.items) {
          value.forEach((item: unknown, index: number) => {
            errors.push(
              ...TypeValidator.validateSchema(
                item,
                schema.items!,
                `${path}[${index}]`,
              ),
            );
          });
        }
        break;

      case 'object':
        if (!TypeValidator.isObject(value)) {
          errors.push(`${path} must be an object`);
        } else if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            errors.push(
              ...TypeValidator.validateSchema(
                value[key],
                propSchema,
                `${path}.${key}`,
              ),
            );
          }
        }
        break;

      case 'union':
        if (schema.oneOf) {
          const unionErrors = schema.oneOf.map((subSchema) =>
            TypeValidator.validateSchema(value, subSchema, path),
          );
          if (unionErrors.every((errs) => errs.length > 0)) {
            errors.push(`${path} does not match any of the expected types`);
          }
        }
        break;
    }

    if (schema.validator && !schema.validator(value)) {
      errors.push(`${path} failed custom validation`);
    }

    return errors;
  }
}

export interface ValidationSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'union';
  required?: boolean;
  properties?: Record<string, ValidationSchema>;
  items?: ValidationSchema;
  oneOf?: ValidationSchema[];
  validator?: (value: unknown) => boolean;
}

export const CommonSchemas = {
  accountMinimal: {
    properties: {
      handle: { required: false, type: 'string' },
      id: { required: true, type: 'string' },
      label: { required: false, type: 'string' },
    },
    required: true,
    type: 'object',
  } as ValidationSchema,

  baseEntity: {
    properties: {
      createdAt: { required: true, type: 'string' },
      id: { required: true, type: 'string' },
      updatedAt: { required: true, type: 'string' },
    },
    required: true,
    type: 'object',
  } as ValidationSchema,
  id: { required: true, type: 'string' } as ValidationSchema,

  metadataFull: {
    properties: {
      duration: { required: false, type: 'number' },
      extension: { required: false, type: 'string' },
      height: { required: false, type: 'number' },
      id: { required: true, type: 'string' },
      model: { required: false, type: 'string' },
      size: { required: false, type: 'number' },
      style: { required: false, type: 'string' },
      width: { required: false, type: 'number' },
    },
    required: true,
    type: 'object',
  } as ValidationSchema,

  paginatedResponse: {
    properties: {
      docs: { required: true, type: 'array' },
      limit: { required: true, type: 'number' },
      page: { required: true, type: 'number' },
      pages: { required: true, type: 'number' },
      total: { required: true, type: 'number' },
    },
    required: true,
    type: 'object',
  } as ValidationSchema,

  timestamp: {
    required: true,
    type: 'string',
    validator: (value: unknown) =>
      typeof value === 'string' && !Number.isNaN(Date.parse(value)),
  } as ValidationSchema,

  userMinimal: {
    properties: {
      firstName: { required: false, type: 'string' },
      handle: { required: false, type: 'string' },
      id: { required: true, type: 'string' },
      lastName: { required: false, type: 'string' },
    },
    required: true,
    type: 'object',
  } as ValidationSchema,
};

export function createValidator<T>(schema: ValidationSchema): {
  validate: (value: unknown) => value is T;
  assert: (value: unknown) => asserts value is T;
} {
  return {
    assert: (value: unknown): asserts value is T =>
      TypeValidator.assertType<T>(value, schema),
    validate: (value: unknown): value is T =>
      TypeValidator.validate<T>(value, schema),
  };
}
