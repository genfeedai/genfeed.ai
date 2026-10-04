import {
  isValidWebsiteUrl,
  ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
} from '@genfeedai/contracts/constants';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export const IS_WEBSITE_URL = 'isWebsiteUrl';

/**
 * Same predicate the web forms validate with, so a website the form accepts
 * is never rejected here (and the other way round).
 */
export function IsWebsiteUrl(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      constraints: [],
      name: IS_WEBSITE_URL,
      validator: {
        defaultMessage: () => ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
        validate: (value): boolean =>
          typeof value === 'string' && isValidWebsiteUrl(value),
      },
    },
    validationOptions,
  );
}
