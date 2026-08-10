import { describe, expect, it } from 'vitest';
import {
  checkGitHubActionVersions,
  collectActionReferences,
  parseUsesTarget,
} from './check-github-action-versions';

describe('GitHub Action version guard', () => {
  it('keeps every tag-pinned action on one version repository-wide', () => {
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
});
