import {
  isValidWebsiteUrl,
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_DESCRIPTION_TOO_LONG_MESSAGE,
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_REQUIRED_MESSAGE,
  ORGANIZATION_NAME_TOO_LONG_MESSAGE,
  ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
  ORGANIZATION_WEBSITE_MAX_LENGTH,
  ORGANIZATION_WEBSITE_TOO_LONG_MESSAGE,
} from '@genfeedai/contracts/constants';
import { z } from 'zod';

export const organizationSchema = z.object({
  label: z.string().min(1, 'Label is required'),
});

export type OrganizationSchema = z.infer<typeof organizationSchema>;

/**
 * Mirrors `CreateOrganizationRequestDto`: only the name is required. Blank
 * optional fields parse to `undefined` so they are left out of the request.
 */
export const createOrganizationSchema = z.object({
  description: z
    .string()
    .trim()
    .max(
      ORGANIZATION_DESCRIPTION_MAX_LENGTH,
      ORGANIZATION_DESCRIPTION_TOO_LONG_MESSAGE,
    )
    .transform((value) => value || undefined),
  label: z
    .string()
    .trim()
    .min(1, ORGANIZATION_NAME_REQUIRED_MESSAGE)
    .max(ORGANIZATION_NAME_MAX_LENGTH, ORGANIZATION_NAME_TOO_LONG_MESSAGE),
  websiteUrl: z
    .string()
    .trim()
    .max(ORGANIZATION_WEBSITE_MAX_LENGTH, ORGANIZATION_WEBSITE_TOO_LONG_MESSAGE)
    .refine((value) => !value || isValidWebsiteUrl(value), {
      message: ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
    })
    .transform((value) => value || undefined),
});

export type CreateOrganizationFormValues = z.input<
  typeof createOrganizationSchema
>;
/**
 * Body of `POST /organizations`. Optional keys may be omitted entirely; the
 * schema's output (blank fields as `undefined`) is assignable to it.
 */
export interface CreateOrganizationPayload {
  description?: string;
  label: string;
  websiteUrl?: string;
}
