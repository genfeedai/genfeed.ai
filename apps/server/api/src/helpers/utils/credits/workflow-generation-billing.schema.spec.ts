import {
  workflowGenerationNodeAllocationSchema as schema,
  workflowGenerationDispatchSchema,
} from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import { describe, expect, it } from 'vitest';

function falAllocation() {
  const allocation = structuredClone(
    workflowFundingFixture().manifest.allocations[0],
  );
  allocation.actionId = 'videoGen';
  allocation.billingMode = 'byok';
  delete allocation.quote;
  const modelKey = 'fal/bytedance/seedance-1.5-pro/image-to-video';
  const endpoint = 'bytedance/seedance-1.5-pro/image-to-video';
  allocation.dispatch.provider = 'fal';
  allocation.dispatch.modelKey = modelKey;
  allocation.dispatch.credentialRoute = {
    kind: 'byok',
    credentialId: 'fal-key-1',
  };
  allocation.dispatch.projectionPolicy = {
    kind: 'exact-provider-input',
    version: 1,
    inputKeys: [],
    inputFingerprint: 'a'.repeat(64),
  };
  delete allocation.dispatch.quantities.selectors;
  allocation.dispatch.preparationContract.actionId = 'videoGen';
  allocation.dispatch.preparationContract.brief.mediaKind = 'video';
  allocation.dispatch.preparationContract.brief.modelKey = modelKey;
  allocation.dispatch.preparationContract.reviewedOutput = {
    modelKey,
    provider: 'fal',
    endpoint,
    version: 'sha256:reviewed',
    target: { endpoint },
    output: {
      adapterVersion: 1,
      representation: 'video-object',
      requests: 1,
      outputs: 1,
    },
  };
  allocation.dispatch.target = JSON.stringify({ endpoint });
  return allocation;
}

describe('provider-discriminated workflow billing preparation', () => {
  it('retains the incumbent reviewed Replicate allocation', () => {
    expect(
      schema.safeParse(workflowFundingFixture().manifest.allocations[0])
        .success,
    ).toBe(true);
  });
  it('accepts the exact single-video Fal output shape with a pinned credential', () => {
    expect(schema.safeParse(falAllocation()).success).toBe(true);
  });
  it('accepts reviewed schema preparation without fabricating a brief compiler, and binds its approved version', () => {
    const allocation = falAllocation();
    const output = allocation.dispatch.preparationContract.reviewedOutput;
    allocation.dispatch.preparationContract.brief = {
      kind: 'reviewed-provider-schema',
      modelKey: output.modelKey,
      mediaKind: 'video',
      schemaVersion: output.version,
      schemaFamily: 'video-reference-v1',
      inputSchemaHash: 'a'.repeat(64),
      adapterVersion: 1,
    };
    expect(schema.safeParse(allocation).success).toBe(true);
    allocation.dispatch.preparationContract.brief.schemaVersion =
      'unapproved-version';
    expect(schema.safeParse(allocation).success).toBe(false);
  });
  it('rejects a mixed provider identity even if outer dispatch is replaced', () => {
    const allocation = falAllocation();
    allocation.dispatch.provider = 'replicate';
    expect(schema.safeParse(allocation).success).toBe(false);
    expect(
      workflowGenerationDispatchSchema.safeParse(allocation.dispatch).success,
    ).toBe(false);
  });
  it('refuses a different prepared endpoint even when the serialized target agrees', () => {
    const allocation = falAllocation();
    const output = allocation.dispatch.preparationContract.reviewedOutput;
    if (output.provider !== 'fal') throw new Error('Expected Fal fixture');
    output.target.endpoint = 'other/model';
    allocation.dispatch.target = JSON.stringify(output.target);
    expect(schema.safeParse(allocation).success).toBe(false);
  });
  it('refuses Fal video evidence for an image operation', () => {
    const allocation = falAllocation();
    allocation.actionId = 'imageGen';
    allocation.dispatch.preparationContract.actionId = 'imageGen';
    allocation.dispatch.preparationContract.brief.mediaKind = 'image';
    expect(schema.safeParse(allocation).success).toBe(false);
  });
  it('rejects a Replicate target or count/representation masquerading as Fal video', () => {
    const allocation = falAllocation();
    const reviewed = allocation.dispatch.preparationContract.reviewedOutput;
    const replaced = {
      ...allocation,
      dispatch: {
        ...allocation.dispatch,
        preparationContract: {
          ...allocation.dispatch.preparationContract,
          reviewedOutput: {
            ...reviewed,
            target: { model: 'owner/model' },
            output: {
              adapterVersion: 1,
              representation: 'uri-array',
              requests: 1,
              outputs: 1,
              countInput: 'count',
            },
          },
        },
      },
    };
    expect(schema.safeParse(replaced).success).toBe(false);
  });
  it('does not admit a platform operation without its frozen pricing or a BYOK operation with platform selectors', () => {
    const allocation = falAllocation();
    allocation.billingMode = 'credits';
    allocation.dispatch.credentialRoute = { kind: 'platform' };
    allocation.dispatch.projectionPolicy = {
      kind: 'frozen-pricing-profile',
      version: 1,
    };
    expect(schema.safeParse(allocation).success).toBe(false);
    const byok = falAllocation();
    byok.dispatch.quantities.selectors = {};
    expect(schema.safeParse(byok).success).toBe(false);
  });
});
