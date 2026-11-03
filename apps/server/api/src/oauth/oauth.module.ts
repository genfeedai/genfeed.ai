import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { Module } from '@nestjs/common';
import { OAuthAuthorizeController } from './controllers/oauth-authorize.controller';
import { OAuthRegisterController } from './controllers/oauth-register.controller';
import { OAuthRevokeController } from './controllers/oauth-revoke.controller';
import { OAuthTokenController } from './controllers/oauth-token.controller';
import { EnterpriseAssertionVerifier } from './services/enterprise-assertion.verifier';
import { EnterpriseIssuerKeysService } from './services/enterprise-issuer-keys.service';
import { OAuthAuthorizeService } from './services/oauth-authorize.service';
import { OAuthClientService } from './services/oauth-client.service';
import { OAuthEnterpriseAuthService } from './services/oauth-enterprise-auth.service';
import { OAuthRefreshTokenService } from './services/oauth-refresh-token.service';

@Module({
  controllers: [
    OAuthRegisterController,
    OAuthAuthorizeController,
    OAuthTokenController,
    OAuthRevokeController,
  ],
  imports: [BetterAuthModule, ApiKeysModule],
  providers: [
    EnterpriseAssertionVerifier,
    EnterpriseIssuerKeysService,
    OAuthClientService,
    OAuthEnterpriseAuthService,
    OAuthRefreshTokenService,
    OAuthAuthorizeService,
  ],
})
export class OAuthModule {}
