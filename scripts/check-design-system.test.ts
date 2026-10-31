import { describe, expect, it } from 'vitest';
import {
  APP_CHROME_COLOR_SURFACES,
  assertLowerOnlyDesignSystemBaselineUpdate,
  buildDesignSystemBaseline,
  checkPlatformCoverage,
  type DesignSystemBaseline,
  type DesignSystemFinding,
  diffDesignSystemBaseline,
  findDarkOnlyPaletteTextTokens,
  findPackageUiGuardFindings,
  findRawChromeColorTokens,
  formatDesignSystemRegressions,
} from './check-design-system';
import {
  loadDesignEvalScenario,
  validateDesignEvalScenario,
} from './design-eval/contract';

function finding(
  file: string,
  kind: DesignSystemFinding['kind'],
  token: string,
  line = 1,
): DesignSystemFinding {
  return { file, kind, line, source: `className="${token}"`, token };
}

function baseline(
  findings: readonly DesignSystemFinding[],
): DesignSystemBaseline {
  return buildDesignSystemBaseline(findings);
}

describe('app chrome color guard', () => {
  it('finds every raw black/white chrome token and opacity suffix', () => {
    expect(
      findRawChromeColorTokens(
        'bg-white text-black text-white bg-black/70 hover:text-white/[0.84]',
      ),
    ).toEqual([
      'bg-white',
      'text-black',
      'text-white',
      'bg-black/70',
      'hover:text-white/[0.84]',
    ]);
  });

  it('continues to honour the content-color escape marker', () => {
    expect(
      findRawChromeColorTokens(
        'bg-black text-white // design-system-allow-content-color',
      ),
    ).toEqual([]);
  });

  it('includes onboarding in the guarded chrome surfaces', () => {
    expect(APP_CHROME_COLOR_SURFACES).toContainEqual({
      root: 'apps/web/app/(onboarding)',
    });
  });
});

describe('platform token pipeline', () => {
  it('registers every guarded platform token with Tailwind v4', () => {
    const failures: string[] = [];

    checkPlatformCoverage(failures);

    expect(failures).toEqual([]);
  });
});

