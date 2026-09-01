import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { PLATFORM_COLORS } from '../packages/constants/src/platform-colors';
import { semanticColorTokens } from '../packages/ui/src/core/colors';
import {
  elevationTokens,
  focusTokens,
} from '../packages/ui/src/core/elevation';
import { motionTokens } from '../packages/ui/src/core/motion';
import { radiusTokens } from '../packages/ui/src/core/radius';
import {
  backgroundScale,
  neutralAlphaScale,
  neutralScale,
} from '../packages/ui/src/core/scales';
import { sizingTokens } from '../packages/ui/src/core/sizing';
import { spacingTokens } from '../packages/ui/src/core/spacing';
import { typographyTokens } from '../packages/ui/src/core/typography';
import {
  loadDesignEvalScenario,
  validateDesignEvalScenario,
} from './design-eval/contract';

const rootDir = process.cwd();
const DESIGN_SYSTEM_BASELINE_VERSION = 1;
const DESIGN_SYSTEM_BASELINE_PATH = path.join(
  rootDir,
  'scripts/design-system.baseline.json',
);

export type DesignSystemFindingKind =
  | 'raw-chrome-color'
  | 'sub-11-text'
  | 'undersized-control-height';

export type DesignSystemFinding = {
  file: string;
  kind: DesignSystemFindingKind;
  line: number;
  source: string;
  token: string;
};

export type DesignSystemBaseline = {
  version: typeof DESIGN_SYSTEM_BASELINE_VERSION;
  files: Record<string, Partial<Record<DesignSystemFindingKind, number>>>;
};

export type DesignSystemBaselineDrift = {
  actual: number;
  baseline: number;
  file: string;
  kind: DesignSystemFindingKind;
};

export type DesignSystemBaselineDiff = {
  regressions: DesignSystemBaselineDrift[];
  stale: DesignSystemBaselineDrift[];
};

function readRepoFile(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), 'utf8');
}

function cssName(tokenName: string): string {
  if (tokenName === 'invFg') {
    return 'inv-fg';
  }

  return tokenName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function assertContains(
  content: string,
  expected: string,
  failures: string[],
  label: string,
): void {
  const normalizedContent = content.replace(/\s+/g, ' ').replaceAll('"', "'");
  const normalizedExpected = expected.replace(/\s+/g, ' ').replaceAll('"', "'");

  if (
    !content.includes(expected) &&
    !normalizedContent.includes(normalizedExpected)
  ) {
    failures.push(`${label}: missing ${expected}`);
  }
}

function collectFiles(dir: string, extensions: Set<string>): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const absolutePath = path.join(dir, entry);
    const stat = lstatSync(absolutePath);

    if (stat.isSymbolicLink()) {
      continue;
    }

    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') {
        continue;
      }

      results.push(...collectFiles(absolutePath, extensions));
      continue;
    }

    if (extensions.has(path.extname(entry))) {
      results.push(absolutePath);
    }
  }

  return results;
}

export const APP_CHROME_COLOR_SURFACES: Array<{
  root: string;
  fileNamePattern?: RegExp;
}> = [
  {
    root: 'apps/app/app/(onboarding)',
  },
  {
    root: 'apps/app/app/(protected)/[orgSlug]/[brandSlug]/publishing/review',
  },
  {
    root: 'apps/app/app/(protected)/[orgSlug]/[brandSlug]/tasks',
  },
  {
    fileNamePattern: /^settings-progress.*\.tsx$/u,
    root: 'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/personal',
  },
  {
    root: 'apps/app/src/features/workflows/pages/batch',
  },
  {
    root: 'apps/app/src/features/workflows/pages/library',
  },
  {
    root: 'apps/app/app/(protected)/admin/overview/dashboard',
  },
  {
    root: 'apps/app/src/components/workspace-shell',
  },
  {
    root: 'apps/app/src/components/shell',
  },
];

const APP_CHROME_COLOR_ALLOW_MARKER = 'design-system-allow-content-color';

