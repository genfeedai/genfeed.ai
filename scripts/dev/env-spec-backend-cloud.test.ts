import { describe, expect, it } from 'vitest';
import { ENV_TARGETS } from '../env-spec';

describe('env-spec backend cloud flag', () => {
  it('copies GENFEED_CLOUD onto every backend service, including files', () => {
    const backendTargets = ENV_TARGETS.filter((target) =>
      ['api', 'files', 'notifications', 'mcp'].includes(target.id),
    );

    expect(backendTargets.length).toBeGreaterThanOrEqual(4);

    for (const target of backendTargets) {
      expect(target.sharedKeys).toContain('GENFEED_CLOUD');
      expect(target.sharedKeys).toContain('NEXT_PUBLIC_GENFEED_CLOUD');
    }
  });

  it('copies the AWS region onto the files service for S3 uploads', () => {
    const filesTarget = ENV_TARGETS.find((target) => target.id === 'files');

    expect(filesTarget).toBeDefined();
    expect(filesTarget?.directKeys).toContain('AWS_REGION');
  });
});
