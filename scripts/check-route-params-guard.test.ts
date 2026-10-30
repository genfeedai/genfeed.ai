import { describe, expect, it } from 'vitest';
import { findDirectUseParamsImports } from './check-route-params-guard';

const FILE = 'apps/app/app/(protected)/example/Route.tsx';

describe('findDirectUseParamsImports', () => {
  it('flags useParams imported from next/navigation', () => {
    expect(
      findDirectUseParamsImports(
        FILE,
        "import { usePathname, useParams } from 'next/navigation';",
      ),
    ).toEqual([
      expect.objectContaining({
        file: FILE,
        line: 1,
        message: expect.stringContaining('useRouteParams'),
      }),
    ]);
  });

  it('flags an aliased useParams import', () => {
    expect(
      findDirectUseParamsImports(
        FILE,
        "import { useParams as useRawParams } from 'next/navigation';",
      ),
    ).toHaveLength(1);
  });

  it('accepts the guarded hook and other navigation hooks', () => {
    expect(
      findDirectUseParamsImports(
        FILE,
        [
          "import { usePathname } from 'next/navigation';",
          "import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';",
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('ignores useParams from other modules', () => {
    expect(
      findDirectUseParamsImports(
        FILE,
        "import { useParams } from 'react-router-dom';",
      ),
    ).toEqual([]);
  });
});
