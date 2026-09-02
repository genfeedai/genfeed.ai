import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { LoggerService } from '@libs/logger/logger.service';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentToolConfirmationService } from '@server/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import { CacheService } from '@server/services/cache/cache.service';

type ConfirmationFactoryProvider = {
  inject: unknown[];
  provide: unknown;
  useFactory: (
    loggerService: LoggerService,
    cacheService: CacheService,
  ) => unknown;
};

describe('AgentOrchestratorModule', () => {
  it('constructs the confirmation application service through an explicit factory', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AgentOrchestratorModule,
    ) as unknown[];
    const provider = providers.find(
      (candidate): candidate is ConfirmationFactoryProvider =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === AgentToolConfirmationService,
    );

    expect(provider).toEqual(
      expect.objectContaining({
        inject: [LoggerService, CacheService],
        provide: AgentToolConfirmationService,
        useFactory: expect.any(Function),
      }),
    );
    expect(providers).not.toContain(AgentToolConfirmationService);

    const loggerService = {} as LoggerService;
    const cacheService = {} as CacheService;
    expect(provider?.useFactory(loggerService, cacheService)).toBeInstanceOf(
      AgentToolConfirmationService,
    );
  });
});
