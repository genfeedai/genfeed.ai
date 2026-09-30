import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import { VISUAL_CODE_RENDERER_VERSION } from '@genfeedai/contracts/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

type RendererConfigurationValue = string | boolean | number | undefined;
interface RendererConfigurationFixture {
  VISUAL_CODE_RENDERER_ENABLED: RendererConfigurationValue;
  VISUAL_CODE_RENDERER_URL: RendererConfigurationValue;
  VISUAL_CODE_RENDERER_TOKEN: RendererConfigurationValue;
  VISUAL_CODE_RENDER_CREDITS_PER_SECOND: RendererConfigurationValue;
}
interface InvalidRendererConfigurationCase {
  key: 'VISUAL_CODE_RENDERER_URL' | 'VISUAL_CODE_RENDERER_TOKEN';
  value: RendererConfigurationValue;
}

function fixture(overrides: Partial<RendererConfigurationFixture> = {}) {
  const values: RendererConfigurationFixture = {
    VISUAL_CODE_RENDERER_ENABLED: 'true',
    VISUAL_CODE_RENDERER_URL: 'https://renderer.example.test',
    VISUAL_CODE_RENDERER_TOKEN: 'fixture-token',
    VISUAL_CODE_RENDER_CREDITS_PER_SECOND: '0.01',
    ...overrides,
  };
  const service = new VisualProjectRendererClientService({
    get: (key: keyof RendererConfigurationFixture) => values[key],
  } as never);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        isReady: true,
        rendererVersion: VISUAL_CODE_RENDERER_VERSION,
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return { service, fetchMock };
}

const invalidConfigurationKeys: InvalidRendererConfigurationCase['key'][] = [
  'VISUAL_CODE_RENDERER_URL',
  'VISUAL_CODE_RENDERER_TOKEN',
];
const invalidConfigurations: InvalidRendererConfigurationCase[] =
  invalidConfigurationKeys.flatMap((key) =>
    [undefined, '', true, 1].map((value) => ({ key, value })),
  );

afterEach(() => vi.unstubAllGlobals());

describe('visual-renderer-config-strings', () => {
  it.each(invalidConfigurations)(
    'rejects $key=$value before network access',
    async ({ key, value }) => {
      const { service, fetchMock } = fixture({ [key]: value });
      expect(() => service.configuration()).toThrow(
        'visual_code_renderer_unavailable',
      );
      expect(await service.availability()).toEqual({
        isAvailable: false,
        unavailableReason: 'visual_code_renderer_unavailable',
        creditsPerSecond: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'false', false])(
    'stays unavailable with enabled=%s even with valid endpoint credentials',
    async (enabled) => {
      const { service, fetchMock } = fixture({
        VISUAL_CODE_RENDERER_ENABLED: enabled,
      });
      expect(await service.availability()).toEqual({
        isAvailable: false,
        unavailableReason: 'visual_code_renderer_unavailable',
        creditsPerSecond: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://renderer.example.test',
    'http://localhost:4321',
    'http://127.0.0.1:4321',
    'http://[::1]:4321',
  ])(
    'accepts the configured origin %s without following redirects',
    async (endpoint) => {
      const { service, fetchMock } = fixture({
        VISUAL_CODE_RENDERER_URL: endpoint,
      });
      expect(service.configuration()).toEqual({
        endpoint,
        token: 'fixture-token',
        rate: 0.01,
      });
      expect(await service.availability()).toEqual({
        isAvailable: true,
        unavailableReason: null,
        creditsPerSecond: 0.01,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        `${endpoint}/health`,
        expect.objectContaining({
          method: 'GET',
          redirect: 'error',
          headers: {
            authorization: 'Bearer fixture-token',
            'content-type': 'application/json',
          },
          signal: expect.any(AbortSignal),
        }),
      );
    },
  );

  it.each([
    'https://user:secret@renderer.example.test',
    'https://renderer.example.test/path',
    'https://renderer.example.test?query=1',
    'https://renderer.example.test#fragment',
    'http://renderer.example.test',
  ])(
    'rejects a non-origin or unsafe URL %s before fetching',
    async (endpoint) => {
      const { service, fetchMock } = fixture({
        VISUAL_CODE_RENDERER_URL: endpoint,
      });
      expect(() => service.configuration()).toThrow(
        'visual_code_renderer_configuration_invalid',
      );
      expect((await service.availability()).isAvailable).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['-1', 'NaN', 'Infinity'])(
    'preserves fail-closed finite nonnegative rate validation for %s',
    async (rate) => {
      const { service, fetchMock } = fixture({
        VISUAL_CODE_RENDER_CREDITS_PER_SECOND: rate,
      });
      expect(() => service.configuration()).toThrow(
        'visual_code_renderer_unavailable',
      );
      expect((await service.availability()).isAvailable).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
