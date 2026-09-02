---
name: integration
description: >-
  Platform integration modules in Genfeed.ai (OAuth, API key, or webhook). Knows the
  connect/verify pattern, CredentialPlatform enum, credential save flow, and module structure.
model: sonnet
---

You handle third-party platform integrations in Genfeed.ai. Integrations live
in `apps/server/api/src/services/integrations/<platform>/`.

48+ platform integrations exist. `CredentialPlatform` enum covers 23 social/publishing
platforms. AI tool integrations (openai-llm, anthropic, fal, etc.) use separate patterns.

## Integration Module Structure

```
apps/server/api/src/services/integrations/<platform>/
  controllers/<platform>.controller.ts
  services/<platform>.service.ts
  <platform>.module.ts
  <platform>.http             # manual test file
  <platform>.module.spec.ts
```

## Step 1: Register Platform

Add to `packages/contracts/src/enums/platform.enum.ts`:
```typescript
export enum Platform {
  // existing...
  NEW_PLATFORM = 'new_platform',
}
```
`CredentialPlatform` is re-exported from this enum.

## OAuth Connect/Verify Controller

Reference: `apps/server/api/src/services/integrations/twitter/controllers/twitter.controller.ts`

```typescript
@AutoSwagger()
@Controller('services/<platform>')
export class <Platform>Controller {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly configService: ConfigService,
    private readonly <platform>Service: <Platform>Service,
    private readonly logger: LoggerService,
  ) {}

  @Post('connect')
  async connect(
    @Body() dto: CreateCredentialDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId, brandId } = user;
    // Build auth URL with PKCE or state parameter
    // Return: serializeSingle(result, CredentialOAuthSerializer)
  }

  @Post('verify')
  async verify(
    @Body() dto: CreateCredentialVerifyDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const { organizationId, brandId } = user;
    // Exchange code for tokens (PKCE flow handles this in verify, not a separate callback)
    // credentialsService.saveCredentials(brand, CredentialPlatform.X, fields)
    // Return: serializeSingle(credential, CredentialSerializer)
  }
}
```

OAuth uses PKCE — no separate `@Get('callback')` endpoint. The `verify` endpoint
handles code exchange.

## Error Handling

Two patterns in codebase (prefer the newer helper pattern):

```typescript
// Newer pattern — use this for new integrations
import { returnBadRequest, returnNotFound, returnInternalServerError } from '@api/helpers/utils/response/response.util';

if (!credential) return returnNotFound('Credential not found');
if (!token) return returnBadRequest('Invalid token');
```

```typescript
// Older pattern — still in some integrations, do not use for new code
throw new HttpException('Invalid token', HttpStatus.BAD_REQUEST);
```

## Credential Save Pattern

```typescript
await this.credentialsService.saveCredentials(
  brand,
  CredentialPlatform.NEW_PLATFORM,
  {
    accessToken: EncryptionUtil.encrypt(rawToken),
    refreshToken: EncryptionUtil.encrypt(rawRefresh),
    expiresAt: new Date(expiresIn),
    isConnected: true,
    externalId: platformUserId,
    externalHandle: platformUsername,
    platform: CredentialPlatform.NEW_PLATFORM,
  },
);
```

Always encrypt tokens: `EncryptionUtil.encrypt()` from `@api/shared/utils/encryption/encryption.util`.

## Service Pattern

```typescript
@Injectable()
export class <Platform>Service {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async post(credential: CredentialDocument, content: string): Promise<void> {
    const token = EncryptionUtil.decrypt(credential.accessToken);
    // Call platform API via HttpService
  }
}
```

`HttpService` lives in the **service layer**, not controllers. Use `firstValueFrom(observable)` — never raw `fetch`.

## Module Pattern

```typescript
@Module({
  controllers: [<Platform>Controller],
  exports: [<Platform>Service],
  imports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => ConfigModule),
  ],
  providers: [<Platform>Service],
})
export class <Platform>Module {}
```

Register in `apps/server/api/src/app.module.ts` alphabetically in integrations section.

## ConfigService

```typescript
{ provide: ConfigService, useValue: new ConfigService() }
this.configService.get('PLATFORM_CLIENT_ID')
// Never process.env directly.
```

## Serializer Usage

- `CredentialOAuthSerializer` — OAuth initiation URLs (connect step)
- `CredentialSerializer` — saved credential objects (verify step)
Both from `@genfeedai/serializers`.

## Hard Rules

- Always encrypt tokens with `EncryptionUtil` before storing
- Always use `CredentialPlatform` enum — never raw strings
- Register platform in `platform.enum.ts` first
- Use `HttpService` (NestJS Axios) in services, not raw `fetch`
- Read `user.organizationId` / `user.brandId` / `user.userId` from `AuthenticatedUser`
- Return serialized responses — never raw credential objects
- Use `returnBadRequest`/`returnNotFound` helpers for errors in new integrations

## Key Reference Files

- `apps/server/api/src/services/integrations/twitter/` — OAuth 2 PKCE
- `apps/server/api/src/services/integrations/linkedin/` — newer error pattern
- `apps/server/api/src/collections/credentials/services/credentials.service.ts`
- `packages/contracts/src/enums/platform.enum.ts`
