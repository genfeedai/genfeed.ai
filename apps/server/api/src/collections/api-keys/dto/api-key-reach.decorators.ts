import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { IsOmittable } from '@api/helpers/validation/is-omittable.validator';
import {
  API_KEY_ALLOWED_BRANDS_MAX,
  SELF_SERVICE_API_KEY_SCOPES,
} from '@genfeedai/contracts/constants';
import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
} from 'class-validator';

/**
 * Validators for the fields that set how far an API key reaches. They
 * live here so the update DTO, whose `PartialType` base wraps every inherited
 * field in `@IsOptional()` (and so lets JSON `null` through), re-declares the
 * same rules with `@IsOmittable()` instead of a second hand-written copy.
 */
export function ApiKeyScopesField(): PropertyDecorator {
  return applyDecorators(
    IsOmittable(),
    IsArray(),
    IsString({ each: true }),
    IsIn([...SELF_SERVICE_API_KEY_SCOPES], { each: true }),
  );
}

export function ApiKeyExpiresAtField(): PropertyDecorator {
  return applyDecorators(IsOmittable(), IsDateString());
}

export function ApiKeyAllowedIpsField(): PropertyDecorator {
  return applyDecorators(IsOmittable(), IsArray(), IsString({ each: true }));
}

/**
 * Brands the key may reach (#9130). Omit for every brand in the organization;
 * an empty list is rejected, since a key that reaches no brand is useless.
 */
export function ApiKeyAllowedBrandIdsField(): PropertyDecorator {
  return applyDecorators(
    IsOmittable(),
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(API_KEY_ALLOWED_BRANDS_MAX),
    ArrayUnique(),
    IsEntityId({ each: true }),
  );
}
