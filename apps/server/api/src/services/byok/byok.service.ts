import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { encodeJwtToken } from '@api/helpers/utils/jwt/jwt.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { ByokBillingStatus, ByokProvider } from '@genfeedai/enums';
import type { IByokKeyEntry, IByokProviderStatus } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const BYOK_PROVIDER_LABELS: Record<
  ByokProvider,
  {
    label: string;
    description: string;
    docsUrl: string;
    requiresSecret?: boolean;
    supportsOAuth?: boolean;
  }
> = {
  [ByokProvider.ANTHROPIC]: {
    description: 'Claude models — Opus 4.6, Sonnet 4.5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    label: 'Anthropic',
  },
  [ByokProvider.OPENAI]: {
    description: 'GPT-4o, o3, o4-mini — API key or ChatGPT subscription',
    docsUrl: 'https://platform.openai.com/api-keys',
    label: 'OpenAI',
    supportsOAuth: true,
  },
  [ByokProvider.OPENROUTER]: {
    description: 'LLM text generation (GPT-4, Claude, etc.)',
    docsUrl: 'https://openrouter.ai/keys',
    label: 'OpenRouter',
  },
  [ByokProvider.ELEVENLABS]: {
    description: 'Text-to-speech & voice cloning',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    label: 'ElevenLabs',
  },
  [ByokProvider.REPLICATE]: {
    description: 'Image & video generation models',
    docsUrl: 'https://replicate.com/account/api-tokens',
    label: 'Replicate',
  },
  [ByokProvider.FAL]: {
    description: 'Fast image generation (FLUX, etc.)',
    docsUrl: 'https://fal.ai/dashboard/keys',
    label: 'fal.ai',
  },
  [ByokProvider.HEYGEN]: {
    description: 'AI avatar video generation',
    docsUrl: 'https://app.heygen.com/settings',
    label: 'HeyGen',
  },
  [ByokProvider.HEDRA]: {
    description: 'AI character video generation',
    docsUrl: 'https://www.hedra.com/settings',
    label: 'Hedra',
  },
  [ByokProvider.KLINGAI]: {
    description: 'Video generation',
    docsUrl: 'https://klingai.com',
    label: 'Kling AI',
    requiresSecret: true,
  },
  [ByokProvider.LEONARDOAI]: {
    description: 'Image generation',
    docsUrl: 'https://app.leonardo.ai/api-access',
    label: 'Leonardo.AI',
  },
  [ByokProvider.HIGGSFIELD]: {
    description: 'Multi-model video generation (Kling 3.0, Seedance, Sora 2)',
    docsUrl: 'https://docs.higgsfield.ai',
    label: 'Higgsfield',
    requiresSecret: true,
  },
  [ByokProvider.APIFY]: {
    description: 'Social trends & web scraping',
    docsUrl: 'https://console.apify.com/account/integrations',
    label: 'Apify',
  },
};

@Injectable()
export class ByokService {
  constructor(
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolve the API key for a given provider from the organization's BYOK settings.
   * Returns decrypted apiKey (and apiSecret if present), or undefined if not found.
   */
  async resolveApiKey(
    orgId: string,
    provider: ByokProvider,
  ): Promise<{ apiKey: string; apiSecret?: string } | undefined> {
    try {
      const settings = await this.organizationSettingsService.findOne({
        organization: orgId,
      });

      if (!settings) {
        return undefined;
      }

      const byokKeys = this.getByokKeys(settings);
      const entry = byokKeys[provider];

      if (!entry?.isEnabled || !entry.apiKey) {
        return undefined;
      }

      return {
        apiKey: EncryptionUtil.decrypt(entry.apiKey),
        apiSecret: entry.apiSecret
          ? EncryptionUtil.decrypt(entry.apiSecret)
          : undefined,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to resolve BYOK API key', {
        error,
        orgId,
        provider,
      });
      return undefined;
    }
  }

