import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  BillingEventKind,
  IBillingEventNotificationPayload,
  IDiscordEmbed,
  IOperatorCardInput,
} from '@genfeedai/contracts/interfaces';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type WebhookMessageCreateOptions,
} from 'discord.js';

// Discord rejects the whole message when one part passes its limit.
const TITLE_LIMIT = 256;
const SUMMARY_LIMIT = 4096;
const FIELD_NAME_LIMIT = 256;
const FIELD_VALUE_LIMIT = 1024;
const MAX_FIELDS = 25;

function fit(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

/**
 * Builds an operator Discord card: a title, one summary line, labelled fields
 * and one link button. Every card the notifications service posts goes through
 * here so they all share the same structure.
 */
export function buildOperatorCard(
  input: IOperatorCardInput,
): Pick<WebhookMessageCreateOptions, 'components' | 'embeds'> {
  const embed: IDiscordEmbed = {
    color: input.color,
    timestamp: new Date().toISOString(),
    title: fit(input.title, TITLE_LIMIT),
  };
  if (input.summary) embed.description = fit(input.summary, SUMMARY_LIMIT);
  const fields = (input.fields ?? [])
    .filter((field) => field.value.trim().length > 0)
    .slice(0, MAX_FIELDS)
    .map((field) => ({
      inline: field.inline ?? true,
      name: fit(field.name, FIELD_NAME_LIMIT),
      value: fit(field.value, FIELD_VALUE_LIMIT),
    }));
  if (fields.length > 0) embed.fields = fields;
  if (input.action) embed.url = input.action.url;
  if (input.footer) embed.footer = { text: input.footer };
  if (input.thumbnailUrl) embed.thumbnail = { url: input.thumbnailUrl };
  if (input.imageUrl) embed.image = { url: input.imageUrl };

  if (!input.action) return { embeds: [embed] };
  return {
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel(input.action.label)
          .setStyle(ButtonStyle.Link)
          .setURL(input.action.url),
      ),
    ],
    embeds: [embed],
  };
}

/** Credits are fractional internally; the cards show at most two decimals. */
export function formatCredits(value: number): string {
  // A positive balance that rounds to 0 would read as depleted.
  if (Number.isFinite(value) && value > 0 && value < 0.005) return '<0.01';
  return Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : String(value);
}

/** The admin user detail page, or null when the app origin is not configured. */
export function adminUserUrl(
  appUrl: string | undefined,
  userId: string,
): string | null {
  return appUrl
    ? `${appUrl}${APP_ROUTES.ADMIN.USERS}/${encodeURIComponent(userId)}`
    : null;
}

/** The admin brand detail page, or null when the app origin is not configured. */
export function adminBrandUrl(
  appUrl: string | undefined,
  brandId: string,
): string | null {
  return appUrl
    ? `${appUrl}${APP_ROUTES.ADMIN.BRANDS}/${encodeURIComponent(brandId)}`
    : null;
}

/** The admin organization detail page, or null when the app origin is not configured. */
export function adminOrganizationUrl(
  appUrl: string | undefined,
  organizationId: string,
): string | null {
  return appUrl
    ? `${appUrl}${APP_ROUTES.ADMIN.ORGANIZATIONS}/${encodeURIComponent(organizationId)}`
    : null;
}

interface IBillingEventCopy {
  color: number;
  summary: string;
  title: string;
}

const BILLING_EVENT_COLORS: Record<BillingEventKind, number> = {
  dispute: 0xff0000,
  payment_failed: 0xff0000,
  refund: 0xffa500,
  subscription_canceled: 0xffa500,
  subscription_created: 0x2ecc71,
};

const BILLING_EVENT_TITLES: Record<BillingEventKind, string> = {
  dispute: 'Dispute Opened',
  payment_failed: 'Payment Failed',
  refund: 'Refund Issued',
  subscription_canceled: 'Subscription Canceled',
  subscription_created: 'New Subscription',
};

/** The title, colour and one-line summary of a subscription or payment card. */
export function describeBillingEvent(
  event: IBillingEventNotificationPayload,
  names: { amount: string; organization: string },
): IBillingEventCopy {
  const { amount, organization } = names;
  const plan = event.planLabel ? ` to ${event.planLabel}` : '';
  const summaries: Record<BillingEventKind, string> = {
    dispute: amount
      ? `${organization} disputed a ${amount} payment.`
      : `${organization} disputed a payment.`,
    payment_failed: amount
      ? `A ${amount} payment from ${organization} failed.`
      : `A payment from ${organization} failed.`,
    refund: amount
      ? `${amount} was refunded to ${organization}.`
      : `A payment was refunded to ${organization}.`,
    subscription_canceled: `${organization} canceled their subscription${event.planLabel ? ` (${event.planLabel})` : ''}.`,
    subscription_created: `${organization} subscribed${plan}.`,
  };
  return {
    color: BILLING_EVENT_COLORS[event.kind],
    summary: summaries[event.kind],
    title: BILLING_EVENT_TITLES[event.kind],
  };
}
