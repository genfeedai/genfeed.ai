import { ValidateIf } from 'class-validator';

/**
 * Skips validation only when the property is omitted (`undefined`).
 *
 * `@IsOptional()` also skips JSON `null`, which lets `{"scopes": null}` or
 * `{"expiresAt": null}` bypass the validators that follow it. Services then
 * read `null` as "not provided" and fall back to a default, or as an explicit
 * clear, and each caller has to remember which. On authority fields (`scopes`,
 * `expiresAt`, `allowedIps`, `role`, `organizationId`) use this decorator: a
 * present `null` reaches the type validators and is rejected with a 400
 * (#7137). `scripts/architecture/check-authority-field-optional.ts` enforces it.
 */
export function IsOmittable(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}
