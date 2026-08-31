import { describe, expect, it } from 'vitest';
import { ENV_TARGETS, ROOT_ENV_SECTIONS } from '../env-spec';

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

  it('copies an explicit AWS profile onto the files service', () => {
    const filesTarget = ENV_TARGETS.find((target) => target.id === 'files');

    expect(filesTarget).toBeDefined();
    expect(filesTarget?.directKeys).toContain('AWS_PROFILE');
  });

  it('copies worker-consumed provider configuration onto the workers service', () => {
    const workersTarget = ENV_TARGETS.find((target) => target.id === 'workers');
    const workerProviderKeys = [
      'AWS_ACCESS_KEY_ID',
      'AWS_REGION',
      'AWS_SECRET_ACCESS_KEY',
      'FAL_API_KEY',
      'GPU_LLM_INSTANCE_ID',
      'OPENROUTER_API_KEY',
      'REPLICATE_KEY',
    ];

    expect(workersTarget).toBeDefined();
    for (const key of workerProviderKeys) {
      expect(workersTarget?.directKeys).toContain(key);
    }
  });

  it('copies every Connect-menu OAuth setting onto the API service', () => {
    const apiTarget = ENV_TARGETS.find((target) => target.id === 'api');
    const oauthKeys = [
      'FANVUE_CLIENT_ID',
      'FANVUE_CLIENT_SECRET',
      'FANVUE_REDIRECT_URI',
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_REDIRECT_URI',
      'THREADS_CLIENT_ID',
      'THREADS_CLIENT_SECRET',
      'THREADS_API_VERSION',
      'THREADS_GRAPH_URL',
      'THREADS_REDIRECT_URI',
      'YOUTUBE_API_KEY',
    ];

    expect(apiTarget).toBeDefined();
    const apiRootSection = ROOT_ENV_SECTIONS.find(
      (section) => section.title === 'API',
    );
    expect(apiRootSection).toBeDefined();
    for (const key of oauthKeys) {
      expect(apiTarget?.directKeys).toContain(key);
      expect(apiRootSection?.keys).toContain(key);
    }
  });
});