function isExcludedSourceFile(relativePath: string): boolean {
  return (
    relativePath.endsWith('.test.ts') ||
    relativePath.endsWith('.test.tsx') ||
    relativePath.endsWith('.spec.ts') ||
    relativePath.endsWith('.spec.tsx') ||
    relativePath.endsWith('.stories.ts') ||
    relativePath.endsWith('.stories.tsx')
  );
}

function isRawChromeColorToken(token: string): boolean {
  const normalizedToken = token
    .replace(/^[,;()]+/u, '')
    .replace(/[,;()]+$/u, '')
    .replace(/^!/u, '');
  const baseToken = normalizedToken.split(':').at(-1) ?? normalizedToken;

  return /^(?:bg-white|text-black|text-white|bg-black)(?:\/(?:\d+|\[[^\]]+\]))?$/u.test(
    baseToken,
  );
}

export function findRawChromeColorTokens(line: string): string[] {
  if (line.includes(APP_CHROME_COLOR_ALLOW_MARKER)) {
    return [];
  }

  return line.split(/[\s"'`{}]+/u).filter(isRawChromeColorToken);
}

function findAppChromeRawColorFindings(): DesignSystemFinding[] {
  const findings: DesignSystemFinding[] = [];
  const seenFiles = new Set<string>();

  for (const surface of APP_CHROME_COLOR_SURFACES) {
    const files = collectFiles(
      path.join(rootDir, surface.root),
      new Set(['.ts', '.tsx', '.js', '.jsx']),
    );

    for (const filePath of files) {
      const relativePath = path.relative(rootDir, filePath);
      if (seenFiles.has(relativePath) || isExcludedSourceFile(relativePath)) {
        continue;
      }

      if (
        surface.fileNamePattern &&
        !surface.fileNamePattern.test(path.basename(relativePath))
      ) {
        continue;
      }

      seenFiles.add(relativePath);
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const tokens = findRawChromeColorTokens(line);
        if (tokens.length === 0) {
          return;
        }

        for (const token of tokens) {
          findings.push({
            file: relativePath,
            kind: 'raw-chrome-color',
            line: index + 1,
            source: line.trim(),
            token,
          });
        }
      });
    }
  }

  return findings;
}

const CONTROL_HEIGHT_TOKENS = new Set(['h-6', 'h-7']);
const CONTROL_COMPONENT_NAME_PATTERN =
  /(?:Action|Button|Combobox|CommandItem|Control|Input|Link|MenuItem|SearchBar|Searchbar|Select|Tab|TabsTrigger|Textarea|Toggle|Trigger)$/u;
const CONTROL_SOURCE_FILE_PATTERN =
  /(?:action|button|combobox|control|dropdown|input|menu|searchbar|select|sidebar|tab|textarea|toggle|trigger)/iu;
const NATIVE_CONTROL_NAMES = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
]);
const PACKAGE_UI_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const DESIGN_SYSTEM_FINDING_KINDS: readonly DesignSystemFindingKind[] = [
  'raw-chrome-color',
  'sub-11-text',
  'undersized-control-height',
];

function baseClassToken(token: string): string {
  const normalized = token.replace(/^!/u, '');
  return normalized.split(':').at(-1)?.replace(/^!/u, '') ?? normalized;
}

function classTokens(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

function isSubElevenArbitraryTextToken(token: string): boolean {
  const match = /^text-\[(\d*\.?\d+)(px|rem)\](?:\/[^\s]+)?$/u.exec(
    baseClassToken(token),
  );
  if (!match) {
    return false;
  }

  const value = Number(match[1]);
  const pixels = match[2] === 'rem' ? value * 16 : value;
  return Number.isFinite(pixels) && pixels < 11;
}

function isControlElement(node: ts.JsxOpeningLikeElement): boolean {
  const tagName = node.tagName.getText();
  const componentName = tagName.split('.').at(-1) ?? tagName;
  if (
    NATIVE_CONTROL_NAMES.has(componentName) ||
    CONTROL_COMPONENT_NAME_PATTERN.test(componentName)
  ) {
    return true;
  }

  return node.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'role' &&
      attribute.initializer &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === 'button',
  );
}

