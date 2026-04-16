import { ApiKeyScope } from '@genfeedai/enums';

export const MANAGED_API_KEY_LABEL = 'Managed Credits Key';

export const MANAGED_API_KEY_SCOPES = [
  ApiKeyScope.VIDEOS_READ,
  ApiKeyScope.VIDEOS_CREATE,
  ApiKeyScope.VIDEOS_UPDATE,
  ApiKeyScope.VIDEOS_DELETE,
  ApiKeyScope.IMAGES_READ,
  ApiKeyScope.IMAGES_CREATE,
  ApiKeyScope.IMAGES_UPDATE,
  ApiKeyScope.IMAGES_DELETE,
  ApiKeyScope.PROMPTS_READ,
  ApiKeyScope.PROMPTS_CREATE,
  ApiKeyScope.PROMPTS_UPDATE,
  ApiKeyScope.PROMPTS_DELETE,
  ApiKeyScope.ARTICLES_READ,
  ApiKeyScope.ARTICLES_CREATE,
  ApiKeyScope.BRANDS_READ,
  ApiKeyScope.CREDITS_READ,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.ANALYTICS_READ,
];
