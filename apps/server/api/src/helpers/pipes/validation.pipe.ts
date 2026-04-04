import { getDeserializer } from '@genfeedai/helpers';
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const { metatype } = metadata;

    // Check if this is JSON API format with data.attributes
    const isJsonApiFormat =
      value && typeof value === 'object' && value.data && value.data.attributes;

    if (isJsonApiFormat) {
      // Deserialize the JSON API data
      let deserializedValue = value;
      try {
        deserializedValue = getDeserializer(value);
      } catch {
        deserializedValue = value;
      }

      // Clean the deserialized value (remove id field)
      let cleanedValue = deserializedValue;
      if (
        cleanedValue &&
        typeof cleanedValue === 'object' &&
        'id' in cleanedValue
      ) {
        const { id: _id, ...rest } = cleanedValue;
        void _id; // Mark as intentionally unused
        cleanedValue = rest;
      }

      // Transform to the proper DTO class if metatype is available
      if (metatype && this.toValidate(metatype)) {
        const object = plainToInstance(metatype, cleanedValue, {
          enableImplicitConversion: false,
          exposeDefaultValues: true,
        });
        await this.validateObject(object);
        return object;
      }

      // Return cleaned data if no metatype
      return cleanedValue;
    }

    // Handle non-JSON API format
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    // Handle null/undefined values gracefully
    if (value == null) {
      return value;
    }

    // For non-JSON API format, just transform to DTO if metatype is available
    const object = plainToInstance(metatype, value, {
      enableImplicitConversion: false,
      exposeDefaultValues: true,
    });
    await this.validateObject(object);
    return object;
  }

  private async validateObject(object: unknown): Promise<void> {
    const errors = await validate(object);
    if (errors.length > 0) {
      const messages = errors.map((error) => ({
        constraints: error.constraints,
        property: error.property,
      }));

      throw new BadRequestException({
        errors: messages,
        message: 'Validation failed',
      });
    }
  }

  private toValidate(metatype: unknown): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.find((type) => metatype === type);
  }
}
