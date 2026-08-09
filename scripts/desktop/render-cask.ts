/**
 * Render the Homebrew cask for the desktop app from a published release.
 *
 * The tap (`genfeedai/homebrew-tap`) is ours, so nothing bumps it for us:
 * Homebrew's autobump only watches casks that live in `Homebrew/homebrew-cask`,
 * and that repo has a notability bar this project does not clear yet. So the
 * desktop release workflow renders the cask itself and pushes it to the tap.
 *
 * The `sha256` comes from `genfeed-desktop-release.json`, which the build
 * already writes next to the artifacts — the same bytes that were signed,
 * notarized, stapled, and uploaded. Re-downloading the disk image to hash it
 * would introduce a second source of truth for no benefit.
 *
 * Usage:
 *     bun run scripts/desktop/render-cask.ts <manifest.json> [--out <cask.rb>]
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** Cask token — the name users type: `brew install genfeedai/tap/genfeed`. */
export const CASK_TOKEN = 'genfeed';

/** The release runner is Apple Silicon, so arm64 is the only artifact built. */
export const MAC_ARM64_ASSET_PATTERN = /^GenFeed-.+-arm64\.dmg$/i;

export interface DesktopReleaseArtifact {
  name: string;
  sha256: string;
  sizeBytes: number;
}

export interface DesktopReleaseManifest {
  artifacts: DesktopReleaseArtifact[];
  tag: string | null;
  version: string;
}

export function findMacArm64Artifact(
  manifest: DesktopReleaseManifest,
): DesktopReleaseArtifact {
  const artifact = manifest.artifacts.find((candidate) =>
    MAC_ARM64_ASSET_PATTERN.test(candidate.name),
  );

  if (artifact === undefined) {
    throw new Error(
      'Release manifest contains no GenFeed-*-arm64.dmg artifact to publish a cask for.',
    );
  }

  return artifact;
}

export function renderCask(manifest: DesktopReleaseManifest): string {
  const artifact = findMacArm64Artifact(manifest);

  if (!artifact.name.includes(manifest.version)) {
    throw new Error(
      `Artifact "${artifact.name}" does not carry the release version ${manifest.version}. Run scripts/desktop/apply-release-version.ts before building.`,
    );
  }

  // Interpolating `version` into the URL is the Homebrew convention and lets
  // `brew bump-cask-pr` and `livecheck` reason about the cask, so the rendered
  // file keeps `#{version}` rather than baking the literal in.
  return `cask "${CASK_TOKEN}" do
  version "${manifest.version}"
  sha256 "${artifact.sha256}"

  url "https://github.com/genfeedai/genfeed.ai/releases/download/desktop-v#{version}/GenFeed-#{version}-arm64.dmg",
      verified: "github.com/genfeedai/genfeed.ai/"
  name "GenFeed"
  desc "AI content studio: generate, review, schedule, and publish from one workspace"
  homepage "https://genfeed.ai/"

  # The desktop release tag is published with make_latest:false so a desktop
  # build never displaces the product release, which makes :github_latest
  # structurally unable to see it. Match the desktop tag series instead.
  livecheck do
    url :url
    regex(/^desktop[._-]v?(\\d+(?:\\.\\d+)+)$/i)
    strategy :github_releases
  end

  # electron-updater installs its own updates in the background; without this
  # Homebrew reports the self-updated app as an outdated cask forever.
  auto_updates true

  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "GenFeed.app"

  zap trash: [
    "~/Library/Application Support/GenFeed",
    "~/Library/Caches/ai.genfeed.desktop",
    "~/Library/HTTPStorages/ai.genfeed.desktop",
    "~/Library/Preferences/ai.genfeed.desktop.plist",
    "~/Library/Saved Application State/ai.genfeed.desktop.savedState",
  ]
end
`;
}

function main(): void {
  const [manifestPath, ...rest] = process.argv.slice(2);

  if (manifestPath === undefined) {
    throw new Error(
      'Usage: bun run scripts/desktop/render-cask.ts <manifest.json> [--out <cask.rb>]',
    );
  }

  const outFlagIndex = rest.indexOf('--out');
  const outPath = outFlagIndex === -1 ? undefined : rest[outFlagIndex + 1];

  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as DesktopReleaseManifest;
  const cask = renderCask(manifest);

  if (outPath === undefined) {
    process.stdout.write(cask);
    return;
  }

  writeFileSync(outPath, cask);
  console.info(`Wrote ${CASK_TOKEN} cask ${manifest.version} to ${outPath}.`);
}

if (import.meta.main) {
  main();
}