function literalNodesWithin(node: ts.Node): ts.StringLiteralLike[] {
  const literals: ts.StringLiteralLike[] = [];
  const visit = (child: ts.Node): void => {
    if (
      ts.isStringLiteralLike(child) ||
      ts.isNoSubstitutionTemplateLiteral(child)
    ) {
      literals.push(child);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return literals;
}

function sourceLine(sourceText: string, line: number): string {
  return sourceText.split('\n')[line - 1]?.trim() ?? '';
}

function isControlScaleLiteral(
  literal: ts.StringLiteralLike,
  file: string,
): boolean {
  if (!CONTROL_SOURCE_FILE_PATTERN.test(file)) {
    return false;
  }

  let current: ts.Node | undefined = literal.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isVariableDeclaration(current) &&
      /(?:height|size|variant)/iu.test(current.name.getText())
    ) {
      return true;
    }
    if (
      ts.isPropertyAssignment(current) &&
      /^(?:height|size|variants)$/iu.test(current.name.getText())
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

export function findPackageUiGuardFindings(
  sourceText: string,
  file = 'packages/ui/src/fixture.tsx',
): DesignSystemFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: DesignSystemFinding[] = [];
  const findingKeys = new Set<string>();

  const addFinding = (
    literal: ts.StringLiteralLike,
    kind: DesignSystemFindingKind,
    token: string,
  ): void => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile))
        .line + 1;
    const key = `${literal.pos}:${kind}:${token}`;
    if (findingKeys.has(key)) {
      return;
    }
    findingKeys.add(key);
    findings.push({
      file,
      kind,
      line,
      source: sourceLine(sourceText, line),
      token,
    });
  };

  const scanLiterals = (
    literals: readonly ts.StringLiteralLike[],
    scanControlHeight: boolean,
  ): void => {
    for (const literal of literals) {
      for (const token of classTokens(literal.text)) {
        if (
          scanControlHeight &&
          CONTROL_HEIGHT_TOKENS.has(baseClassToken(token))
        ) {
          addFinding(literal, 'undersized-control-height', token);
        }
        if (isSubElevenArbitraryTextToken(token)) {
          addFinding(literal, 'sub-11-text', token);
        }
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const className = node.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText() === 'className',
      );
      if (className?.initializer) {
        scanLiterals(
          literalNodesWithin(className.initializer),
          isControlElement(node),
        );
      }
    } else if (
      ts.isStringLiteralLike(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      scanLiterals([node], isControlScaleLiteral(node, file));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings.sort(
    (left, right) =>
      left.line - right.line ||
      left.kind.localeCompare(right.kind) ||
      left.token.localeCompare(right.token),
  );
}

function findPackageUiGuardFindingsInRepo(): DesignSystemFinding[] {
  const packageRoot = path.join(rootDir, 'packages/ui');
  const files = collectFiles(packageRoot, PACKAGE_UI_EXTENSIONS);
  const findings: DesignSystemFinding[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath);
    if (isExcludedSourceFile(relativePath)) {
      continue;
    }
    findings.push(
      ...findPackageUiGuardFindings(
        readFileSync(filePath, 'utf8'),
        relativePath,
      ),
    );
  }

  return findings;
}

export function buildDesignSystemBaseline(
  findings: readonly DesignSystemFinding[],
): DesignSystemBaseline {
  const files: DesignSystemBaseline['files'] = {};

  for (const finding of findings) {
    const counts = files[finding.file] ?? {};
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
    files[finding.file] = counts;
  }

  return {
    version: DESIGN_SYSTEM_BASELINE_VERSION,
    files: Object.fromEntries(
      Object.entries(files)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([file, counts]) => [
          file,
          Object.fromEntries(
            DESIGN_SYSTEM_FINDING_KINDS.filter(
              (kind) => (counts[kind] ?? 0) > 0,
            ).map((kind) => [kind, counts[kind]]),
          ),
        ]),
    ),
  };
}

