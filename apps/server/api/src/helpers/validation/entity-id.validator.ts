import { isEntityId } from '@api-types/helpers/entity-id';
import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

export const IS_ENTITY_ID = 'isEntityId';

export { isEntityId } from '@api-types/helpers/entity-id';

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
