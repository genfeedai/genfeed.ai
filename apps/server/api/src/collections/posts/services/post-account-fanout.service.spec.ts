import type { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAccountFanoutService } from '@api/collections/posts/services/post-account-fanout.service';
import type { LoggerService } from '@libs/logger/logger.service';

vi.mock(
  '@api/collections/content-intelligence/services/content-generator.service',
  () => ({ ContentGeneratorService: class {} }),
);
vi.mock('@api/collections/credentials/services/credentials.service', () => ({
  CredentialsService: class {},
}));

describe('PostAccountFanoutService', () => {
  const credentials = { findConnectedAccounts: vi.fn() };
  const generator = { generateContent: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const input = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    caption: 'Ship one useful idea every day.',
    platforms: ['twitter'],
  };
  let service: PostAccountFanoutService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new PostAccountFanoutService(
      credentials as unknown as CredentialsService,
      generator as unknown as ContentGeneratorService,
      logger as unknown as LoggerService,
    );
    credentials.findConnectedAccounts.mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
    ]);
  });

  it('fails without returning duplicate targets when generation fails', async () => {
    generator.generateContent.mockRejectedValue(
      new Error('provider unavailable'),
    );
    await expect(service.resolveTargets(input)).rejects.toThrow(
      'provider unavailable',
    );
  });

  it('fails when the provider returns only source copies', async () => {
    generator.generateContent.mockResolvedValue([{ content: input.caption }]);
    await expect(service.resolveTargets(input)).rejects.toThrow('distinct');
  });

  it('rejects insufficient valid variations instead of padding accounts', async () => {
    credentials.findConnectedAccounts.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    generator.generateContent.mockResolvedValue([
      {
        content:
          'A practical checklist turns research into a repeatable habit.',
      },
    ]);
    await expect(service.resolveTargets(input)).rejects.toThrow('distinct');
  });

  it('preserves one valid caption and assigns a distinct sibling caption', async () => {
    generator.generateContent.mockResolvedValue([
      {
        content:
          'A practical checklist turns research into a repeatable habit.',
      },
    ]);
    const targets = await service.resolveTargets(input);
    expect(targets.map((target) => target.credentialId)).toEqual([
      'account-1',
      'account-2',
    ]);
    expect(new Set(targets.map((target) => target.caption)).size).toBe(2);
    expect(credentials.findConnectedAccounts).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'twitter',
    );
  });

  it('normalizes repeated platform aliases without duplicate account targets', async () => {
    credentials.findConnectedAccounts.mockResolvedValue([{ id: 'account-1' }]);
    const targets = await service.resolveTargets({
      ...input,
      platforms: ['twitter', 'x', 'twitter'],
    });
    expect(targets).toHaveLength(1);
    expect(credentials.findConnectedAccounts).toHaveBeenCalledTimes(1);
  });

  it('adapts for each platform even with one account on each', async () => {
    credentials.findConnectedAccounts.mockImplementation(
      async (_org: string, _brand: string, platform: string) => [
        { id: platform },
      ],
    );
    generator.generateContent
      .mockResolvedValueOnce([
        { content: 'Build a habit around one sharp observation.' },
      ])
      .mockResolvedValueOnce([
        {
          content:
            'Our team connected customer research to a weekly editorial review. Here is what changed.',
        },
      ]);
    const targets = await service.resolveTargets({
      ...input,
      platforms: ['twitter', 'linkedin'],
    });
    expect(generator.generateContent).toHaveBeenCalledTimes(2);
    expect(targets[0]?.caption).not.toBe(targets[1]?.caption);
    expect(
      generator.generateContent.mock.calls.map((call) => call[1].platform),
    ).toEqual(['twitter', 'linkedin']);
  });

  it('does not accept over-limit source text for a single account', async () => {
    credentials.findConnectedAccounts.mockResolvedValue([{ id: 'account-1' }]);
    await expect(
      service.resolveTargets({ ...input, caption: 'x'.repeat(281) }),
    ).rejects.toThrow('platform');
  });

  it('returns no targets for disconnected platforms without generating', async () => {
    credentials.findConnectedAccounts.mockResolvedValue([]);
    expect(await service.resolveTargets(input)).toEqual([]);
    expect(generator.generateContent).not.toHaveBeenCalled();
  });
});
