import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CiTriagePayload,
  CiTriageWebhookService,
} from './ci-triage-webhook.service';

const makePayload = (
  overrides: Partial<CiTriagePayload> = {},
): CiTriagePayload => ({
  failedJobs: [{ failedSteps: ['type-check'], name: 'ci' }],
  logExcerpt: 'Error: Type mismatch on line 42',
  prNumber: 100,
  repo: 'genfeedai/cloud',
  runId: 'run-abc123',
  ...overrides,
});

describe('CiTriageWebhookService', () => {
  let service: CiTriageWebhookService;

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiTriageWebhookService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<CiTriageWebhookService>(CiTriageWebhookService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('diagnoseAndComment()', () => {
    it('should log error and return early when ANTHROPIC_API_KEY is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.diagnoseAndComment(makePayload());

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('ANTHROPIC_API_KEY not configured'),
      );
    });

    it('should log error and return early when GITHUB_TOKEN is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        return undefined;
      });

      await service.diagnoseAndComment(makePayload());

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_TOKEN not configured'),
      );
    });

    it('should warn and skip when diagnosis limit reached', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      const fetchMock = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          content: [{ text: 'diagnosis' }],
        }),
        ok: true,
      });
      global.fetch = fetchMock;

      const ghFetchMock = vi.fn().mockResolvedValue({
        ok: true,
      });

      // Override fetch to handle both Anthropic and GitHub calls
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ content: [{ text: 'diag' }] }),
        ok: true,
      });

      const payload = makePayload({ prNumber: 999 });
      // Call 5 times to hit the MAX_DIAGNOSES_PER_PR = 5 limit
      for (let i = 0; i < 5; i++) {
        await service.diagnoseAndComment(payload);
      }

      vi.clearAllMocks();
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      // 6th call should warn and skip
      await service.diagnoseAndComment(payload);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('diagnosis limit'),
      );
    });

    it('should call Anthropic API with correct headers', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      global.fetch = vi.fn().mockResolvedValue({
        json: vi
          .fn()
          .mockResolvedValue({ content: [{ text: 'Root cause: type error' }] }),
        ok: true,
      });

      await service.diagnoseAndComment(makePayload({ prNumber: 42 }));

      const [anthropicUrl, anthropicInit] = (
        global.fetch as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(anthropicUrl).toBe('https://api.anthropic.com/v1/messages');
      expect((anthropicInit as RequestInit).headers).toMatchObject({
        'x-api-key': 'sk-test-key',
      });
    });

    it('should post comment to GitHub API after diagnosis', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          json: vi
            .fn()
            .mockResolvedValue({ content: [{ text: 'diagnosis text' }] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: true,
        });
      global.fetch = fetchMock;

      await service.diagnoseAndComment(makePayload({ prNumber: 43 }));

      const [ghUrl] = fetchMock.mock.calls[1];
      expect(ghUrl).toContain('github.com');
      expect(ghUrl).toContain('/issues/43/comments');
    });

    it('should log error when GitHub API returns non-OK response', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ content: [{ text: 'diagnosis' }] }),
          ok: true,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: vi.fn().mockResolvedValue('Forbidden'),
        });

      await service.diagnoseAndComment(makePayload({ prNumber: 44 }));

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('CI triage failed'),
        expect.anything(),
      );
    });

    it('should log success on complete triage', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-test-key';
        if (key === 'GITHUB_TOKEN') return 'ghp-test-token';
        return undefined;
      });

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ content: [{ text: 'diag' }] }),
          ok: true,
        })
        .mockResolvedValueOnce({ ok: true });

      await service.diagnoseAndComment(makePayload({ prNumber: 45 }));

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('CI triage complete'),
      );
    });
  });
});
