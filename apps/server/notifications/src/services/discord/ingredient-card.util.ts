import { IngredientCategory } from '@genfeedai/contracts';
import {
  createAdminIngredientRoute,
  createBrandAppRoute,
  createLibraryAssetRoute,
} from '@genfeedai/contracts/constants';
import type { IIngredientNotificationData } from '@genfeedai/contracts/interfaces';
import {
  adminBrandUrl,
  adminUserUrl,
  formatCredits,
} from '@notifications/services/discord/operator-card.util';
import { ButtonBuilder, ButtonStyle } from 'discord.js';

export function getIngredientEmbedColor(category: IngredientCategory): number {
  const colorMap: Partial<Record<IngredientCategory, number>> = {
    [IngredientCategory.IMAGE]: 0x00ff00,
    [IngredientCategory.VIDEO]: 0x0099ff,
    [IngredientCategory.AUDIO]: 0xff00ff,
  };
  return colorMap[category] ?? 0xff00ff;
}

const DISCORD_FIELD_VALUE_LIMIT = 1024;

/** Discord rejects the whole embed when one field value passes 1024 characters. */
function fitFieldValue(value: string): string {
  return value.length > DISCORD_FIELD_VALUE_LIMIT
    ? `${value.substring(0, DISCORD_FIELD_VALUE_LIMIT - 3)}...`
    : value;
}

/** A Discord markdown link, or the bare text when there is nowhere to go. */
function linkField(text: string, url: string | null): string {
  return url ? `[${text.replace(/[[\]]/g, '\\$&')}](${url})` : text;
}

const CODE_FENCE = '```';

/**
 * The prompt as a copyable code block. Discord has no copy button for plain
 * text, and a triple backtick inside the prompt would close the block early.
 */
function promptCodeBlock(prompt: string): string {
  const safePrompt = prompt.replaceAll(CODE_FENCE, '`\u200b``');
  const room = DISCORD_FIELD_VALUE_LIMIT - CODE_FENCE.length * 2 - 2;
  const fitted =
    safePrompt.length > room
      ? `${safePrompt.substring(0, room - 3)}...`
      : safePrompt;
  return `${CODE_FENCE}\n${fitted}\n${CODE_FENCE}`;
}

/**
 * The embed link for the asset: its Library page in the organization and brand
 * it lives in, or the admin page when the slugs are missing and the category
 * has one. Null when neither exists or the app origin is not configured.
 */
export function buildIngredientManagerUrl(
  appUrl: string | undefined,
  category: IngredientCategory,
  ingredient: IIngredientNotificationData,
): string | null {
  if (!appUrl) return null;
  const orgSlug = ingredient.owner?.organizationSlug;
  const brandSlug = ingredient.brand?.slug;
  if (orgSlug && brandSlug) {
    return `${appUrl}${createBrandAppRoute(
      encodeURIComponent(orgSlug),
      encodeURIComponent(brandSlug),
      createLibraryAssetRoute(category, ingredient.id),
    )}`;
  }
  const adminRoute = createAdminIngredientRoute(category, ingredient.id);
  return adminRoute ? `${appUrl}${adminRoute}` : null;
}

export function buildIngredientFields(
  ingredient: IIngredientNotificationData,
  appUrl?: string,
): Array<{ name: string; value: string; inline: boolean }> {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (ingredient.prompt?.original) {
    fields.push({
      inline: false,
      name: 'Prompt',
      value: promptCodeBlock(ingredient.prompt.original),
    });
  }

  const { owner } = ingredient;
  const account = [owner?.userName, owner?.userEmail]
    .filter(Boolean)
    .join(' · ');
  if (account) {
    fields.push({
      inline: false,
      name: 'User',
      value: fitFieldValue(
        linkField(
          account,
          owner?.userId ? adminUserUrl(appUrl, owner.userId) : null,
        ),
      ),
    });
  }

  if (owner?.organizationLabel || owner?.organizationId) {
    fields.push({
      inline: true,
      name: 'Organization',
      value: fitFieldValue(
        owner.organizationLabel ?? String(owner.organizationId),
      ),
    });
  }

  if (typeof owner?.creditBalance === 'number') {
    fields.push({
      inline: true,
      name: 'Credits left',
      value: formatCredits(owner.creditBalance),
    });
  }

  if (ingredient.metadata?.model) {
    fields.push({
      inline: true,
      name: 'Model',
      value: ingredient.metadata.model,
    });
  }

  if (ingredient.metadata?.externalProvider) {
    fields.push({
      inline: true,
      name: 'Provider',
      value: ingredient.metadata.externalProvider,
    });
  }

  if (ingredient.brand?.label) {
    fields.push({
      inline: true,
      name: 'Brand',
      value: fitFieldValue(
        linkField(
          ingredient.brand.label,
          ingredient.brand.id
            ? adminBrandUrl(appUrl, ingredient.brand.id)
            : null,
        ),
      ),
    });
  }

  if (ingredient.metadata?.width && ingredient.metadata?.height) {
    fields.push({
      inline: true,
      name: 'Dimensions',
      value: `${ingredient.metadata.width}x${ingredient.metadata.height}`,
    });
  }

  if (ingredient.metadata?.duration) {
    fields.push({
      inline: true,
      name: 'Duration',
      value: `${ingredient.metadata.duration}s`,
    });
  }

  return fields;
}

export function buildIngredientButtons(
  managerUrl: string | null,
  storyboardUrl: string | null = null,
): ButtonBuilder[] {
  const buttons: ButtonBuilder[] = [];

  if (storyboardUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open Storyboard')
        .setStyle(ButtonStyle.Link)
        .setURL(storyboardUrl),
    );
  }

  if (managerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open in Manager')
        .setStyle(ButtonStyle.Link)
        .setURL(managerUrl),
    );
  }

  return buttons;
}
