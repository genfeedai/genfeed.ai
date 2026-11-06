import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { WhatsappController } from '@api/services/integrations/whatsapp/controllers/whatsapp.controller';
import type { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import type {
  IWhatsappSendMessageParams,
  IWhatsappSendTemplateParams,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

interface Sent {
  kind: 'media' | 'template' | 'text';
  params: IWhatsappSendMessageParams | IWhatsappSendTemplateParams;
  sid: string;
}

const user = { brandId: 'brand-1', organizationId: 'org-1' } as User;

const badRequest = (detail: string) => ({
  response: { detail, title: 'Invalid payload' },
  status: HttpStatus.BAD_REQUEST,
});

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let outbox: Sent[];

  beforeEach(() => {
    outbox = [];
    const brands = [
      { id: 'brand-1', organizationId: 'org-1' },
      { id: 'brand-other', organizationId: 'org-2' },
    ];
    const brandsService = {
      findOneSelect: async (where: { id: string; organizationId: string }) => {
        const brand = brands.find(
          (row) =>
            row.id === where.id && row.organizationId === where.organizationId,
        );
        return brand ? { id: brand.id } : null;
      },
    } as unknown as BrandsService;

    // A Twilio outbox: every send is kept with the sid it was given.
    const send = (kind: Sent['kind'], params: Sent['params']) => {
      const sid = `SM${outbox.length + 1}`;
      outbox.push({ kind, params, sid });
      return Promise.resolve({ sid, status: 'queued' });
    };
    const whatsappService = {
      getMessageStatus: async (sid: string) => {
        const message = outbox.find((sent) => sent.sid === sid);
        return { sid, status: message ? 'delivered' : 'unknown' };
      },
      sendMediaMessage: (params: IWhatsappSendMessageParams) =>
        send('media', params),
      sendTemplateMessage: (params: IWhatsappSendTemplateParams) =>
        send('template', params),
      sendTextMessage: (params: IWhatsappSendMessageParams) =>
        send('text', params),
    } as unknown as WhatsappService;
    const logger = { log: () => undefined } as unknown as LoggerService;

    controller = new WhatsappController(whatsappService, brandsService, logger);
  });

  describe('sendMessage', () => {
    it('sends a text message for an own brand', async () => {
      const body = { body: 'Hello!', brandId: 'brand-1', to: '+1234567890' };

      await expect(controller.sendMessage(user, body)).resolves.toEqual({
        data: { sid: 'SM1', status: 'queued' },
      });
      expect(outbox).toEqual([{ kind: 'text', params: body, sid: 'SM1' }]);
    });

    it('sends a media message when a media URL is given', async () => {
      const body = {
        body: 'Check this out',
        brandId: 'brand-1',
        mediaUrl: 'https://cdn.example.com/image.jpg',
        to: '+1234567890',
      };

      await controller.sendMessage(user, body);

      expect(outbox).toEqual([{ kind: 'media', params: body, sid: 'SM1' }]);
    });

    it.each([
      ['no brand', '', 'Brand ID is required'],
      [
        "another organization's brand",
        'brand-other',
        'You do not have access to this brand',
      ],
    ])('refuses %s and sends nothing', async (_case, brandId, detail) => {
      await expect(
        controller.sendMessage(user, { body: 'Hi', brandId, to: '+1' }),
      ).rejects.toMatchObject(badRequest(detail));
      expect(outbox).toEqual([]);
    });
  });

  describe('sendTemplateMessage', () => {
    it('sends a template for an own brand', async () => {
      const body = {
        brandId: 'brand-1',
        templateSid: 'HX123',
        to: '+19998887777',
      };

      await expect(controller.sendTemplateMessage(user, body)).resolves.toEqual(
        { data: { sid: 'SM1', status: 'queued' } },
      );
      expect(outbox).toEqual([{ kind: 'template', params: body, sid: 'SM1' }]);
    });

    it.each([
      ['no brand', '', 'Brand ID is required'],
      [
        "another organization's brand",
        'brand-other',
        'You do not have access to this brand',
      ],
    ])('refuses %s and sends nothing', async (_case, brandId, detail) => {
      await expect(
        controller.sendTemplateMessage(user, {
          brandId,
          templateSid: 'HX123',
          to: '+1',
        }),
      ).rejects.toMatchObject(badRequest(detail));
      expect(outbox).toEqual([]);
    });
  });

  describe('getMessageStatus', () => {
    it('reads the status of a sent message for an own brand', async () => {
      await controller.sendMessage(user, {
        body: 'Hi',
        brandId: 'brand-1',
        to: '+1',
      });

      await expect(
        controller.getMessageStatus(user, 'SM1', 'brand-1'),
      ).resolves.toEqual({ data: { sid: 'SM1', status: 'delivered' } });
    });

    it('checks the brand against the selected organization scope', async () => {
      await expect(
        runWithTenantReadScope(
          {
            brandId: 'brand-other',
            isOrganizationOverride: true,
            organizationId: 'org-2',
          },
          () => controller.getMessageStatus(user, 'SM1', 'brand-other'),
        ),
      ).resolves.toEqual({ data: { sid: 'SM1', status: 'unknown' } });
    });

    it.each([
      ['no brand', '', 'Brand ID is required'],
      [
        "another organization's brand",
        'brand-other',
        'You do not have access to this brand',
      ],
    ])('refuses %s', async (_case, brandId, detail) => {
      await expect(
        controller.getMessageStatus(user, 'SM1', brandId),
      ).rejects.toMatchObject(badRequest(detail));
    });
  });
});
