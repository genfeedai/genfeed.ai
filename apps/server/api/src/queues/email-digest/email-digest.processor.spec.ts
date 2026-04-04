import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { EmailDigestProcessor } from '@api/queues/email-digest/email-digest.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

describe('EmailDigestProcessor', () => {
  let processor: EmailDigestProcessor;
  let mockEmailDigestService: { sendDigest: ReturnType<typeof vi.fn> };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockEmailDigestService = {
      sendDigest: vi.fn().mockResolvedValue({
        errors: 0,
        sent: 1,
        skipped: 0,
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmailDigestProcessor,
        { provide: EmailDigestService, useValue: mockEmailDigestService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(EmailDigestProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process email digest job', async () => {
    const mockJob = {
      data: {
        brandId: 'brand-1',
        organizationId: 'org-1',
        recipientEmails: ['test@example.com'],
      },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(mockJob as never);

    expect(result.sent).toBe(1);
    expect(mockEmailDigestService.sendDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        recipientEmails: ['test@example.com'],
      }),
    );
  });

  it('should update progress to 10 and 100', async () => {
    const mockJob = {
      data: {
        brandId: 'brand-1',
        organizationId: 'org-1',
      },
      updateProgress: vi.fn(),
    };

    await processor.process(mockJob as never);

    expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should pass optional date range to sendDigest', async () => {
    const mockJob = {
      data: {
        brandId: 'brand-2',
        endDate: '2026-02-01',
        organizationId: 'org-2',
        startDate: '2026-01-01',
      },
      updateProgress: vi.fn(),
    };

    await processor.process(mockJob as never);

    expect(mockEmailDigestService.sendDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: '2026-02-01',
        startDate: '2026-01-01',
      }),
    );
  });

  it('should propagate errors from sendDigest', async () => {
    mockEmailDigestService.sendDigest.mockRejectedValue(
      new Error('SMTP failure'),
    );
    const mockJob = {
      data: { brandId: 'b', organizationId: 'o' },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(mockJob as never)).rejects.toThrow(
      'SMTP failure',
    );
  });

  it('should return digest result with error count', async () => {
    mockEmailDigestService.sendDigest.mockResolvedValue({
      errors: 2,
      sent: 3,
      skipped: 1,
    });
    const mockJob = {
      data: { brandId: 'b', organizationId: 'o' },
      updateProgress: vi.fn(),
    };

    const result = await processor.process(mockJob as never);
    expect(result.errors).toBe(2);
    expect(result.sent).toBe(3);
  });
});
