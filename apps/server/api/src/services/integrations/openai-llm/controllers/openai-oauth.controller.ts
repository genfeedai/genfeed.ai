import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ByokService } from '@api/services/byok/byok.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import type { User } from '@clerk/backend';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@AutoSwagger()
@Controller('services/openai')
export class OpenAiOAuthController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly openAiOAuthService: OpenAiOAuthService,
    private readonly byokService: ByokService,
  ) {}

  /**
   * Initiate the OpenAI Codex OAuth flow.
   * Returns an authorization URL to redirect the user to.
   */
  @Post('connect')
  async connect(@CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);

    try {
      const url = this.openAiOAuthService.generateAuthUrl(
        publicMetadata.organization,
        publicMetadata.user,
      );

      return { data: { url } };
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName}.connect failed`, error);
      throw error;
    }
  }

  /**
   * Complete the OpenAI Codex OAuth flow.
   * Exchanges the authorization code for tokens and stores them encrypted.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() user: User,
    @Body() body: { code: string; state: string },
  ) {
    const publicMetadata = getPublicMetadata(user);

    try {
      const { code, state } = body;

      if (!code || !state) {
        throw new HttpException(
          { detail: 'Missing code or state', title: 'Invalid payload' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { tokens, organizationId, accountId } =
        await this.openAiOAuthService.exchangeCodeForTokens(code, state);

      // Verify the org matches the authenticated user
      if (organizationId !== publicMetadata.organization) {
        throw new HttpException(
          {
            detail: 'Organization mismatch',
            title: 'Authorization error',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      // Build the BYOK entry and save it
      const byokEntry = this.openAiOAuthService.buildByokEntry(
        tokens,
        accountId,
      );

      // Save directly using the pre-encrypted entry
      await this.byokService.saveOAuthKey(
        organizationId,
        ByokProvider.OPENAI,
        byokEntry,
      );

      return {
        data: {
          accountId,
          authMode: 'oauth',
          isConnected: true,
          provider: 'openai',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName}.verify failed`, error);
      throw error;
    }
  }
}
