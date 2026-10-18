import {
  accountToolText,
  dataToolResult,
  formatToolData,
} from '@mcp/shared/utils/tool-result-text.util';

describe('MCP readable tool results', () => {
  it('confirms a profile lookup without exposing internal identifiers', () => {
    expect(
      accountToolText({
        profile: {
          isOnboardingCompleted: true,
          organizationId: 'org-private',
          role: 'user',
          userId: 'user-private',
        },
      }),
    ).toBe('Connected to Genfeed.\nRole: User\nAccount setup: Complete');
  });

  it('names the organization, active brand and brands next to the ids it hides (#7138)', () => {
    const text = accountToolText({
      profile: {
        brandCount: 2,
        brandId: 'brand-private',
        brandName: 'Beta',
        brands: [
          { id: 'brand-private', name: 'Beta' },
          { id: 'brand-other', name: 'Acme' },
        ],
        organizationId: 'org-private',
        organizationName: 'Acme Studio',
        role: 'admin',
        userId: 'user-private',
      },
    });

    expect(text).toBe(
      [
        'Connected to Genfeed.',
        'Organization: Acme Studio',
        'Role: Admin',
        'Active brand: Beta',
        'Brands (2): Beta, Acme',
      ].join('\n'),
    );
    expect(text).not.toMatch(/private|brand-other/);
  });

  it('reads a count when the brand names are unavailable (#7276)', () => {
    expect(accountToolText({ profile: { brandCount: 3, role: 'user' } })).toBe(
      'Connected to Genfeed.\nRole: User\nBrands: 3',
    );
  });

  it('points a caller with no brands at the app and an admin (#7176)', () => {
    const text = accountToolText(
      { profile: { brandCount: 0, brands: [], role: 'user' } },
      { brandsUrl: 'https://app.genfeed.ai/settings/brands' },
    );

    expect(text).toContain('Brands: none yet');
    expect(text).toContain('https://app.genfeed.ai/settings/brands');
    expect(text).toContain('organization admin');
  });

  it('distinguishes zero balances from unavailable balances and reports usage', () => {
    expect(
      accountToolText({
        credits: { balance: 0 },
        usage: {
          usage7Days: 12,
          usage30Days: 40,
          trendPercentage: -5,
          breakdown: [{ source: 'image', amount: 12, count: 3 }],
        },
      }),
    ).toContain('Credits available: 0');
    expect(accountToolText({ credits: { balance: null } })).toContain(
      'Credits available: Unavailable',
    );
    expect(
      accountToolText({ usage: { usage7Days: 12, usage30Days: 40 } }),
    ).toContain('Credits used in the last 7 days: 12');
  });

  it('keeps names, metrics, and follow-up data while hiding technical fields', () => {
    const data = {
      brands: [
        {
          id: 'brand-private',
          name: 'Genfeed',
          organizationId: 'org-private',
          isActive: true,
          credentials: [{ accessToken: 'secret' }],
        },
      ],
      nextCursor: 'cursor-private',
    };
    const result = dataToolResult(data, 'Brands');
    expect(result.structuredContent.data).toBe(data);
    expect(result.content[0].text).toContain('Genfeed');
    expect(result.content[0].text).not.toMatch(/private|secret|\{|\}/);
    expect(formatToolData({ brands: [] })).toBe('Brands: None found.');
  });

  it('preserves content verbatim, bounds lists, and does not invent success', () => {
    expect(
      formatToolData({ status: 'FAILED', message: 'Try again.' }),
    ).toContain('Status: Failed');
    expect(formatToolData({ content: 'A {literal} code example' })).toContain(
      'A {literal} code example',
    );
    expect(
      formatToolData({ cost: { credits: null }, isAvailable: false }),
    ).toContain('Credits: Unavailable');
    expect(
      formatToolData(
        Array.from({ length: 30 }, (_, i) => ({ name: `Item ${i}` })),
      ),
    ).toContain('6 more');
  });

  it('keeps validation and token health metrics visible, while omitting auth material', () => {
    const text = formatToolData({
      isValid: false,
      tokenFreshness: 'pass',
      accessToken: 'secret',
      authToken: 'secret',
      external_id: 'opaque',
      result: { organizationId: 'private', name: 'Example' },
    });
    expect(text).toContain('Is Valid: No');
    expect(text).toContain('Token Freshness: pass');
    expect(text).not.toMatch(/secret|opaque|private/);
  });
  it('keeps connection links usable without displaying URL identifiers as text', () => {
    const data = {
      authorizationUrl: 'https://example.com/oauth?state=private',
      userID: 'private',
      id: 'private',
      isValid: true,
    };
    const result = dataToolResult(data);
    expect(result.content[0].text).toContain(
      '[Open authorization](https://example.com/oauth?state=private)',
    );
    expect(result.content[0].text.replace(/\]\([^)]*\)/g, ']')).not.toContain(
      'private',
    );
    expect(result.structuredContent.data).toBe(data);
  });
});
