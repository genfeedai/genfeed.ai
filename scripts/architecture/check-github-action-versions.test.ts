import { describe, expect, it } from 'vitest';
import {
  checkGitHubActionVersions,
  collectActionReferences,
  parseUsesLine,
  parseUsesTarget,
  parseVersionComment,
} from './check-github-action-versions';

describe('GitHub Action pin guard', () => {
  it('keeps every external action immutable and consistent repository-wide', () => {
    expect(checkGitHubActionVersions()).toEqual([]);
  });

  it('scans composite actions, not only workflows', () => {
    // The drift this guard was written for lived in a composite action, which
    // a `.github/workflows` sweep never reaches.
    const scannedFiles = new Set(
      collectActionReferences().map(({ file }) => file),
    );

    expect(
      [...scannedFiles].some((file) => file.startsWith('.github/actions/')),
    ).toBe(true);
  });

  it('strips sub-action paths so siblings share one version', () => {
    expect(parseUsesTarget('github/codeql-action/init@v4')).toEqual({
      action: 'github/codeql-action',
      version: 'v4',
    });
  });

  it('ignores local and container references', () => {
    expect(parseUsesTarget('./.github/actions/setup-bun-env')).toBeNull();
    expect(parseUsesTarget('docker://alpine:3.20')).toBeNull();
  });

  it('reads the version after the final separator', () => {
    expect(parseUsesTarget('aquasecurity/trivy-action@0.36.0')).toEqual({
      action: 'aquasecurity/trivy-action',
      version: '0.36.0',
    });
  });

  it('reads the human-reviewable release comment separately from the pin', () => {
    expect(
      parseVersionComment(
        'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      ),
    ).toBe('v7.0.1');
    expect(
      parseVersionComment(
        'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1 | keep this context',
      ),
    ).toBe('v7.0.1');
    expect(
      parseVersionComment(
        'uses: PlasmoHQ/bpp@c15984c0a74f452851c605cab46f34d9fd6cb158',
      ),
    ).toBeNull();
  });

  it('normalizes quoted and unquoted uses targets', () => {
    expect(parseUsesLine('uses: actions/checkout@v7')).toBe(
      'actions/checkout@v7',
    );
    expect(parseUsesLine('uses: "actions/checkout@v7"')).toBe(
      'actions/checkout@v7',
    );
    expect(parseUsesLine("uses: 'actions/checkout@v7'")).toBe(
      'actions/checkout@v7',
    );
  });

  it('stores immutable pins and their release labels from real workflow files', () => {
    const references = collectActionReferences();

    expect(references.length).toBeGreaterThan(0);
    expect(
      references.every(({ version }) => /^[0-9a-f]{40}$/.test(version)),
    ).toBe(true);
    expect(
      references.some(
        ({ action, release }) =>
          action === 'actions/checkout' &&
          release !== undefined &&
          /^v\d+\.\d+\.\d+$/.test(release),
      ),
    ).toBe(true);
  });
});
