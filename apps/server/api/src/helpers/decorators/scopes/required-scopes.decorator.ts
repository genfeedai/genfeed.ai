import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/enums';
import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to define required API key scopes for an endpoint
 * Used with CombinedAuthGuard to validate API key permissions
 *
 * @example
 * @RequiredScopes(ApiKeyScope.VIDEOS_CREATE)
 * @Post()
 * async createVideo() { }
 *
 * @example
 * @RequiredScopes(ApiKeyScope.VIDEOS_READ, ApiKeyScope.BRANDS_READ)
 * @Get()
 * async getVideosWithBrands() { }
 */
export const RequiredScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);
