import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { forwardRef, Module } from '@nestjs/common';
import { OAuthAuthorizeController } from './controllers/oauth-authorize.controller';
import { OAuthRegisterController } from './controllers/oauth-register.controller';
import { OAuthTokenController } from './controllers/oauth-token.controller';
import { OAuthAuthorizeService } from './services/oauth-authorize.service';
import { OAuthClientService } from './services/oauth-client.service';

@Module({
  controllers: [
    OAuthRegisterController,
    OAuthAuthorizeController,
    OAuthTokenController,
  ],
  imports: [BetterAuthModule, forwardRef(() => ApiKeysModule)],
  providers: [OAuthClientService, OAuthAuthorizeService],
})
export class OAuthModule {}