describe('packages/ui design-system guards', () => {
  it('flags undersized control heights and names the control token', () => {
    const findings = findPackageUiGuardFindings(
      '<><Button className="h-6 px-2" />\n<input className="h-7" /></>',
      'packages/ui/src/example.tsx',
    );

    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'undersized-control-height',
        line: 1,
        token: 'h-6',
      }),
      expect.objectContaining({
        kind: 'undersized-control-height',
        line: 2,
        token: 'h-7',
      }),
    ]);
    expect(formatDesignSystemRegressions(findings)).toContain('h-control-sm');
  });

  it('recognizes control variant maps outside JSX', () => {
    expect(
      findPackageUiGuardFindings(
        "export const buttonSizes = { xs: 'h-6 px-2', sm: 'h-control-sm px-3' };",
        'packages/ui/src/primitives/button.variants.ts',
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'undersized-control-height',
        token: 'h-6',
      }),
    ]);
  });

  it('does not treat non-control geometry as a control-height violation', () => {
    expect(
      findPackageUiGuardFindings(
        '<><div className="h-6" />\n<Skeleton className="h-7" /></>',
        'packages/ui/src/components/sidebar/example.tsx',
      ),
    ).toEqual([]);
  });

  it('flags arbitrary text sizes below 11px while accepting the floor', () => {
    const findings = findPackageUiGuardFindings(
      '<><span className="text-[10px]" /><span className="text-[0.625rem]" /><span className="text-[11px]" /></>',
      'packages/ui/src/example.tsx',
    );

    expect(findings.map((entry) => entry.token)).toEqual([
      'text-[0.625rem]',
      'text-[10px]',
    ]);
    expect(findings.every((entry) => entry.kind === 'sub-11-text')).toBe(true);
  });

  it('flags negative tracking tighter than -0.02em and nothing else', () => {
    const findings = findPackageUiGuardFindings(
      '<><h1 className="tracking-[-0.05em]" /><h2 className="md:tracking-tighter" /><h3 className="tracking-[-0.02em] tracking-tight tracking-[-0.011em] tracking-[0.12em]" /></>',
      'apps/marketing/example.tsx',
    );

    expect(findings.map((entry) => entry.token)).toEqual([
      'md:tracking-tighter',
      'tracking-[-0.05em]',
    ]);
    expect(findings.every((entry) => entry.kind === 'tight-tracking')).toBe(
      true,
    );
  });

  it('flags colour opacity modifiers that are not on the ladder', () => {
    const findings = findPackageUiGuardFindings(
      '<><div className="bg-foreground/[0.04] hover:text-primary/72 border-white/[0.1] from-background/55" /><p className="bg-foreground/5 text-foreground/70 border-border/0 bg-black/100 text-sm/6 w-1/2 shadow-lg/20" /></>',
      'apps/marketing/example.tsx',
    );

    expect(findings.map((entry) => entry.token)).toEqual([
      'bg-foreground/[0.04]',
      'border-white/[0.1]',
      'from-background/55',
      'hover:text-primary/72',
    ]);
    expect(findings.every((entry) => entry.kind === 'off-ladder-opacity')).toBe(
      true,
    );
  });

  it('recognises arbitrary colours, percent and decimal modifiers', () => {
    const findings = findPackageUiGuardFindings(
      '<div className="bg-[#0088cc]/35 bg-red-500/[35%] bg-red-500/2.5 bg-[color:var(--x)]/20 bg-[#0088cc]/20 bg-red-500/[50%]" />',
      'apps/marketing/example.tsx',
    );

    expect(findings.map((entry) => entry.token)).toEqual([
      'bg-[#0088cc]/35',
      'bg-red-500/[35%]',
      'bg-red-500/[50%]',
      'bg-red-500/2.5',
    ]);
  });

  it('scans the static parts of interpolated class templates', () => {
    const findings = findPackageUiGuardFindings(
      'const a = <div className={`bg-primary/35 ${active ? "ring-1" : ""} text-foreground/72 border-border/10 hover:bg-primary/3${n}`} />;',
      'apps/marketing/example.tsx',
    );

    expect(findings.map((entry) => entry.token)).toEqual([
      'bg-primary/35',
      'text-foreground/72',
    ]);
  });

  it('names the ladder in the remedy for opacity findings', () => {
    const findings = findPackageUiGuardFindings(
      '<div className="bg-primary/35" />',
      'apps/marketing/example.tsx',
    );

    expect(formatDesignSystemRegressions(findings)).toContain(
      '/5 /10 /20 /40 /50 /60 /70 /80 /90',
    );
  });

  it('keeps the control-height rule inside packages/ui', () => {
    expect(
      findPackageUiGuardFindings(
        '<button className="h-6" />',
        'apps/marketing/example-button.tsx',
      ),
    ).toEqual([]);
  });
});

