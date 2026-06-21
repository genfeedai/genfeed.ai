import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Default upper bound for a serialized JSON value (64 KB). MCP tool argument
 * payloads are small in practice; this caps the worst case so a caller cannot
 * stuff a multi-megabyte blob into the `arguments` JSONB column.
 */
export const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

/**
 * Property decorator that rejects a value whose UTF-8 JSON serialization
 * exceeds `maxBytes`. Non-serializable values (e.g. circular references) are
 * also rejected. Pairs with `@IsObject()` for bounded JSONB inputs.
 */
export function MaxJsonBytes(
  maxBytes: number = DEFAULT_MAX_JSON_BYTES,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      constraints: [maxBytes],
      name: 'maxJsonBytes',
      options: validationOptions,
      propertyName,
      target: object.constructor,
      validator: {
        defaultMessage(args: ValidationArguments): string {
          const [limit] = args.constraints as [number];
          return `${args.property} must serialize to at most ${limit} bytes`;
        },
        validate(value: unknown, args: ValidationArguments): boolean {
          const [limit] = args.constraints as [number];
          try {
            return (
              Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') <= limit
            );
          } catch {
            return false;
          }
        },
      },
    });
  };
}
