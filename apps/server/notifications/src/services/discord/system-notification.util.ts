import {
  SYSTEM_EVENT_TYPES,
  type SystemEvent,
} from '@libs/interfaces/system-event.interface';
import { BadRequestException } from '@nestjs/common';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validateSystemEvent(event: unknown): SystemEvent {
  if (
    !record(event) ||
    event.version !== 1 ||
    typeof event.id !== 'string' ||
    !/^[a-zA-Z0-9_./-]{1,200}$/.test(event.id) ||
    !SYSTEM_EVENT_TYPES.some((type) => type === event.type) ||
    typeof event.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    !record(event.data) ||
    typeof event.data.objectId !== 'string' ||
    event.data.objectId.length > 200
  )
    throw new BadRequestException('Invalid event');
  const objectId = event.data.objectId;
  const data = event.data;
  for (const key of ['email', 'customerId', 'currency', 'status'])
    if (
      data[key] !== undefined &&
      (typeof data[key] !== 'string' || data[key].length > 320)
    )
      throw new BadRequestException('Invalid event data');
  for (const key of ['amountMinor', 'credits'])
    if (
      data[key] !== undefined &&
      (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0)
    )
      throw new BadRequestException('Invalid event amount');
  if (
    data.cancelAtPeriodEnd !== undefined &&
    typeof data.cancelAtPeriodEnd !== 'boolean'
  )
    throw new BadRequestException('Invalid event status');
  if (
    [
      'subscription.payment_succeeded',
      'credits.purchased',
      'payment.failed',
    ].includes(String(event.type)) &&
    (typeof data.amountMinor !== 'number' ||
      typeof data.currency !== 'string' ||
      !/^[a-z]{3}$/.test(data.currency))
  )
    throw new BadRequestException('Missing payment amount');
  return {
    version: 1,
    id: event.id,
    type: event.type as SystemEvent['type'],
    occurredAt: new Date(event.occurredAt).toISOString(),
    data: {
      objectId,
      ...(typeof data.email === 'string' ? { email: data.email } : {}),
      ...(typeof data.customerId === 'string'
        ? { customerId: data.customerId }
        : {}),
      ...(typeof data.amountMinor === 'number'
        ? { amountMinor: data.amountMinor }
        : {}),
      ...(typeof data.currency === 'string' ? { currency: data.currency } : {}),
      ...(typeof data.credits === 'number' ? { credits: data.credits } : {}),
      ...(typeof data.status === 'string' ? { status: data.status } : {}),
      ...(typeof data.cancelAtPeriodEnd === 'boolean'
        ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd }
        : {}),
    },
  };
}

export function discordWebhookUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'discord.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)
    )
      return null;
    url.searchParams.set('wait', 'true');
    return url;
  } catch {
    return null;
  }
}

const titles: Record<SystemEvent['type'], string> = {
  'user.created': 'New signup',
  'subscription.created': 'Subscription created',
  'subscription.updated': 'Subscription updated',
  'subscription.canceled': 'Subscription canceled',
  'subscription.payment_succeeded': 'Subscription payment received',
  'payment.failed': 'Payment failed',
  'credits.purchased': 'Credits purchased',
};

export function discordMessage(event: SystemEvent) {
  const free =
    event.data.amountMinor === 0 &&
    ['subscription.payment_succeeded', 'credits.purchased'].includes(
      event.type,
    );
  const fields = [
    { name: 'Reference', value: event.data.objectId.slice(0, 200) },
  ];
  if (event.data.email) fields.push({ name: 'Email', value: event.data.email });
  if (event.data.customerId)
    fields.push({ name: 'Customer', value: event.data.customerId });
  if (event.data.amountMinor !== undefined && event.data.currency) {
    const currency = event.data.currency.toUpperCase();
    const digits =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    fields.push({
      name: event.type === 'payment.failed' ? 'Amount due' : 'Amount collected',
      value: new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).format(event.data.amountMinor / 10 ** digits),
    });
  }
  if (event.data.credits !== undefined)
    fields.push({ name: 'Credits', value: String(event.data.credits) });
  if (event.data.status)
    fields.push({ name: 'Status', value: event.data.status });
  if (event.data.cancelAtPeriodEnd)
    fields.push({ name: 'Cancellation', value: 'Scheduled for period end' });
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: free
          ? 'Free redemption — no payment collected'
          : titles[event.type],
        color:
          event.type === 'payment.failed'
            ? 0xef4444
            : free
              ? 0x94a3b8
              : 0x22c55e,
        fields,
        timestamp: event.occurredAt,
        footer: { text: event.id },
      },
    ],
  };
}
