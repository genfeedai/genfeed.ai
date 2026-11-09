import {
  collectionDocument,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { installFakeHttpRoutes } from '@services/__mocks__/http-routes.fake';
import {
  BrandSubscriberRecord,
  NewsletterModuleService,
} from '@services/content/newsletter-module.service';
import { beforeEach, describe, expect, it } from 'vitest';

const echo = (body: unknown) => ({ data: { received: body } });
const brand = '/brands/brand%201/newsletter';

describe('NewsletterModuleService HTTP methods', () => {
  let service: NewsletterModuleService;
  let server: ReturnType<typeof installFakeHttpRoutes>;

  beforeEach(() => {
    service = new NewsletterModuleService('newsletter-token');
    server = installFakeHttpRoutes(service, {
      [`DELETE ${brand}/subscribers/sub%2F1`]: {},
      [`GET ${brand}/analytics?from=2026-11-01`]: {
        data: { opens: 3 },
      },
      [`GET ${brand}/sends?newsletterId=nl_1`]: collectionDocument([
        { id: 'send_1', status: 'sent' },
      ]),
      [`GET ${brand}/settings`]: resourceDocument(
        { senderName: 'Jane' },
        { id: 'settings_1' },
      ),
      [`GET ${brand}/subscribers/export`]: 'email\njane@example.com\n',
      [`GET ${brand}/subscribers/stats`]: { data: { total: 2 } },
      [`GET ${brand}/subscribers?status=confirmed`]: collectionDocument([
        { email: 'jane@example.com', id: 'sub_1' },
      ]),
      [`GET ${brand}/usage`]: { data: { used: 1 } },
      'GET /newsletters/nl_1/email-preview?gated=false': {
        data: { subject: 'Hello' },
      },
      'GET /newsletters/nl_1/email-preview?gated=true': {
        data: { subject: 'Gated hello' },
      },
      'PATCH /newsletter-sends/send_1': (body: unknown) =>
        resourceDocument({ action: (body as { action: string }).action }),
      [`PATCH ${brand}/settings`]: (body: unknown) =>
        resourceDocument({ ...(body as object) }, { id: 'settings_1' }),
      [`POST ${brand}/subscribers`]: echo,
      [`POST ${brand}/subscribers/imports`]: echo,
      [`POST ${brand}/subscribers/sub%2F1/confirmation`]: {},
      'POST /newsletters/nl_1/sends': (body: unknown) =>
        resourceDocument({ ...(body as object) }, { id: 'send_2' }),
      'POST /newsletters/nl_1/test-send': { data: { to: 'me@example.com' } },
    });
  });

  it('lists subscribers as records with an empty tag default', async () => {
    const page = await service.listSubscribers('brand 1', {
      status: 'confirmed',
    });

    expect(page.items[0]).toBeInstanceOf(BrandSubscriberRecord);
    expect(page.items[0]).toMatchObject({
      email: 'jane@example.com',
      tags: [],
    });
  });

  it('reads stats, usage and analytics for a date range', async () => {
    await expect(service.getSubscriberStats('brand 1')).resolves.toEqual({
      total: 2,
    });
    await expect(service.getUsage('brand 1')).resolves.toEqual({ used: 1 });
    await expect(
      service.getAnalytics('brand 1', { from: '2026-11-01' }),
    ).resolves.toEqual({ opens: 3 });
  });

  it('adds and imports subscribers with the given consent', async () => {
    const added = { emails: ['jane@example.com'], hasConsent: true };
    const imported = { csv: 'email\njane@example.com', isPreview: true };

    await expect(service.addSubscribers('brand 1', added)).resolves.toEqual({
      received: added,
    });
    await expect(
      service.importSubscribers('brand 1', imported),
    ).resolves.toEqual({ received: imported });
  });

  it('exports subscribers as raw csv text', async () => {
    await expect(service.exportSubscribers('brand 1')).resolves.toBe(
      'email\njane@example.com\n',
    );
  });

  it('removes a subscriber and resends its confirmation', async () => {
    await expect(
      service.removeSubscriber('brand 1', 'sub/1'),
    ).resolves.toBeUndefined();
    await expect(
      service.resendConfirmation('brand 1', 'sub/1'),
    ).resolves.toBeUndefined();
  });

  it('reads and updates the sending settings', async () => {
    await expect(service.getSettings('brand 1')).resolves.toMatchObject({
      senderName: 'Jane',
    });
    await expect(
      service.updateSettings('brand 1', { senderName: 'Jane Doe' } as never),
    ).resolves.toMatchObject({ senderName: 'Jane Doe' });
  });

  it('lists the sends of one newsletter', async () => {
    const page = await service.listSends('brand 1', { newsletterId: 'nl_1' });

    expect(page.items).toMatchObject([{ id: 'send_1', status: 'sent' }]);
  });

  it('sends an issue and controls a send', async () => {
    await expect(
      service.sendIssue('nl_1', { scheduledFor: '2026-11-10T08:00:00Z' }),
    ).resolves.toMatchObject({ scheduledFor: '2026-11-10T08:00:00Z' });
    await expect(
      service.controlSend('send_1', 'pause' as never),
    ).resolves.toMatchObject({ action: 'pause' });
    expect(server.bodies['PATCH /newsletter-sends/send_1']).toEqual([
      { action: 'pause' },
    ]);
  });

  it('previews the email and sends a test to the owner', async () => {
    await expect(service.getEmailPreview('nl_1')).resolves.toEqual({
      subject: 'Hello',
    });
    await expect(service.getEmailPreview('nl_1', true)).resolves.toEqual({
      subject: 'Gated hello',
    });
    await expect(service.sendTest('nl_1')).resolves.toEqual({
      to: 'me@example.com',
    });
  });
});
