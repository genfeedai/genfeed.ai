import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mockedConfig = vi.hoisted(() => ({ isCloud: false }));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isCloudDeployment: () => mockedConfig.isCloud,
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

describe('OnboardingReadinessService local tool readiness', () => {
  const instantiateService = async (isCloud: boolean) => {
    mockedConfig.isCloud = isCloud;
    vi.resetModules();

    const { OnboardingReadinessService } = await import(
      './onboarding-readiness.service'
    );

    return new OnboardingReadinessService(
      {} as unknown as BrandsService,
      {} as unknown as OrganizationSettingsService,
      {} as unknown as OrganizationsService,
      {} as unknown as UsersService,
    ) as unknown as {
      getLocalToolReadiness: () => LocalToolReadiness;
    };
  };

  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  afterAll(() => {
    mockedConfig.isCloud = false;
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

describe('OnboardingReadinessService provider readiness', () => {
  const PROVIDER_ENV_KEYS = [
    'FAL_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'REPLICATE_KEY',
  ] as const;

  const getProviderReadiness = async () => {
    vi.resetModules();
    const { OnboardingReadinessService } = await import(
      './onboarding-readiness.service'
    );

    return new OnboardingReadinessService(
      {} as unknown as BrandsService,
      {} as unknown as OrganizationSettingsService,
      {} as unknown as OrganizationsService,
      {} as unknown as UsersService,
    ).getProviderReadiness();
  };

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      vi.stubEnv(key, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports text generation not ready when no provider key is set', async () => {
    const readiness = await getProviderReadiness();

    expect(readiness.textGenerationReady).toBe(false);
    expect(readiness.openrouter).toBe(false);
    expect(readiness.anyConfigured).toBe(false);
    expect(readiness.configured).toEqual([]);
  });

  it('reports text generation ready with a real OpenRouter key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-abcdef0123456789');

    const readiness = await getProviderReadiness();

    expect(readiness.textGenerationReady).toBe(true);
    expect(readiness.openrouter).toBe(true);
    expect(readiness.configured).toEqual(['openrouter']);
  });

  it('does not treat an OpenAI key alone as text generation ready', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-proj-abcdef0123456789');

    const readiness = await getProviderReadiness();

    expect(readiness.openai).toBe(true);
    expect(readiness.textGenerationReady).toBe(false);
  });

  it.each([
    'replace_with_your_key',
    'your_openrouter_key_here',
    'sk-or-...',
    'sk-or-v1-',
    '<openrouter-api-key>',
    'changeme',
    '   ',
  ])('rejects placeholder OpenRouter key %j', async (placeholder) => {
    vi.stubEnv('OPENROUTER_API_KEY', placeholder);

    const readiness = await getProviderReadiness();

    expect(readiness.openrouter).toBe(false);
    expect(readiness.textGenerationReady).toBe(false);
  });

  it('keeps image readiness independent of the text provider', async () => {
    vi.stubEnv('REPLICATE_KEY', 'r8_abcdef0123456789');

    const readiness = await getProviderReadiness();

    expect(readiness.imageGenerationReady).toBe(true);
    expect(readiness.textGenerationReady).toBe(false);
  });
});
