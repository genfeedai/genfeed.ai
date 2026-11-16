/** The one scope the Business Profile APIs accept for managing locations and posts. */
export const GOOGLE_BUSINESS_SCOPE =
  'https://www.googleapis.com/auth/business.manage';

export const GOOGLE_BUSINESS_ACCOUNTS_URL =
  'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';

/** Locations are listed on the v1 Business Information API. */
export const GOOGLE_BUSINESS_INFORMATION_URL =
  'https://mybusinessbusinessinformation.googleapis.com/v1';

/** Local posts only exist on the v4 My Business API. */
export const GOOGLE_BUSINESS_POSTS_URL = 'https://mybusiness.googleapis.com/v4';

export const GOOGLE_BUSINESS_REQUEST_TIMEOUT_MS = 30_000;

/** Refresh an access token that expires inside this window. */
export const GOOGLE_BUSINESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Redirect path under the app URL; the web callback page is `/oauth/[platform]`. */
export const GOOGLE_BUSINESS_REDIRECT_PATH = '/oauth/google-business';

/** `accounts/{account}/locations/{location}`. */
export const GOOGLE_BUSINESS_LOCATION_NAME_PATTERN =
  /^accounts\/[^/]+\/locations\/[^/]+$/;
