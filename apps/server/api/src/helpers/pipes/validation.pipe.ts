import { getDeserializer } from '@genfeedai/helpers';
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Static opt-out marker for whitelist stripping.
 *
 * The pipe validates with `{ whitelist: true }`, which DELETES every property
 * the DTO does not decorate. That is the right default for first-party request
 * bodies, but it is actively wrong for third-party webhook callbacks: their
 * bodies are re-serialized for HMAC comparison, forwarded verbatim to other
 * services, and read through index signatures, so silently dropping vendor keys
 * corrupts the payload. A DTO declares
 *
 * ```ts
 * static readonly [ALLOW_UNKNOWN_PROPERTIES] = true;
 * ```
 *
 * to keep declared-field validation while passing unknown keys through
 * untouched. Statics are inherited, so a base DTO can opt a whole family in.
 */
export const ALLOW_UNKNOWN_PROPERTIES: unique symbol = Symbol.for(
  'genfeedai:validation:allow-unknown-properties',
);

interface UnknownPropertyAwareMetatype {
  [ALLOW_UNKNOWN_PROPERTIES]?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const { metatype } = metadata;

    // Check if this is JSON API format with data.attributes
    const valueRecord = isPlainObject(value) ? value : null;
    const dataRecord = isPlainObject(valueRecord?.data)
      ? valueRecord.data
      : null;
    const isJsonApiFormat =
      !!dataRecord && isPlainObject(dataRecord.attributes);

    if (isJsonApiFormat) {
      // Deserialize the JSON API data
      let deserializedValue = value;
      try {
        deserializedValue = getDeserializer(value as never);
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
        await this.validateObject(object, metatype);
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
    await this.validateObject(object, metatype);
    return object;
  }

  private async validateObject(
    object: unknown,
    metatype: unknown,
  ): Promise<void> {
    if (!isPlainObject(object)) {
      return;
    }

    const errors = await validate(object, {
      whitelist: !this.allowsUnknownProperties(metatype),
    });
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

  private allowsUnknownProperties(metatype: unknown): boolean {
    return (
      typeof metatype === 'function' &&
      (metatype as UnknownPropertyAwareMetatype)[ALLOW_UNKNOWN_PROPERTIES] ===
        true
    );
  }

  private toValidate(metatype: unknown): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.find((type) => metatype === type);
  }
}
