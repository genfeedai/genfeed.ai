import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { LinksService } from '@api/collections/links/services/links.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import type { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedConfig = vi.hoisted(() => ({ IS_CLOUD: false }));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    get IS_CLOUD() {
      return mockedConfig.IS_CLOUD;
    },
  };
});

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}));

type LocalToolReadiness = {
  anyDetected: boolean;
  claude: boolean;
  codex: boolean;
  detected: string[];
};

describe('OnboardingService local tool readiness', () => {
  const instantiateService = async (isCloud: boolean) => {
    mockedConfig.IS_CLOUD = isCloud;
    vi.resetModules();

    const { OnboardingService } = await import('./onboarding.service');

    return new OnboardingService(
      {} as unknown as LoggerService,
      {} as unknown as BrandScraperService,
      {} as unknown as MasterPromptGeneratorService,
      {} as unknown as BrandsService,
      {} as unknown as ComfyUIService,
      {} as unknown as CreditsUtilsService,
      {} as unknown as FilesClientService,
      {} as unknown as LinksService,
      {} as unknown as MembersService,
      {} as unknown as OrganizationSettingsService,
      {} as unknown as OrganizationsService,
      {} as unknown as UsersService,
      {} as unknown as ProactiveOnboardingService,
      {} as unknown as RequestContextCacheService,
      {} as unknown as AccessBootstrapCacheService,
      {} as unknown as UserSetupService,
    ) as unknown as {
      getLocalToolReadiness: () => LocalToolReadiness;
    };
  };

  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  afterAll(() => {
    mockedConfig.IS_CLOUD = false;
  });

  it('short-circuits to no detected tools on cloud deployments without shelling out', async () => {
    const service = await instantiateService(true);

    const readiness = service.getLocalToolReadiness();

    expect(readiness).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
    });
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('probes for both CLIs and reports none detected when neither is installed', async () => {
    spawnSyncMock.mockReturnValue({ error: new Error('not found') });

    const service = await instantiateService(false);

    const readiness = service.getLocalToolReadiness();

    expect(readiness).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
    });
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'claude',
      ['--version'],
      expect.objectContaining({ shell: false }),
    );
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'codex',
      ['--version'],
      expect.objectContaining({ shell: false }),
    );
  });

  it('reports both CLIs detected when both binaries resolve on a local deployment', async () => {
    spawnSyncMock.mockReturnValue({ status: 0 });

    const service = await instantiateService(false);

    const readiness = service.getLocalToolReadiness();

    expect(readiness).toEqual({
      anyDetected: true,
      claude: true,
      codex: true,
      detected: ['claude', 'codex'],
    });
  });

  it('reports only the installed CLI when one binary is missing on a local deployment', async () => {
    spawnSyncMock.mockImplementation((command: string) => {
      if (command === 'claude') {
        return { status: 0 };
      }

      return { error: new Error('not found') };
    });

    const service = await instantiateService(false);

    const readiness = service.getLocalToolReadiness();

    expect(readiness).toEqual({
      anyDetected: true,
      claude: true,
      codex: false,
      detected: ['claude'],
    });
  });

  it('treats a non-zero exit status as not detected', async () => {
    spawnSyncMock.mockReturnValue({ status: 1 });

    const service = await instantiateService(false);

    const readiness = service.getLocalToolReadiness();

    expect(readiness).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
    });
  });
});
