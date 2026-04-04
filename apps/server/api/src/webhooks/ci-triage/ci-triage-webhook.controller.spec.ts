import { ConfigService } from '@api/config/config.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { CiTriageWebhookController } from './ci-triage-webhook.controller';
import type { CiTriagePayload } from './ci-triage-webhook.service';
import { CiTriageWebhookService } from './ci-triage-webhook.service';

describe('CiTriageWebhookController', () => {
  let controller: CiTriageWebhookController;

  let mockCiTriageService: {
    diagnoseAndComment: ReturnType<typeof vi.fn>;
  };

  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  const validPayload: CiTriagePayload = {
    failedJobs: [{ failedSteps: ['build'], name: 'build-job' }],
    logExcerpt: 'Error: TypeScript compilation failed',
    prNumber: 42,
    repo: 'genfeedai/cloud',
    runId: 'run-123',
  };

  beforeEach(async () => {
    mockCiTriageService = {
      diagnoseAndComment: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CiTriageWebhookController],
      providers: [
        { provide: CiTriageWebhookService, useValue: mockCiTriageService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<CiTriageWebhookController>(
      CiTriageWebhookController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleCiFailure', () => {
    it('should return status accepted for valid secret', async () => {
      const result = await controller.handleCiFailure(
        validPayload,
        'test-secret',
      );

      expect(result).toEqual({ status: 'accepted' });
    });

    it('should throw UnauthorizedException when secret is wrong', async () => {
      await expect(
        controller.handleCiFailure(validPayload, 'wrong-secret'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when secret is missing', async () => {
      await expect(
        controller.handleCiFailure(validPayload, ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when CI_TRIAGE_WEBHOOK_SECRET is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(
        controller.handleCiFailure(validPayload, 'test-secret'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should fire diagnoseAndComment without awaiting (fire-and-forget)', async () => {
      // The controller calls void service.diagnoseAndComment(payload)
      // so the response should return immediately without waiting
      let resolvePromise!: () => void;
      const longRunningPromise = new Promise<void>((res) => {
        resolvePromise = res;
      });
      mockCiTriageService.diagnoseAndComment.mockReturnValue(
        longRunningPromise,
      );

      const result = await controller.handleCiFailure(
        validPayload,
        'test-secret',
      );

      // Should return immediately even though diagnoseAndComment hasn't resolved
      expect(result).toEqual({ status: 'accepted' });

      // Cleanup
      resolvePromise();
    });

    it('should call diagnoseAndComment with the full payload', async () => {
      await controller.handleCiFailure(validPayload, 'test-secret');

      expect(mockCiTriageService.diagnoseAndComment).toHaveBeenCalledWith(
        validPayload,
      );
    });

    it('should read CI_TRIAGE_WEBHOOK_SECRET from config service', async () => {
      await controller.handleCiFailure(validPayload, 'test-secret');

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'CI_TRIAGE_WEBHOOK_SECRET',
      );
    });

    it('should be decorated with @Controller("webhooks/ci-triage")', () => {
      const path = Reflect.getMetadata('path', CiTriageWebhookController);
      expect(path).toBe('webhooks/ci-triage');
    });

    it('should handle payloads with multiple failed jobs', async () => {
      const multiFailPayload: CiTriagePayload = {
        ...validPayload,
        failedJobs: [
          { failedSteps: ['step-1'], name: 'job-1' },
          { failedSteps: ['step-2', 'step-3'], name: 'job-2' },
        ],
      };

      const result = await controller.handleCiFailure(
        multiFailPayload,
        'test-secret',
      );

      expect(result).toEqual({ status: 'accepted' });
      expect(mockCiTriageService.diagnoseAndComment).toHaveBeenCalledWith(
        multiFailPayload,
      );
    });
  });
});
