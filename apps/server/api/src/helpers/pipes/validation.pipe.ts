import { getDeserializer } from '@genfeedai/helpers';
import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
  type Type,
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
        const object = this.buildValidationTarget(metatype, cleanedValue);
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
    const object = this.buildValidationTarget(metatype, value);
    await this.validateObject(object, metatype);
    return object;
  }

  /**
   * Builds the object that gets validated and returned.
   *
   * `plainToInstance` constructs its result via `new metatype()` before copying
   * any source data on. Under this codebase's runtime class-field compilation
   * (SWC, target < ES2022, "define" field semantics), every declared-but-
   * uninitialized property becomes a real own `undefined` property the moment
   * the constructor runs — in class declaration order, ahead of anything copied
   * from the source. For most DTOs that is invisible (whitelist stripping and
   * `toEqual` deep-equality assertions don't care). It is NOT invisible for
   * `ALLOW_UNKNOWN_PROPERTIES` DTOs: webhook callers re-serialize the pipe's
   * output to verify an HMAC, so a materialized-but-absent field or a
   * constructor-order key shuffle silently invalidates a signature the vendor
   * computed over the original body.
   *
   * For that family, skip the constructor entirely. `Object.create` keeps the
   * class prototype — so `instanceof` checks and class-validator's
   * constructor-keyed metadata lookup still resolve — without running field
   * initializers, then copy only the keys the source actually has, in the
   * source's own order. None of the opted-in webhook DTOs use `@Transform`/
   * `@Type`, so skipping `plainToInstance`'s coercion step costs nothing.
   */
  private buildValidationTarget(
    metatype: Type<unknown>,
    source: unknown,
  ): unknown {
    if (this.allowsUnknownProperties(metatype) && isPlainObject(source)) {
      const instance = Object.create(metatype.prototype) as Record<
        string,
        unknown
      >;
      for (const key of Object.keys(source)) {
        instance[key] = source[key];
      }
      return instance;
    }

    return plainToInstance(metatype, source, {
      enableImplicitConversion: false,
      exposeDefaultValues: true,
    });
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