function totalDesignSystemFindings(baseline: DesignSystemBaseline): number {
  return Object.values(baseline.files).reduce(
    (total, counts) =>
      total +
      Object.values(counts).reduce(
        (fileTotal, count) => fileTotal + (count ?? 0),
        0,
      ),
    0,
  );
}

export function diffDesignSystemBaseline(
  baseline: DesignSystemBaseline,
  actual: DesignSystemBaseline,
): DesignSystemBaselineDiff {
  const regressions: DesignSystemBaselineDrift[] = [];
  const stale: DesignSystemBaselineDrift[] = [];
  const files = [
    ...new Set([...Object.keys(baseline.files), ...Object.keys(actual.files)]),
  ].sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    for (const kind of DESIGN_SYSTEM_FINDING_KINDS) {
      const baselineCount = baseline.files[file]?.[kind] ?? 0;
      const actualCount = actual.files[file]?.[kind] ?? 0;
      if (actualCount > baselineCount) {
        regressions.push({
          actual: actualCount,
          baseline: baselineCount,
          file,
          kind,
        });
      } else if (actualCount < baselineCount) {
        stale.push({
          actual: actualCount,
          baseline: baselineCount,
          file,
          kind,
        });
      }
    }
  }

  return { regressions, stale };
}

export function assertLowerOnlyDesignSystemBaselineUpdate(
  baseline: DesignSystemBaseline,
  actual: DesignSystemBaseline,
): void {
  const { regressions } = diffDesignSystemBaseline(baseline, actual);
  if (regressions.length > 0) {
    const details = regressions
      .map(
        (entry) =>
          `${entry.file} ${entry.kind} (${entry.baseline} -> ${entry.actual})`,
      )
      .join(', ');
    throw new Error(
      `Refusing to update design-system baseline: per-file count grew in ${details}.`,
    );
  }

  const baselineTotal = totalDesignSystemFindings(baseline);
  const actualTotal = totalDesignSystemFindings(actual);
  if (actualTotal >= baselineTotal) {
    throw new Error(
      `Refusing to update design-system baseline: total must decrease (${baselineTotal} -> ${actualTotal}).`,
    );
  }
}

function parseDesignSystemBaseline(raw: string): DesignSystemBaseline {
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    parsed.version !== DESIGN_SYSTEM_BASELINE_VERSION ||
    !('files' in parsed) ||
    !parsed.files ||
    typeof parsed.files !== 'object' ||
    Array.isArray(parsed.files)
  ) {
    throw new Error(
      `Invalid design-system baseline. Expected version ${DESIGN_SYSTEM_BASELINE_VERSION}.`,
    );
  }

  for (const [file, rawCounts] of Object.entries(parsed.files)) {
    if (!file || !rawCounts || typeof rawCounts !== 'object') {
      throw new Error(`Invalid design-system baseline entry for ${file}.`);
    }
    for (const [kind, count] of Object.entries(rawCounts)) {
      if (
        !DESIGN_SYSTEM_FINDING_KINDS.includes(
          kind as DesignSystemFindingKind,
        ) ||
        !Number.isInteger(count) ||
        Number(count) <= 0
      ) {
        throw new Error(
          `Invalid design-system baseline count for ${file} ${kind}.`,
        );
      }
    }
  }

  return parsed as DesignSystemBaseline;
}

export function serializeDesignSystemBaseline(
  baseline: DesignSystemBaseline,
): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function scanDesignSystemFindings(): DesignSystemFinding[] {
  return [
    ...findAppChromeRawColorFindings(),
    ...findPackageUiGuardFindingsInRepo(),
  ];
}

function readDesignSystemBaseline(): DesignSystemBaseline {
  return parseDesignSystemBaseline(
    readFileSync(DESIGN_SYSTEM_BASELINE_PATH, 'utf8'),
  );
}

