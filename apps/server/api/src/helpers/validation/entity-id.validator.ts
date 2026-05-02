import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

const LEGACY_OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_REGEX = /^c[a-z0-9]{8,}$/i;
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export const IS_ENTITY_ID = 'isEntityId';

export function isEntityId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const id = value.trim();
  if (!id) {
    return false;
  }

  return (
    LEGACY_OBJECT_ID_REGEX.test(id) ||
    UUID_REGEX.test(id) ||
    CUID_REGEX.test(id) ||
    ULID_REGEX.test(id)
  );
}

export function IsEntityId(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      constraints: [],
      name: IS_ENTITY_ID,
      validator: {
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a valid entity id`,
          validationOptions,
        ),
        validate: (value): boolean => isEntityId(value),
      },
    },
    validationOptions,
  );
}
