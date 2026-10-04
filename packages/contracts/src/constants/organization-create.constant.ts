/**
 * Limits and messages for `POST /organizations`. The API DTO and the
 * create-organization form both read these, so a value the form accepts is a
 * value the API accepts, and both reject it with the same words.
 */
export const ORGANIZATION_NAME_MAX_LENGTH = 120;
export const ORGANIZATION_DESCRIPTION_MAX_LENGTH = 1000;
export const ORGANIZATION_WEBSITE_MAX_LENGTH = 500;

export const ORGANIZATION_NAME_REQUIRED_MESSAGE =
  'Give the organization a name.';
export const ORGANIZATION_NAME_TOO_LONG_MESSAGE = `Keep the name to ${ORGANIZATION_NAME_MAX_LENGTH} characters or fewer.`;
export const ORGANIZATION_DESCRIPTION_TOO_LONG_MESSAGE = `Keep the description to ${ORGANIZATION_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
export const ORGANIZATION_WEBSITE_TOO_LONG_MESSAGE = `Keep the website to ${ORGANIZATION_WEBSITE_MAX_LENGTH} characters or fewer.`;
export const ORGANIZATION_WEBSITE_FORMAT_MESSAGE =
  'Enter a website like acme.com or https://acme.com.';

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;
const HOSTNAME_PATTERN =
  /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:[a-z]{2,}|xn--[a-z\d-]+)$/i;

/**
 * Accepts what people type into a website field: a bare domain (`acme.com`),
 * a `www.` host, or a full http(s) URL with a path. Rejects other schemes,
 * spaces, and hosts without a real top-level domain (`localhost`, `acme`).
 */
export function isValidWebsiteUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(
      SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`,
    );

    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      HOSTNAME_PATTERN.test(url.hostname)
    );
  } catch {
    return false;
  }
}