export function formatDesignSystemRegressions(
  findings: readonly DesignSystemFinding[],
): string {
  return findings
    .map((finding) => {
      const remedy =
        finding.kind === 'raw-chrome-color'
          ? `use a semantic foreground/background token, or mark genuine content color with ${APP_CHROME_COLOR_ALLOW_MARKER}`
          : finding.kind === 'undersized-control-height'
            ? 'use h-control-sm (the 32px minimum control-scale token)'
            : 'use text-2xs (the 11px typography floor) or a larger semantic text token';
      return `${finding.file}:${finding.line}: ${finding.token} — ${remedy}\n  ${finding.source}`;
    })
    .join('\n');
}

function checkDesignLint(failures: string[]): void {
  try {
    execFileSync('bunx', ['@google/design.md', 'lint', 'DESIGN.md'], {
      cwd: rootDir,
      stdio: 'pipe',
    });
  } catch (error) {
    const output =
      error instanceof Error && 'stdout' in error
        ? String((error as { stdout?: Buffer }).stdout ?? '')
        : '';
    failures.push(`DESIGN.md lint failed.${output ? `\n${output}` : ''}`);
  }
}

function checkDesignEvalSeed(failures: string[]): void {
  try {
    const scenarioFailures = validateDesignEvalScenario(
      loadDesignEvalScenario(),
    );
    if (scenarioFailures.length > 0) {
      failures.push(
        `Design evaluation seed is invalid:\n${scenarioFailures.join('\n')}`,
      );
    }
  } catch (error) {
    failures.push(
      `Design evaluation seed could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function checkWebTokenDrift(failures: string[]): void {
  const webTokens = readRepoFile('packages/ui/web-tokens.css');

  for (const themeTokens of Object.values(semanticColorTokens)) {
    for (const [tokenName, value] of Object.entries(themeTokens)) {
      assertContains(
        webTokens,
        `--${cssName(tokenName)}: ${value.hsl};`,
        failures,
        'packages/ui/web-tokens.css',
      );
    }
  }

  for (const [tokenName, value] of Object.entries(typographyTokens)) {
    assertContains(
      webTokens,
      `--${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  for (const [tokenName, value] of Object.entries(spacingTokens)) {
    assertContains(
      webTokens,
      `--space-${tokenName}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  for (const [tokenName, value] of Object.entries(radiusTokens)) {
    assertContains(
      webTokens,
      `--radius-${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  for (const [tokenName, value] of Object.entries(motionTokens)) {
    assertContains(
      webTokens,
      `--motion-${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  for (const [tokenName, value] of Object.entries(sizingTokens)) {
    assertContains(
      webTokens,
      `--${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  for (const [tokenName, value] of Object.entries(focusTokens)) {
    assertContains(
      webTokens,
      `--${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.css',
    );
  }

  // The neutral ladder, its translucent twin, the two-step canvas, and the
  // elevation stack are all per-theme, so every step is asserted once per theme.
  for (const theme of ['dark', 'light'] as const) {
    for (const [step, value] of Object.entries(neutralScale[theme])) {
      assertContains(
        webTokens,
        `--gray-${step}: ${value.hsl};`,
        failures,
        'packages/ui/web-tokens.css',
      );
    }

    for (const [step, value] of Object.entries(neutralAlphaScale[theme])) {
      assertContains(
        webTokens,
        `--gray-alpha-${step}: ${value};`,
        failures,
        'packages/ui/web-tokens.css',
      );
    }

    for (const [step, value] of Object.entries(backgroundScale[theme])) {
      assertContains(
        webTokens,
        `--background-${step}: ${value.hsl};`,
        failures,
        'packages/ui/web-tokens.css',
      );
    }

    for (const [tokenName, value] of Object.entries(elevationTokens[theme])) {
      assertContains(
        webTokens,
        `--${cssName(tokenName)}: ${value};`,
        failures,
        'packages/ui/web-tokens.css',
      );
    }
  }
}

export function checkPlatformCoverage(failures: string[]): void {
  const design = readRepoFile('DESIGN.md');
  const tailwindConfig = readRepoFile(
    'packages/next-config/tailwind.config.base.ts',
  );
  const shadcnTheme = readRepoFile('packages/styles/shadcn-theme.css');
  const globalStyles = readRepoFile('packages/styles/globals.css');

  for (const [platformId, platform] of Object.entries(PLATFORM_COLORS)) {
    const hex = platform.base.toUpperCase();
    const lowerHex = hex.toLowerCase();

    assertContains(design, `${platformId}: "${hex}"`, failures, 'DESIGN.md');
    assertContains(
      design,
      `platform-${platformId}:`,
      failures,
      'DESIGN.md components',
    );
    assertContains(
      tailwindConfig,
      `${platformId}: '${hex}'`,
      failures,
      'packages/next-config/tailwind.config.base.ts',
    );
    assertContains(
      shadcnTheme,
      `--platform-${platformId}: ${lowerHex};`,
      failures,
      'packages/styles/shadcn-theme.css',
    );
    assertContains(
      globalStyles,
      `--color-platform-${platformId}: var(--platform-${platformId});`,
      failures,
      'packages/styles/globals.css',
    );
  }
}

function checkMobileHardcodedColors(failures: string[]): void {
  const mobileRoot = path.join(rootDir, 'apps/mobile/app');
  const files = collectFiles(mobileRoot, new Set(['.ts', '.tsx']));
  const colorLiteralPattern =
    /#[0-9a-fA-F]{3,8}\b|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/u;
  const findings: string[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath);

    if (
      relativePath.endsWith('.test.tsx') ||
      relativePath.endsWith('.test.ts')
    ) {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (colorLiteralPattern.test(line)) {
        findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if (findings.length > 0) {
    failures.push(
      `Mobile screens must use nativeTokenMap via @/constants instead of hardcoded colors:\n${findings.join(
        '\n',
      )}`,
    );
  }
}

function checkDesignSystemDebt(failures: string[]): void {
  const findings = scanDesignSystemFindings();
  const actual = buildDesignSystemBaseline(findings);
  const baseline = readDesignSystemBaseline();

  if (process.argv.includes('--update-baseline')) {
    try {
      assertLowerOnlyDesignSystemBaselineUpdate(baseline, actual);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      return;
    }

    const before = totalDesignSystemFindings(baseline);
    const after = totalDesignSystemFindings(actual);
    writeFileSync(
      DESIGN_SYSTEM_BASELINE_PATH,
      serializeDesignSystemBaseline(actual),
      'utf8',
    );
    console.log(`Updated design-system baseline: ${before} -> ${after}.`);
    return;
  }

  const diff = diffDesignSystemBaseline(baseline, actual);
  if (diff.regressions.length > 0) {
    const regressedKeys = new Set(
      diff.regressions.map((entry) => `${entry.file}:${entry.kind}`),
    );
    const offendingFindings = findings.filter((finding) =>
      regressedKeys.has(`${finding.file}:${finding.kind}`),
    );
    failures.push(
      'Design-system debt grew above its shrink-only baseline:\n' +
        formatDesignSystemRegressions(offendingFindings),
    );
  }

  if (diff.stale.length > 0) {
    failures.push(
      'The design-system baseline is stale. Keep the cleanup by running ' +
        '`bun run check:design-system --update-baseline` in this PR:\n' +
        diff.stale
          .map(
            (entry) =>
              `${entry.file} ${entry.kind}: baseline ${entry.baseline}, actual ${entry.actual}`,
          )
          .join('\n'),
    );
  }
}

export function main(): void {
  const failures: string[] = [];

  checkDesignLint(failures);
  checkDesignEvalSeed(failures);
  checkWebTokenDrift(failures);
  checkPlatformCoverage(failures);
  checkMobileHardcodedColors(failures);
  checkDesignSystemDebt(failures);

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log('Design system check passed.');
}

if (import.meta.main) {
  main();
}
