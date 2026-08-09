import { describe, expect, it } from 'vitest';
import {
  type DesktopReleaseManifest,
  findMacArm64Artifact,
  renderCask,
} from './render-cask';

const SHA256 =
  '9eed87eda1f58a9f7c60d55039c8d2e6dd681d728822c70e29a457d747d91b6f';

function manifest(
  overrides: Partial<DesktopReleaseManifest> = {},
): DesktopReleaseManifest {
  return {
    artifacts: [
      { name: 'GenFeed-0.2.0-arm64.dmg', sha256: SHA256, sizeBytes: 155_000 },
      {
        name: 'GenFeed-0.2.0-arm64.zip',
        sha256: 'a'.repeat(64),
        sizeBytes: 150_000,
      },
    ],
    tag: 'desktop-v0.2.0',
    version: '0.2.0',
    ...overrides,
  };
}

describe('findMacArm64Artifact', () => {
  it('picks the disk image over the updater zip', () => {
    expect(findMacArm64Artifact(manifest()).name).toBe(
      'GenFeed-0.2.0-arm64.dmg',
    );
  });

  it('fails when no arm64 disk image was published', () => {
    expect(() =>
      findMacArm64Artifact(
        manifest({
          artifacts: [
            {
              name: 'GenFeed-0.2.0-arm64.zip',
              sha256: SHA256,
              sizeBytes: 1,
            },
          ],
        }),
      ),
    ).toThrow(/no GenFeed-\*-arm64\.dmg/);
  });
});

describe('renderCask', () => {
  it('carries the release version and the manifest checksum', () => {
    const cask = renderCask(manifest());

    expect(cask).toContain('cask "genfeed" do');
    expect(cask).toContain('version "0.2.0"');
    expect(cask).toContain(`sha256 "${SHA256}"`);
  });

  it('builds the download URL from the desktop tag series', () => {
    expect(renderCask(manifest())).toContain(
      'releases/download/desktop-v#{version}/GenFeed-#{version}-arm64.dmg',
    );
  });

  it('declares auto_updates so electron-updater does not strand the cask', () => {
    expect(renderCask(manifest())).toContain('auto_updates true');
  });

  it('uses the release-scanning livecheck strategy, never :github_latest', () => {
    const cask = renderCask(manifest());

    expect(cask).toContain('strategy :github_releases');
    expect(cask).not.toContain(':github_latest');
  });

  it('restricts the cask to Apple Silicon, matching the only artifact built', () => {
    expect(renderCask(manifest())).toContain('depends_on arch: :arm64');
  });

  it('installs the app under its packaged name', () => {
    expect(renderCask(manifest())).toContain('app "GenFeed.app"');
  });

  it('rejects an artifact whose filename disagrees with the release version', () => {
    expect(() =>
      renderCask(
        manifest({
          artifacts: [
            {
              name: 'GenFeed-0.1.0-arm64.dmg',
              sha256: SHA256,
              sizeBytes: 155_000,
            },
          ],
        }),
      ),
    ).toThrow(/does not carry the release version 0\.2\.0/);
  });
});
