import { ALL_ACTIONS } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  type ActionContractProvenance,
  compileActionContract,
} from './action-contract';

const PROVENANCE: ActionContractProvenance = {
  nodeId: 'load-source',
  runId: 'run-1',
  workflowId: 'knowledge-source-ingest',
  workflowVersionId: 'v1',
};

const ACTOR = {
  isApiKey: false,
  organizationId: 'org-1',
  scopes: ['knowledge:write'],
  userId: 'user-1',
};

const REQUEST = {
  organizationId: 'org-1',
  sourceId: 'source-1',
  versionId: 'version-1',
};

function compile(actionId: string) {
  const action = ALL_ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`missing action: ${actionId}`);
  }
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });
}

describe('knowledge source action contracts carry the initiating actor', () => {
  it('accepts a load request with the projected actor, and one without', () => {
    const load = compile('knowledge.source.load');

    expect(() =>
      load.validateInput(
        { request: { ...REQUEST, initiatingActor: ACTOR } },
        PROVENANCE,
      ),
    ).not.toThrow();
    expect(() =>
      load.validateInput({ request: REQUEST }, PROVENANCE),
    ).not.toThrow();
  });

  it('rejects an actor that is incomplete or carries extra fields', () => {
    const load = compile('knowledge.source.load');
    const { userId: _userId, ...withoutUser } = ACTOR;

    expect(() =>
      load.validateInput(
        { request: { ...REQUEST, initiatingActor: withoutUser } },
        PROVENANCE,
      ),
    ).toThrowError(/input validation failed/);
    expect(() =>
      load.validateInput(
        {
          request: {
            ...REQUEST,
            initiatingActor: { ...ACTOR, role: 'owner' },
          },
        },
        PROVENANCE,
      ),
    ).toThrowError(/input validation failed/);
  });

  it('accepts the state a load returns for an actor-bound run', () => {
    const load = compile('knowledge.source.load');

    expect(() =>
      load.validateOutput(
        {
          initiatingActor: ACTOR,
          organizationId: 'org-1',
          sourceId: 'source-1',
          status: 'ready',
          versionId: 'version-1',
        },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('accepts a backfill request and the items it schedules with the actor', () => {
    const backfill = compile('knowledge.source.discover-backfill');

    expect(() =>
      backfill.validateInput(
        { request: { initiatingActor: ACTOR, organizationId: 'org-1' } },
        PROVENANCE,
      ),
    ).not.toThrow();
    expect(() =>
      backfill.validateOutput(
        { items: [{ ...REQUEST, initiatingActor: ACTOR }] },
        PROVENANCE,
      ),
    ).not.toThrow();
  });
});

describe('archive_knowledge_source output contract', () => {
  const archived = {
    creditsUsed: 0,
    data: {
      brandId: 'brand-1',
      id: 'source-1',
      isVisible: false,
      kind: 'URL',
      message: 'Source archived.',
      purpose: 'BRAND_TRUTH',
      scope: 'brand',
      title: 'Pricing',
    },
    success: true,
  };

  it('accepts the message the archive handler returns', () => {
    const archive = compile('archive_knowledge_source');

    expect(() => archive.validateOutput(archived, PROVENANCE)).not.toThrow();
  });

  it('still rejects a field the contract does not name', () => {
    const archive = compile('archive_knowledge_source');

    expect(() =>
      archive.validateOutput(
        { ...archived, data: { ...archived.data, note: 'x' } },
        PROVENANCE,
      ),
    ).toThrowError(/output validation failed/);
  });
});
