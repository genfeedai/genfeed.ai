import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDesktopReleaseVersion,
  parseDesktopTagVersion,
} from './apply-release-version';

const testDirectories: string[] = [];

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function manifestFile(contents: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'desktop-version-'));
  testDirectories.push(directory);
  const manifestPath = path.join(directory, 'package.json');
  writeFileSync(manifestPath, contents);
  return manifestPath;
}

const DESKTOP_MANIFEST = `{
  "name": "@genfeedai/desktop",
  "productName": "GenFeed",
  "version": "0.1.0"
}
`;

describe('parseDesktopTagVersion', () => {
  it('reads the version from a desktop release tag', () => {
    expect(parseDesktopTagVersion('desktop-v0.2.0')).toBe('0.2.0');
  });

  it('accepts a prerelease tag', () => {
    expect(parseDesktopTagVersion('desktop-v1.0.0-beta.3')).toBe(
      '1.0.0-beta.3',
    );
  });

  it('ignores the product release tag series', () => {
    expect(parseDesktopTagVersion('v3.4.0')).toBeNull();
  });

  it('ignores a branch ref from workflow_dispatch', () => {
    expect(parseDesktopTagVersion('master')).toBeNull();
  });

  it('ignores a missing ref', () => {
    expect(parseDesktopTagVersion(undefined)).toBeNull();
  });

  it('rejects a desktop tag carrying an invalid version', () => {
    expect(() => parseDesktopTagVersion('desktop-v0.2')).toThrow(
      /valid semver/,
    );
  });

  it('rejects a desktop tag with a leading-zero segment', () => {
    expect(() => parseDesktopTagVersion('desktop-v01.2.0')).toThrow(
      /valid semver/,
    );
  });
});

describe('applyDesktopReleaseVersion', () => {
  it('writes the tag version into the manifest', () => {
    const manifestPath = manifestFile(DESKTOP_MANIFEST);

    const result = applyDesktopReleaseVersion({
      manifestPath,
      ref: 'desktop-v0.2.0',
    });

    expect(result).toEqual({ isApplied: true, version: '0.2.0' });
    expect(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string },
    ).toMatchObject({ version: '0.2.0' });
  });

  it('leaves every other field and the formatting untouched', () => {
    const manifestPath = manifestFile(DESKTOP_MANIFEST);

    applyDesktopReleaseVersion({ manifestPath, ref: 'desktop-v0.2.0' });

    expect(readFileSync(manifestPath, 'utf8')).toBe(
      DESKTOP_MANIFEST.replace('"0.1.0"', '"0.2.0"'),
    );
  });

  it('is a no-op off a desktop tag, reporting the existing version', () => {
    const manifestPath = manifestFile(DESKTOP_MANIFEST);

    const result = applyDesktopReleaseVersion({
      manifestPath,
      ref: 'master',
    });

    expect(result).toEqual({ isApplied: false, version: '0.1.0' });
    expect(readFileSync(manifestPath, 'utf8')).toBe(DESKTOP_MANIFEST);
  });

  it('fails on a manifest with no version field', () => {
    const manifestPath = manifestFile('{ "name": "@genfeedai/desktop" }');

    expect(() =>
      applyDesktopReleaseVersion({ manifestPath, ref: 'desktop-v0.2.0' }),
    ).toThrow(/no string "version" field/);
  });

  it('fails the release rather than shipping a mislabelled build', () => {
    const manifestPath = manifestFile(DESKTOP_MANIFEST);

    expect(() =>
      applyDesktopReleaseVersion({ manifestPath, ref: 'desktop-v0.2' }),
    ).toThrow(/valid semver/);
    expect(readFileSync(manifestPath, 'utf8')).toBe(DESKTOP_MANIFEST);
  });
});
