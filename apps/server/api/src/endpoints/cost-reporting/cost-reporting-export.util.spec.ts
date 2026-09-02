import type { ICostReportEntry } from '@genfeedai/contracts/interfaces/billing';
import { buildCostReportCsv } from './cost-reporting-export.util';

describe('buildCostReportCsv', () => {
  it('exports the normalized ledger and neutralizes spreadsheet formulas', () => {
    const entry: ICostReportEntry = {
      brandId: 'brand-1',
      brandLabel: '=IMPORTXML("https://bad.example")',
      category: 'image',
      createdAt: '2026-08-20T10:00:00.000Z',
      creditsUsed: 0,
      entryType: 'media',
      id: 'media-1',
      isByok: false,
      model: '+danger',
      provider: 'replicate',
      providerCostMicros: 125_000,
      providerCostUsd: 0.125,
      referenceId: 'ingredient-1',
    };

    const csv = buildCostReportCsv([entry]);

    expect(csv).toContain('created_at,entry_type,brand_id,brand');
    expect(csv).toContain("'=IMPORTXML");
    expect(csv).toContain("'+danger");
    expect(csv).toContain('0.125');
  });

  it('returns headers for an empty report', () => {
    expect(buildCostReportCsv([]).split('\n')).toHaveLength(1);
  });

  it.each([' =SUM(1,1)', '\t+CMD', '\n-danger', '\r@IMPORT'])(
    'neutralizes a whitespace-prefixed formula cell: %j',
    (brandLabel) => {
      const entry: ICostReportEntry = {
        brandId: 'brand-1',
        brandLabel,
        category: 'image',
        createdAt: '2026-08-20T10:00:00.000Z',
        creditsUsed: 0,
        entryType: 'media',
        id: 'media-1',
        isByok: false,
        model: 'safe-model',
        provider: 'replicate',
        providerCostMicros: 125_000,
        providerCostUsd: 0.125,
        referenceId: 'ingredient-1',
      };

      expect(buildCostReportCsv([entry])).toContain(`'${brandLabel}`);
    },
  );
});
