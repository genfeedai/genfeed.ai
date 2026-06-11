import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  Allow,
  IsDate,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

class TestDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class WhitelistDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  validatedOptional?: string;

  @Allow()
  @IsOptional()
  allowedField?: unknown;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;

  // class-validator 0.15 keeps @IsOptional-only properties under
  // whitelist (0.13/0.14 stripped them). Pinned here so a future
  // class-validator bump that reverts this surfaces as a test failure.
  @IsOptional()
  optionalOnly?: string;
}

class PrimitiveDto {
  @IsString()
  value!: string;
}

class DynamicDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

describe('ValidationPipe', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  describe('transform', () => {
    it('should validate and transform valid data', async () => {
      const value = {
        description: 'Test description',
        email: 'john@example.com',
        name: 'John Doe',
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual(value);
    });

    it('strips unknown top-level fields while preserving decorated object payloads', async () => {
      const value = {
        name: 'workflow',
        payload: { arbitrary: true, nested: { value: 1 } },
        unexpected: 'strip me',
      };
      const metadata: ArgumentMetadata = {
        metatype: DynamicDto,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual({
        name: 'workflow',
        payload: { arbitrary: true, nested: { value: 1 } },
      });
      expect(result).not.toHaveProperty('unexpected');
    });

    it('should throw BadRequestException for invalid data', async () => {
      const value = {
        email: 'invalid-email',
        name: 'John Doe',
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      await expect(pipe.transform(value, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle JSON:API format', async () => {
      const value = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          type: 'test',
        },
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual(
        expect.objectContaining({
          email: 'john@example.com',
          name: 'John Doe',
        }),
      );
    });

    it('should handle JSON:API format with relationships', async () => {
      const value = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          relationships: {
            organization: {
              data: { id: 'org123' },
            },
          },
          type: 'test',
        },
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual(
        expect.objectContaining({
          email: 'john@example.com',
          name: 'John Doe',
        }),
      );
    });

    it('should skip validation for primitive types', async () => {
      const value = 'test string';
      const metadata: ArgumentMetadata = {
        metatype: String,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toBe(value);
    });

    it('should skip validation when no metatype is provided', async () => {
      const value = { name: 'John Doe' };
      const metadata: ArgumentMetadata = {
        metatype: undefined,
        type: 'body',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toBe(value);
    });

    it('should handle null/undefined values gracefully', async () => {
      const value = null;
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      // The pipe returns null for null values (does not throw)
      const result = await pipe.transform(value, metadata);
      expect(result).toBeNull();
    });

    it('should return validation error details', async () => {
      const value = {
        email: 'invalid-email',
        name: 123,
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      try {
        await pipe.transform(value, metadata);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response).toEqual(
          expect.objectContaining({
            message: 'Validation failed',
          }),
        );
        expect(response.errors).toBeDefined();
      }
    });

    it('should handle empty object', async () => {
      const value = {};
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'body',
      };

      await expect(pipe.transform(value, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle query parameters', async () => {
      const value = {
        email: 'john@example.com',
        name: 'John Doe',
      };
      const metadata: ArgumentMetadata = {
        metatype: TestDto,
        type: 'query',
      };

      const result = await pipe.transform(value, metadata);

      expect(result).toEqual(
        expect.objectContaining({
          email: 'john@example.com',
          name: 'John Doe',
        }),
      );
    });
  });

  describe('whitelist stripping', () => {
    const metadata: ArgumentMetadata = {
      metatype: WhitelistDto,
      type: 'body',
    };

    it('should strip properties that are not declared on the DTO', async () => {
      const value = {
        injectedField: 'malicious',
        name: 'John Doe',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.name).toBe('John Doe');
      expect(result).not.toHaveProperty('injectedField');
    });

    it('should keep properties decorated with @IsOptional alone', async () => {
      const value = {
        name: 'John Doe',
        optionalOnly: 'sent by client',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.optionalOnly).toBe('sent by client');
    });

    it('should keep properties protected by @Allow', async () => {
      const value = {
        allowedField: { anything: true },
        name: 'John Doe',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.allowedField).toEqual({ anything: true });
    });

    it('should keep optional properties that have a real validator', async () => {
      const value = {
        name: 'John Doe',
        validatedOptional: 'kept',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.validatedOptional).toBe('kept');
    });

    it('should keep @Type(() => Date) properties validated with @IsDate', async () => {
      const value = {
        name: 'John Doe',
        scheduledAt: '2026-01-15T10:00:00.000Z',
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.scheduledAt).toBeInstanceOf(Date);
      expect((result.scheduledAt as Date).toISOString()).toBe(
        '2026-01-15T10:00:00.000Z',
      );
    });

    it('should strip unknown properties in JSON:API format payloads', async () => {
      const value = {
        data: {
          attributes: {
            injectedField: 'malicious',
            name: 'John Doe',
          },
          type: 'test',
        },
      };

      const result = (await pipe.transform(value, metadata)) as Record<
        string,
        unknown
      >;

      expect(result.name).toBe('John Doe');
      expect(result).not.toHaveProperty('injectedField');
    });

    it('should still reject invalid values for declared properties', async () => {
      const value = {
        name: 'John Doe',
        validatedOptional: 123,
      };

      await expect(pipe.transform(value, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toValidate', () => {
    it('should return false for primitive types', () => {
      const primitiveTypes = [String, Boolean, Number, Array, Object];

      primitiveTypes.forEach((type) => {
        expect(
          (
            pipe as unknown as { toValidate: (t: unknown) => boolean }
          ).toValidate(type),
        ).toBe(false);
      });
    });

    it('should return true for custom classes', () => {
      expect(
        (pipe as unknown as { toValidate: (t: unknown) => boolean }).toValidate(
          TestDto,
        ),
      ).toBe(true);
      expect(
        (pipe as unknown as { toValidate: (t: unknown) => boolean }).toValidate(
          PrimitiveDto,
        ),
      ).toBe(true);
    });
  });
});