  /**
   * Check if BYOK is active for a specific provider in the organization.
   */
  async isByokActiveForProvider(
    orgId: string,
    provider: ByokProvider,
  ): Promise<boolean> {
    const result = await this.resolveApiKey(orgId, provider);
    return !!result;
  }

  async isByokBillingInGoodStanding(orgId: string): Promise<boolean> {
    const orgSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: orgId,
    });

    if (!orgSettings) {
      return true;
    }

    const status = orgSettings.byokBillingStatus;
    return !status || status === ByokBillingStatus.ACTIVE;
  }

  /**
   * Save (or update) an encrypted API key for a provider.
   * Sets isByokEnabled = true on the organization settings.
   */
  async saveKey(
    orgId: string,
    provider: ByokProvider,
    apiKey: string,
    apiSecret?: string,
  ): Promise<void> {
    try {
      const encryptedEntry: IByokKeyEntry = {
        apiKey: EncryptionUtil.encrypt(apiKey),
        apiSecret: apiSecret ? EncryptionUtil.encrypt(apiSecret) : undefined,
        isEnabled: true,
        lastValidatedAt: new Date(),
        provider,
      };

      await this.updateByokKey(orgId, provider, encryptedEntry, true);

      this.logger.log('BYOK key saved', { orgId, provider });
    } catch (error: unknown) {
      this.logger.error('Failed to save BYOK key', { error, orgId, provider });
      throw error;
    }
  }

  /**
   * Save a pre-built BYOK entry (used by OAuth flows where tokens are already encrypted).
   */
  async saveOAuthKey(
    orgId: string,
    provider: ByokProvider,
    entry: IByokKeyEntry,
  ): Promise<void> {
    try {
      await this.updateByokKey(orgId, provider, entry, true);

      this.logger.log('BYOK OAuth key saved', {
        authMode: entry.authMode,
        orgId,
        provider,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to save BYOK OAuth key', {
        error,
        orgId,
        provider,
      });
      throw error;
    }
  }

  /**
   * Update OAuth tokens in-place (after a token refresh).
   */
  async updateOAuthTokens(
    orgId: string,
    provider: ByokProvider,
    accessToken: string,
    refreshToken: string | undefined,
    expiresAt: number,
  ): Promise<void> {
    try {
      const existing = await this.prisma.organizationSetting.findFirst({
        where: { organizationId: orgId },
      });

      if (!existing) {
        return;
      }

      const byokKeys = this.getByokKeys(existing);
      const entry = byokKeys[provider] ?? ({} as IByokKeyEntry);

      byokKeys[provider] = {
        ...entry,
        apiKey: EncryptionUtil.encrypt(accessToken),
        apiSecret: refreshToken
          ? EncryptionUtil.encrypt(refreshToken)
          : entry.apiSecret,
        expiresAt,
        lastValidatedAt: new Date(),
      };

      await this.prisma.organizationSetting.updateMany({
        data: { byokKeys: byokKeys as never },
        where: { organizationId: orgId },
      });
    } catch (error: unknown) {
      this.logger.error('Failed to update OAuth tokens', {
        error,
        orgId,
        provider,
      });
      throw error;
    }
  }

  /**
   * Remove a provider's API key from the organization's BYOK settings.
   * If no keys remain, sets isByokEnabled = false.
   */
  async removeKey(orgId: string, provider: ByokProvider): Promise<void> {
    try {
      const existing = await this.prisma.organizationSetting.findFirst({
        where: { organizationId: orgId },
      });

      if (!existing) {
        return;
      }

      const byokKeys = this.getByokKeys(existing);
      delete byokKeys[provider];

      const hasRemainingKeys = Object.keys(byokKeys).length > 0;

      await this.prisma.organizationSetting.updateMany({
        data: {
          byokKeys: byokKeys as never,
          isByokEnabled: hasRemainingKeys,
        },
        where: { organizationId: orgId },
      });

      this.logger.log('BYOK key removed', { orgId, provider });
    } catch (error: unknown) {
      this.logger.error('Failed to remove BYOK key', {
        error,
        orgId,
        provider,
      });
      throw error;
    }
  }

  /**
   * Increment usage counter for a BYOK key. Fire-and-forget — errors are logged but not thrown.
   */
  async incrementUsage(organizationId: string, keyId: string): Promise<void> {
    try {
      const existing = await this.prisma.organizationSetting.findFirst({
        where: { organizationId },
      });

      if (!existing) {
        return;
      }

      const byokKeys = this.getByokKeys(existing);
      const entry = byokKeys[keyId as ByokProvider];

      if (entry) {
        byokKeys[keyId as ByokProvider] = {
          ...entry,
          lastUsedAt: new Date(),
          totalRequests: (entry.totalRequests ?? 0) + 1,
        };

        await this.prisma.organizationSetting.updateMany({
          data: { byokKeys: byokKeys as never },
          where: { organizationId },
        });
      }
    } catch (error: unknown) {
      this.logger.error('Failed to increment BYOK usage', {
        error,
        keyId,
        organizationId,
      });
    }
  }

  /**
   * Get the BYOK status for all providers, including masked keys and enabled state.
   */
  async getStatus(orgId: string): Promise<IByokProviderStatus[]> {
    try {
      const settings = await this.organizationSettingsService.findOne({
        organization: orgId,
      });

      const byokKeys = settings ? this.getByokKeys(settings) : {};

      return Object.values(ByokProvider).map((provider) => {
        const entry = byokKeys[provider];
        const config = BYOK_PROVIDER_LABELS[provider];

        let maskedKey: string | null = null;
        if (entry?.apiKey) {
          const decrypted = EncryptionUtil.decrypt(entry.apiKey);
          maskedKey = this.maskKey(decrypted);
        }

        return {
          authMode: entry?.authMode,
          description: config.description,
          docsUrl: config.docsUrl,
          hasKey: !!maskedKey,
          isEnabled: entry?.isEnabled ?? false,
          label: config.label,
          lastUsedAt: entry?.lastUsedAt
            ? new Date(entry.lastUsedAt).toISOString()
            : null,
          lastValidatedAt: entry?.lastValidatedAt
            ? new Date(entry.lastValidatedAt).toISOString()
            : undefined,
          maskedKey,
          provider,
          requiresSecret: config.requiresSecret,
          supportsOAuth: config.supportsOAuth,
          totalRequests: entry?.totalRequests ?? 0,
        };
      });
    } catch (error: unknown) {
      this.logger.error('Failed to get BYOK status', { error, orgId });
      throw error;
    }
  }

  /**
   * Validate an API key against the provider's API.
   */
  async validateKey(
    provider: ByokProvider,
    apiKey: string,
    apiSecret?: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      switch (provider) {
        case ByokProvider.ANTHROPIC:
          return await this.validateAnthropic(apiKey);
        case ByokProvider.OPENAI:
          return await this.validateOpenAI(apiKey);
        case ByokProvider.OPENROUTER:
          return await this.validateOpenRouter(apiKey);
        case ByokProvider.ELEVENLABS:
          return await this.validateElevenLabs(apiKey);
        case ByokProvider.REPLICATE:
          return await this.validateReplicate(apiKey);
        case ByokProvider.FAL:
          return await this.validateFal(apiKey);
        case ByokProvider.HEYGEN:
          return await this.validateHeyGen(apiKey);
        case ByokProvider.HEDRA:
          return await this.validateHedra(apiKey);
        case ByokProvider.KLINGAI:
          return await this.validateKlingAI(apiKey, apiSecret);
        case ByokProvider.LEONARDOAI:
          return await this.validateLeonardoAI(apiKey);
        case ByokProvider.HIGGSFIELD:
          return await this.validateHiggsField(apiKey, apiSecret);
        case ByokProvider.APIFY:
          return await this.validateApify(apiKey);
        default:
          return { error: `Unsupported provider: ${provider}`, isValid: false };
      }
    } catch (error: unknown) {
      this.logger.error('BYOK key validation failed', { error, provider });
      return {
        error: error instanceof Error ? error.message : 'Validation failed',
        isValid: false,
      };
    }
  }

  private getByokKeys(settings: {
    byokKeys?: unknown;
  }): Record<string, IByokKeyEntry> {
    return (settings.byokKeys as Record<string, IByokKeyEntry>) ?? {};
  }

  private async updateByokKey(
    orgId: string,
    provider: ByokProvider,
    entry: IByokKeyEntry,
    enableByok: boolean,
  ): Promise<void> {
    const existing = await this.prisma.organizationSetting.findFirst({
      where: { organizationId: orgId },
    });

    if (!existing) {
      return;
    }

    const byokKeys = this.getByokKeys(existing);
    byokKeys[provider] = entry;

    await this.prisma.organizationSetting.updateMany({
      data: {
        byokKeys: byokKeys as never,
        ...(enableByok && { isByokEnabled: true }),
      },
      where: { organizationId: orgId },
    });
  }

  private async validateAnthropic(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.anthropic.com/v1/models', {
          headers: {
            'anthropic-version': '2023-06-01',
            'x-api-key': apiKey,
          },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Anthropic API key', isValid: false };
    }
  }

  private async validateOpenAI(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid OpenAI API key', isValid: false };
    }
  }

  private maskKey(key: string): string {
    if (key.length <= 8) {
      return '****';
    }
    return `${key.substring(0, 4)}${'*'.repeat(key.length - 8)}${key.substring(key.length - 4)}`;
  }

  private async validateOpenRouter(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            max_tokens: 1,
            messages: [{ content: 'hi', role: 'user' }],
            model: 'deepseek/deepseek-chat',
          },
          { headers: { Authorization: `Bearer ${apiKey}` } },
        ),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid OpenRouter API key', isValid: false };
    }
  }

  private async validateElevenLabs(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': apiKey },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid ElevenLabs API key', isValid: false };
    }
  }

  private async validateReplicate(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.replicate.com/v1/account', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Replicate API key', isValid: false };
    }
  }

  private async validateFal(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://fal.run/fal-ai/flux/dev', {
          headers: { Authorization: `Key ${apiKey}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid fal.ai API key', isValid: false };
    }
  }

  private async validateHeyGen(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.heygen.com/v2/avatars', {
          headers: { 'X-Api-Key': apiKey },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid HeyGen API key', isValid: false };
    }
  }

  private async validateHedra(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://api.hedra.com/v1/voices', {
          headers: { 'X-API-Key': apiKey },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Hedra API key', isValid: false };
    }
  }

  private async validateKlingAI(
    apiKey: string,
    apiSecret?: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    if (!apiSecret) {
      return {
        error: 'Kling AI requires both API key and secret',
        isValid: false,
      };
    }

    try {
      const jwt = encodeJwtToken(apiKey, apiSecret);
      await firstValueFrom(
        this.httpService.get('https://api.klingai.com/v1/images/generations', {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Kling AI credentials', isValid: false };
    }
  }

  private async validateLeonardoAI(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get('https://cloud.leonardo.ai/api/rest/v1/me', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Leonardo.AI API key', isValid: false };
    }
  }

  private async validateHiggsField(
    apiKey: string,
    apiSecret?: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    if (!apiSecret) {
      return {
        error: 'Higgsfield requires both API key and secret',
        isValid: false,
      };
    }

    try {
      await firstValueFrom(
        this.httpService.get('https://platform.higgsfield.ai/models', {
          headers: { Authorization: `Key ${apiKey}:${apiSecret}` },
        }),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Higgsfield credentials', isValid: false };
    }
  }

  private async validateApify(
    apiKey: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `https://api.apify.com/v2/acts?token=${apiKey}&limit=1`,
        ),
      );
      return { isValid: true };
    } catch {
      return { error: 'Invalid Apify API token', isValid: false };
    }
  }
}
