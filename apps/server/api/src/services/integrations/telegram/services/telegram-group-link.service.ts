import { randomBytes } from 'node:crypto';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CacheService } from '@api/services/cache/cache.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/** How long an add-bot link works before it has to be started again. */
const LEADING_AT_SIGN_PATTERN = /^@/;
const LINK_TTL_SECONDS = 15 * 60;

/** Telegram allows `A-Z a-z 0-9 _ -` in a start parameter, up to 64 characters. */
const TELEGRAM_LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

interface PendingGroupLink {
  brandId: string;
  organizationId: string;
  userId: string;
}

interface TelegramChatToLink {
  id: number;
  title?: string;
  username?: string;
}

function cacheKey(code: string): string {
  return `telegram:group-link:${code}`;
}

/**
 * Connects a Telegram group to a brand without a pasted token. The signed-in
 * user gets a one-time add-bot link (`t.me/<bot>?startgroup=<code>`); Telegram
 * has them pick a group, adds the bot and sends it `/start <code>` there, which
 * names the brand. The code is the only link between the two, held in the
 * cache for a short time and spent by its first use.
 */
@Traced()
@Injectable()
export class TelegramGroupLinkService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly configService: ConfigService,
  ) {}

  /** The add-bot link for one brand; refused where no bot is configured. */
  async createLink(
    scope: PendingGroupLink,
  ): Promise<{ code: string; url: string }> {
    const username = this.configService.get('TELEGRAM_BOT_USERNAME');
    if (!username || !this.configService.get('TELEGRAM_BOT_TOKEN')) {
      throw new ServiceUnavailableException(
        'Telegram is not set up on this deployment',
      );
    }

    const code = randomBytes(24).toString('base64url');
    const isStored = await this.cacheService.set(cacheKey(code), scope, {
      ttl: LINK_TTL_SECONDS,
    });
    if (!isStored) {
      throw new ServiceUnavailableException(
        'Telegram connections are unavailable right now',
      );
    }

    return {
      code,
      url: `https://t.me/${String(username).replace(LEADING_AT_SIGN_PATTERN, '')}?startgroup=${code}`,
    };
  }

  /**
   * Spend a code and connect the chat that sent it. Answers the brand's name
   * for the bot's reply, or null when the code is unknown, expired or spent.
   */
  async linkChat(
    code: string,
    chat: TelegramChatToLink,
  ): Promise<{ brandLabel: string } | null> {
    if (!TELEGRAM_LINK_CODE_PATTERN.test(code)) {
      return null;
    }

    const pending = await this.cacheService.getdel<PendingGroupLink>(
      cacheKey(code),
    );
    if (!pending) {
      return null;
    }

    const brand = await this.brandsService.findOne({
      id: pending.brandId,
      isDeleted: false,
      organizationId: pending.organizationId,
    });
    if (!brand) {
      return null;
    }

    const created = await this.credentialsService.createPendingForBrand(
      brand,
      pending.userId,
      CredentialPlatform.TELEGRAM,
      {},
    );

    // Identity is the chat, so linking the same group again refreshes its row.
    await this.credentialsService.updateExternalProfile(
      created.id,
      brand.organizationId,
      {
        handle: chat.username,
        id: String(chat.id),
        name: chat.title ?? chat.username ?? String(chat.id),
      },
    );

    return { brandLabel: String(brand.label ?? '') };
  }
}
