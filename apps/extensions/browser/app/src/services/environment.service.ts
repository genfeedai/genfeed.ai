export const JWT_LABEL = 'genfeed-jwt';

export const isDevelopment =
  process.env.NODE_ENV === 'development' ||
  process.env.PLASMO_PUBLIC_ENV === 'development';

export const isProduction =
  process.env.NODE_ENV === 'production' &&
  process.env.PLASMO_PUBLIC_ENV !== 'development';

export const isTest = String(process.env.NODE_ENV) === 'test';

export const apiEndpoint =
  process.env.PLASMO_PUBLIC_API_ENDPOINT || 'https://api.genfeed.ai/v1';

export const assetsEndpoint =
  process.env.PLASMO_PUBLIC_ASSETS_ENDPOINT || 'https://assets.genfeed.ai';

export const ingredientsEndpoint =
  process.env.PLASMO_PUBLIC_INGREDIENTS_ENDPOINT ||
  'https://ingredients.genfeed.ai';

export const wsEndpoint =
  process.env.PLASMO_PUBLIC_WS_ENDPOINT || 'https://notifications.genfeed.ai';

export const websiteDomain = isDevelopment
  ? 'https://local.genfeed.ai'
  : 'https://genfeed.ai';

export const cookieDomain = isDevelopment ? 'local.genfeed.ai' : 'genfeed.ai';

/** @deprecated Use individual exports instead */
export const EnvironmentService = {
  apiEndpoint,
  assetsEndpoint,
  cookieDomain,
  ingredientsEndpoint,
  isDevelopment,
  isProduction,
  isTest,
  JWT_LABEL,
  websiteDomain,
  wsEndpoint,
};
