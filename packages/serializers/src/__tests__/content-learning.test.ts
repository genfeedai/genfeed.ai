import { ContentLearningArm, ContentLearningMode } from '@genfeedai/contracts';
import type { LearningAccountView } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { describe, expect, it } from 'vitest';
import { contentLearningDatasetAttributes } from '../attributes/analytics/content-learning-dataset.attributes';
import { contentLearningReleaseAttributes } from '../attributes/analytics/content-learning-release.attributes';
import { contentLearningRunAttributes } from '../attributes/analytics/content-learning-run.attributes';
import { ContentLearningAccountSerializer } from '../server/analytics/content-learning-account.serializer';

describe('public learning projections', () => {
  it('never exposes tenant source manifests, owned log source references, recipient salts or operator rights text', () => {
    for (const attributes of [
      contentLearningDatasetAttributes,
      contentLearningRunAttributes,
      contentLearningReleaseAttributes,
    ]) {
      expect(attributes).not.toContain('sourceReference');
      expect(attributes).not.toContain('recipientSalt');
      expect(attributes).not.toContain('rightsStatement');
    }
    expect(contentLearningDatasetAttributes).not.toContain('manifest');
  });
});

describe('learning account serializer', () => {
  it('preserves distinct descriptor scopes and selected provenance while excluding private internals', () => {
    const account: LearningAccountView = {
      id: 'test-account',
      organizationId: 'test-org',
      brandId: 'test-brand',
      credentialId: 'test-credential',
      mode: ContentLearningMode.SHADOW,
      revision: 3,
      epoch: 2,
      sharingConsentVersion: null,
      sharedReleasePreference: 'disabled',
      pinnedReleaseId: null,
      approvedArmIds: [],
      baselineCount: 0,
      activePolicyId: null,
      failureReason: null,
      driftState: null,
      scopes: [20, 7].map<NonNullable<LearningAccountView['scopes']>[number]>(
        (baselineCount, index) => ({
          scopeKey: `test-scope-${index}`,
          epoch: 2,
          revision: index + 1,
          descriptor: {
            platform: 'twitter',
            format: 'text',
            objective: 'engagement',
            exposureSource: 'impressions',
            metricWeights: index ? [['shares', 1]] : [['likes', 1]],
            retention: false,
            windowId: '48h-v1',
            configVersion: 'rl-reward-v1-experimental',
            featureSchema: 'numeric-nine-v1',
            armCatalogVersion: 'learning-arms-v1',
          },
          descriptorHash: `test-descriptor-${index}`,
          baselineCount,
          activePolicyId: index ? null : 'test-policy',
          pinnedPolicyId: null,
          lastValidRewardAt: index ? null : '2026-10-01T00:00:00.000Z',
          unavailableReasons: index ? ['missing_metrics'] : [],
        }),
      ),
      latestDecision: {
        decisionId: 'test-decision',
        mode: ContentLearningMode.SHADOW,
        armId: ContentLearningArm.BASELINE,
        policyVersionId: 'test-policy',
        descriptorHash: 'test-descriptor-0',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: true,
      },
    };
    const serialized = ContentLearningAccountSerializer.serialize({
      ...account,
      consentRecords: ['PRIVATE_CONSENT'],
      dependencyManifest: 'PRIVATE_DEPENDENCY',
      sourceManifest: 'PRIVATE_SOURCE',
      rawProviderData: 'PRIVATE_PROVIDER',
      prePilotMode: 'PRIVATE_PRE_PILOT',
      prePilotPolicyId: 'PRIVATE_POLICY',
    });
    const json = JSON.stringify(serialized);
    expect(json).toContain('test-scope-0');
    expect(json).toContain('test-scope-1');
    expect(json).toContain('test-decision');
    const data = serialized.data;
    if (Array.isArray(data) || !data)
      throw new Error('Expected account resource');
    expect(data.attributes?.scopes).toEqual(account.scopes);
    expect(data.attributes?.latestDecision).toEqual(account.latestDecision);
    expect(json).not.toContain('PRIVATE_');
    expect(json).not.toContain('applied');
    expect(
      ContentLearningAccountSerializer.serialize({
        ...account,
        latestDecision: undefined,
      }),
    ).toBeDefined();
  });
});
