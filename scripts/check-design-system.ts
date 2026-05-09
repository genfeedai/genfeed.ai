import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PLATFORM_COLORS } from '../packages/constants/src/platform-colors';
import { semanticColorTokens } from '../packages/ui/src/core/colors';
import { motionTokens } from '../packages/ui/src/core/motion';
import { radiusTokens } from '../packages/ui/src/core/radius';
import { spacingTokens } from '../packages/ui/src/core/spacing';
import { typographyTokens } from '../packages/ui/src/core/typography';

const rootDir = process.cwd();

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

function checkDesignLint(failures: string[]): void {
  try {
    execFileSync('bunx', ['design.md', 'lint', 'DESIGN.md'], {
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

function checkWebTokenDrift(failures: string[]): void {
  const webTokens = readRepoFile('packages/ui/web-tokens.scss');

  for (const themeTokens of Object.values(semanticColorTokens)) {
    for (const [tokenName, value] of Object.entries(themeTokens)) {
      assertContains(
        webTokens,
        `--${cssName(tokenName)}: ${value.hsl};`,
        failures,
        'packages/ui/web-tokens.scss',
      );
    }
  }

  for (const [tokenName, value] of Object.entries(typographyTokens)) {
    assertContains(
      webTokens,
      `--${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.scss',
    );
  }

  for (const [tokenName, value] of Object.entries(spacingTokens)) {
    assertContains(
      webTokens,
      `--space-${tokenName}: ${value};`,
      failures,
      'packages/ui/web-tokens.scss',
    );
  }

  for (const [tokenName, value] of Object.entries(radiusTokens)) {
    assertContains(
      webTokens,
      `--radius-${tokenName}: ${value};`,
      failures,
      'packages/ui/web-tokens.scss',
    );
  }

  for (const [tokenName, value] of Object.entries(motionTokens)) {
    assertContains(
      webTokens,
      `--motion-${cssName(tokenName)}: ${value};`,
      failures,
      'packages/ui/web-tokens.scss',
    );
  }
}

function checkPlatformCoverage(failures: string[]): void {
  const design = readRepoFile('DESIGN.md');
  const tailwindConfig = readRepoFile(
    'packages/next-config/tailwind.config.base.ts',
  );
  const shadcnTheme = readRepoFile('packages/styles/shadcn-theme.scss');

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
      'packages/styles/shadcn-theme.scss',
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

function main(): void {
  const failures: string[] = [];

  checkDesignLint(failures);
  checkWebTokenDrift(failures);
  checkPlatformCoverage(failures);
  checkMobileHardcodedColors(failures);

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log('Design system check passed.');
}

main();
