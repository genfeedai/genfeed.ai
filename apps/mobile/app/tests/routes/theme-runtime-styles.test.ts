import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { describe, expect, it } from 'vitest';

const mobileRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolutePath = path.join(directory, name);
    return statSync(absolutePath).isDirectory()
      ? collectSourceFiles(absolutePath)
      : /\.(ts|tsx)$/.test(name)
        ? [absolutePath]
        : [];
  });
}

describe('mobile runtime theme styles', () => {
  it('does not capture a static color palette in route or component modules', () => {
    const sourceFiles = [
      ...collectSourceFiles(path.join(mobileRoot, 'app')),
      ...collectSourceFiles(path.join(mobileRoot, 'components')),
    ];

    const staticColorImports = sourceFiles.filter((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"]@\/constants(?:\/theme)?['"]/.test(
        source,
      );
    });

    expect(staticColorImports).toEqual([]);
  });

  it('defines matching light and dark native splash surfaces', () => {
    const appJson = JSON.parse(
      readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'),
    ) as {
      expo: {
        plugins: Array<string | [string, Record<string, unknown>]>;
      };
    };
    const splashPlugin = appJson.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    const splashOptions = splashPlugin?.[1] as
      | {
          backgroundColor?: string;
          dark?: { backgroundColor?: string; image?: string };
          image?: string;
        }
      | undefined;

    expect(splashOptions?.backgroundColor).toBe(
      nativeThemeColors.light.bgPrimary,
    );
    expect(splashOptions?.dark?.backgroundColor).toBe(
      nativeThemeColors.dark.bgPrimary,
    );
    expect(splashOptions?.image).toBe('./assets/images/splash-icon.png');
    expect(splashOptions?.dark?.image).toBe(
      './assets/images/splash-icon-dark.png',
    );

    const dynamicConfig = readFileSync(
      path.join(mobileRoot, 'app.config.js'),
      'utf8',
    );
    expect(dynamicConfig).toContain(
      `backgroundColor: '${nativeThemeColors.light.bgPrimary}'`,
    );
    expect(dynamicConfig).toContain(
      `backgroundColor: '${nativeThemeColors.dark.bgPrimary}'`,
    );
    expect(dynamicConfig).toContain(
      "image: './assets/images/splash-icon-dark.png'",
    );
  });

  it('puts the official mark on a black Android adaptive-icon background', () => {
    const appJson = JSON.parse(
      readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'),
    ) as {
      expo: {
        android: { adaptiveIcon: { backgroundColor: string } };
      };
    };

    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe('#000000');

    const dynamicConfig = readFileSync(
      path.join(mobileRoot, 'app.config.js'),
      'utf8',
    );
    expect(dynamicConfig).toContain("backgroundColor: '#000000'");
  });
});