describe('design-system debt baseline', () => {
  const oldFindings = [
    finding('a.tsx', 'raw-chrome-color', 'text-white'),
    finding('a.tsx', 'raw-chrome-color', 'bg-black', 2),
    finding('b.tsx', 'sub-11-text', 'text-[10px]'),
  ];

  it('builds stable counts per finding kind and file', () => {
    expect(baseline(oldFindings)).toEqual({
      version: 1,
      files: {
        'a.tsx': { 'raw-chrome-color': 2 },
        'b.tsx': { 'sub-11-text': 1 },
      },
    });
  });

  it('reports growth and stale cleanup independently', () => {
    const actual = [
      ...oldFindings,
      finding('a.tsx', 'raw-chrome-color', 'bg-black', 3),
    ];
    const improvedElsewhere = actual.filter((entry) => entry.file !== 'b.tsx');

    expect(
      diffDesignSystemBaseline(
        baseline(oldFindings),
        baseline(improvedElsewhere),
      ),
    ).toEqual({
      regressions: [
        {
          actual: 3,
          baseline: 2,
          file: 'a.tsx',
          kind: 'raw-chrome-color',
        },
      ],
      stale: [
        {
          actual: 0,
          baseline: 1,
          file: 'b.tsx',
          kind: 'sub-11-text',
        },
      ],
    });
  });

  it('allows an update only when debt strictly shrinks without local growth', () => {
    expect(() =>
      assertLowerOnlyDesignSystemBaselineUpdate(
        baseline(oldFindings),
        baseline(oldFindings.slice(0, 2)),
      ),
    ).not.toThrow();

    expect(() =>
      assertLowerOnlyDesignSystemBaselineUpdate(
        baseline(oldFindings),
        baseline(oldFindings),
      ),
    ).toThrow(/total must decrease/u);

    expect(() =>
      assertLowerOnlyDesignSystemBaselineUpdate(
        baseline(oldFindings),
        baseline([
          ...oldFindings,
          finding('a.tsx', 'raw-chrome-color', 'bg-black', 3),
        ]),
      ),
    ).toThrow(/per-file count grew/u);
  });

  it('names every offending file and token in a regression report', () => {
    const report = formatDesignSystemRegressions([
      finding('a.tsx', 'raw-chrome-color', 'text-white'),
      finding('b.tsx', 'raw-chrome-color', 'bg-black'),
    ]);

    expect(report).toContain('a.tsx:1');
    expect(report).toContain('text-white');
    expect(report).toContain('b.tsx:1');
    expect(report).toContain('bg-black');
  });
});

describe('design evaluation seed', () => {
  it('keeps the frozen scenario executable and reviewable', () => {
    expect(validateDesignEvalScenario(loadDesignEvalScenario())).toEqual([]);
  });

  it('rejects comparisons that can mutate more than the guidance', () => {
    const scenario = structuredClone(loadDesignEvalScenario());
    scenario.comparison.inputMutation = 'allowed';
    scenario.comparison.sameModel = false;

    expect(validateDesignEvalScenario(scenario)).toEqual(
      expect.arrayContaining([
        'comparison.inputMutation must be forbidden',
        'comparison.sameModel must be true',
      ]),
    );
  });

  it('requires observable score anchors and reproducibility metadata', () => {
    const scenario = structuredClone(loadDesignEvalScenario());
    scenario.requiredRunRecordFields = ['scenarioVersion'];
    const firstCriterion = scenario.rubric.at(0);
    if (!firstCriterion) {
      throw new Error(
        'Expected the design evaluation fixture to have a rubric',
      );
    }
    firstCriterion.scoreAnchors['2'] = '';

    expect(validateDesignEvalScenario(scenario)).toEqual(
      expect.arrayContaining([
        'requiredRunRecordFields must include modelVersion',
        'requiredRunRecordFields must include guidanceCommitSha',
        'rubric[0].scoreAnchors.2 must be a non-empty string',
      ]),
    );
  });
});

describe('findDarkOnlyPaletteTextTokens', () => {
  it('flags light palette text that only reads on a dark surface', () => {
    expect(
      findDarkOnlyPaletteTextTokens(
        "'bg-amber-500/12 text-amber-300 hover:text-rose-200 text-emerald-400/60'",
      ),
    ).toEqual(['text-amber-300', 'hover:text-rose-200', 'text-emerald-400/60']);
  });

  it('allows dark-theme pairs, deeper shades and semantic tokens', () => {
    expect(
      findDarkOnlyPaletteTextTokens(
        'text-amber-700 dark:text-amber-300 text-red-600 text-warning',
      ),
    ).toEqual([]);
  });

  it('honours the content-color escape marker', () => {
    expect(
      findDarkOnlyPaletteTextTokens(
        "'text-emerald-300' // design-system-allow-content-color -- terminal",
      ),
    ).toEqual([]);
  });
});
