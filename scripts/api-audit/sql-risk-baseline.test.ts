import { describe, expect, it } from 'vitest';
import type { SqlRiskFinding } from './sql-risk-audit';
import {
  buildSqlRiskBaseline,
  compareSqlRiskBaseline,
  type SqlRiskBaseline,
} from './sql-risk-baseline';

function finding(
  overrides: Partial<SqlRiskFinding> & Pick<SqlRiskFinding, 'file'>,
): SqlRiskFinding {
  return {
    category: 'unbounded-read',
    growth: 'growing',
    line: 10,
    method: 'findMany',
    model: 'post',
    receiver: 'this.prisma.post',
    recommendation: '',
    severity: 'medium',
    snippet: '',
    ...overrides,
  };
}

describe('sql risk baseline', () => {
  it('counts findings per category, file and model, ignoring line numbers', () => {
    const baseline = buildSqlRiskBaseline([
      finding({ file: 'a.ts', line: 1 }),
      finding({ file: 'a.ts', line: 90 }),
      finding({ file: 'a.ts', model: 'brand', growth: 'config' }),
      finding({
        category: 'raw-sql-review',
        file: 'b.ts',
        growth: undefined,
        model: undefined,
      }),
      finding({ category: 'key-set-read', file: 'c.ts' }),
    ]);

    expect(baseline.entries).toEqual([
      {
        category: 'raw-sql-review',
        count: 1,
        file: 'b.ts',
        target: '-',
      },
      {
        category: 'unbounded-read',
        count: 1,
        file: 'a.ts',
        growth: 'config',
        target: 'brand',
      },
      {
        category: 'unbounded-read',
        count: 2,
        file: 'a.ts',
        growth: 'growing',
        target: 'post',
      },
    ]);
  });

  it('passes when the findings match the baseline after lines move', () => {
    const baseline = buildSqlRiskBaseline([finding({ file: 'a.ts', line: 5 })]);

    expect(
      compareSqlRiskBaseline([finding({ file: 'a.ts', line: 500 })], baseline),
    ).toEqual([]);
  });

  it('fails a new finding, including one in a file that was clean', () => {
    const baseline: SqlRiskBaseline = {
      entries: [
        {
          category: 'unbounded-read',
          count: 1,
          file: 'a.ts',
          growth: 'growing',
          target: 'post',
        },
      ],
    };

    expect(
      compareSqlRiskBaseline(
        [finding({ file: 'a.ts' }), finding({ file: 'a.ts', line: 20 })],
        baseline,
      ),
    ).toEqual([
      {
        baselined: 1,
        current: 2,
        key: 'unbounded-read a.ts post',
        kind: 'grew',
      },
    ]);
    expect(
      compareSqlRiskBaseline(
        [finding({ file: 'a.ts' }), finding({ file: 'new.ts' })],
        baseline,
      ),
    ).toEqual([
      {
        baselined: 0,
        current: 1,
        key: 'unbounded-read new.ts post',
        kind: 'grew',
      },
    ]);
  });

  it('fails a fixed finding until the baseline shrinks with it', () => {
    const baseline = buildSqlRiskBaseline([
      finding({ file: 'a.ts' }),
      finding({ file: 'a.ts', line: 20 }),
    ]);

    expect(
      compareSqlRiskBaseline([finding({ file: 'a.ts' })], baseline),
    ).toEqual([
      {
        baselined: 2,
        current: 1,
        key: 'unbounded-read a.ts post',
        kind: 'shrank',
      },
    ]);
  });
});
