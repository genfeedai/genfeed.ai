import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { ByokBillingStatus, SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronByokBillingService } from '@workers/crons/byok-billing/cron.byok-billing.service';

const mockOrg = (id: string) => ({
  byokBillingStatus: ByokBillingStatus.ACTIVE,
  organization: { toString: () => id },
  subscriptionTier: SubscriptionTier.BYOK,
});

describe('CronByokBillingService', () => {
  let service: CronByokBillingService;
  let byokBillingService: {
    createByokInvoice: ReturnType<typeof vi.fn>;
  };
  let organizationSettingsService: {
    findAll: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronByokBillingService,
        {
          provide: ByokBillingService,
          useValue: {
            createByokInvoice: vi.fn().mockResolvedValue({
              feeAmount: 5000,
              invoiceId: 'inv_001',
              rolledOver: false,
              skipped: false,
            }),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findAll: vi.fn().mockResolvedValue({
              docs: [mockOrg('org-1'), mockOrg('org-2')],
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CronByokBillingService);
    byokBillingService = module.get(ByokBillingService);
    organizationSettingsService = module.get(OrganizationSettingsService);
    logger = module.get(LoggerService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('queries BYOK orgs and invoices each one', async () => {
    await service.processMonthlyByokBilling();

    expect(organizationSettingsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          byokBillingStatus: expect.objectContaining({
            not: ByokBillingStatus.SUSPENDED,
          }),
          subscriptionTier: SubscriptionTier.BYOK,
        }),
      }),
      { pagination: false },
    );
    expect(byokBillingService.createByokInvoice).toHaveBeenCalledTimes(2);
    expect(byokBillingService.createByokInvoice).toHaveBeenCalledWith('org-1');
    expect(byokBillingService.createByokInvoice).toHaveBeenCalledWith('org-2');
  });

  it('logs completion with invoiced count and revenue', async () => {
    await service.processMonthlyByokBilling();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({
        invoicedCount: 2,
        totalRevenueCents: 10000,
      }),
    );
  });

  it('increments skippedCount when result.skipped is true', async () => {
    byokBillingService.createByokInvoice.mockResolvedValue({
      rolledOver: false,
      skipped: true,
    });

    await service.processMonthlyByokBilling();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({ invoicedCount: 0, skippedCount: 2 }),
    );
  });

  it('increments rolledOverCount when result.rolledOver is true', async () => {
    byokBillingService.createByokInvoice.mockResolvedValue({
      rolledOver: true,
      skipped: false,
    });

    await service.processMonthlyByokBilling();

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({ rolledOverCount: 2 }),
    );
  });

  it('skips orgs without organization id and increments skippedCount', async () => {
    organizationSettingsService.findAll.mockResolvedValue({
      docs: [{ organization: null }, mockOrg('org-x')],
    });

    await service.processMonthlyByokBilling();

    expect(byokBillingService.createByokInvoice).toHaveBeenCalledTimes(1);
    expect(byokBillingService.createByokInvoice).toHaveBeenCalledWith('org-x');
  });

  it('catches per-org errors and increments failedCount', async () => {
    byokBillingService.createByokInvoice
      .mockRejectedValueOnce(new Error('Stripe error'))
      .mockResolvedValueOnce({
        feeAmount: 3000,
        invoiceId: 'inv_002',
        rolledOver: false,
        skipped: false,
      });

    await service.processMonthlyByokBilling();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed for org org-1'),
      expect.any(Error),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({ failedCount: 1, invoicedCount: 1 }),
    );
  });

  it('handles findAll returning empty docs gracefully', async () => {
    organizationSettingsService.findAll.mockResolvedValue({ docs: [] });

    await service.processMonthlyByokBilling();

    expect(byokBillingService.createByokInvoice).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({ totalOrgs: 0 }),
    );
  });

  it('handles findAll returning null gracefully', async () => {
    organizationSettingsService.findAll.mockResolvedValue(null);

    await service.processMonthlyByokBilling();

    expect(byokBillingService.createByokInvoice).not.toHaveBeenCalled();
  });

  it('logs critical failure when findAll throws', async () => {
    organizationSettingsService.findAll.mockRejectedValue(new Error('DB down'));

    await service.processMonthlyByokBilling();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('critical failure'),
      expect.any(Error),
    );
  });
});
