import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';

class TestDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class PrimitiveDto {
  @IsString()
  value!: string;
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
