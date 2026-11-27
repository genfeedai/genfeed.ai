import { TrendBrandReadService } from '@api/collections/trends/services/modules/trend-brand-read.service';
import { ResearchScanLimitReachedException } from '@api/helpers/exceptions/research-scan-limit/research-scan-limit.exception';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const ORG = 'org-1';
const BRAND = 'brand-1';

const LIMIT_REACHED = new ResearchScanLimitReachedException({
  hasPlan: false,
  library: 'trends',
  limit: { maxScans: 1, windowMs: 7 * 24 * 60 * 60 * 1000 },
  nextAvailableAt: new Date('2026-12-04T10:00:00.000Z'),
});

type ScanInput = { library: string; requiresPlan?: boolean };

/**
 * A read of a brand with no niche videos, with the scan limit stood in for by
 * `runScan`. What is observed is what the read did: the searches that ran, the
 * scans that were asked for and the failures it logged.
 */
function setup(
  runScan: (input: ScanInput, run: () => Promise<number>) => Promise<number>,
) {
  const searches: string[] = [];
  const scans: ScanInput[] = [];
  const warnings: Array<{ error: unknown; message: string }> = [];
  const service = new TrendBrandReadService(
    {
      claimOnce: vi.fn().mockResolvedValue('claimed'),
      generateKey: (...parts: string[]) => parts.join(':'),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    } as never,
    {
      warn: (message: string, context: { error: unknown }) =>
        warnings.push({ error: context.error, message }),
    } as never,
    { hasSnapshot: vi.fn().mockResolvedValue(false) } as never,
    {
      runScan: (input: ScanInput, run: () => Promise<number>) => {
        scans.push(input);
        return runScan(input, run);
      },
    } as never,
  );
  const read = async () => {
    await service.noteRead(ORG, BRAND, async (org, brand) => {
      searches.push(`${org}/${brand}`);
      return 3;
    });
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { read, scans, searches, warnings };
}

describe('the first read of a brand with no niche videos (#11623)', () => {
  it('searches inside one trends scan that needs a plan', async () => {
    const { read, scans, searches } = setup((_input, run) => run());

    await read();

    expect(scans).toEqual([
      {
        library: 'trends',
        organizationId: ORG,
        requiresPlan: true,
        subjectKey: BRAND,
      },
    ]);
    expect(searches).toEqual([`${ORG}/${BRAND}`]);
  });

  it.each([
    ['an organization that used its scans', LIMIT_REACHED],
    [
      'an organization without a plan',
      new ServiceUnavailableException('research_paid_access_required'),
    ],
  ])('starts no search for %s and logs no failure', async (_name, refusal) => {
    const { read, searches, warnings } = setup(async () => {
      throw refusal;
    });

    await read();

    expect({ searches, warnings }).toEqual({ searches: [], warnings: [] });
  });

  it('still reports a search that failed for another reason', async () => {
    const { read, warnings } = setup(async () => {
      throw new Error('the scraper is down');
    });

    await read();

    expect(warnings).toEqual([
      {
        error: 'the scraper is down',
        message: 'On-demand brand niche refresh failed',
      },
    ]);
  });
});
