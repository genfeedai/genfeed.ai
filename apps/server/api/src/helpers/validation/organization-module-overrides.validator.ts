import { parseOrganizationModuleOverrides } from '@genfeedai/contracts/constants';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export function IsOrganizationModuleOverrides(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOrganizationModuleOverrides',
      constraints: [],
      validator: {
        defaultMessage: () =>
          'moduleOverrides must contain only supported module IDs with boolean values',
        validate: (value: unknown) =>
          parseOrganizationModuleOverrides(value) !== null,
      },
    },
    options,
  );
}
