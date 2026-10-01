import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  parseWorkflowGenerationAdmissionSource,
  projectWorkflowAdmissionExecutable,
  redactWorkflowGenerationAdmissionSource,
} from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import { createInitialWorkflowNodeState } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import { workflowAdmissionAvailableSourceSchema } from '@api/collections/workflows/workflow-generation-admission.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { ExecutableWorkflow } from '@genfeedai/workflows';
import { topologicalSort } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function requireItem<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error('Missing test fixture item');
  return item;
}
function executable(): ExecutableWorkflow {
  return {
    id: 'workflow',
    versionId: 'version',
    organizationId: 'org',
    userId: 'actor',
    brandId: 'brand',
    emitSharedEvents: true,
    isCustomerWorkflow: true,
    nodes: [
      {
        id: 'input',
        type: 'workflowInput',
        label: 'Input',
        config: {},
        inputs: [],
        isLocked: true,
        cachedOutput: 'owned-reference',
      },
      {
        id: 'media',
        type: 'genfeedAction',
        label: 'Image',
        config: {
          actionId: 'imageGen',
          parameters: { width: 512, height: 512 },
        },
        inputs: [],
        isLocked: false,
        cachedOutput: undefined,
      },
    ],
    edges: [
      {
        id: 'input-edge',
        source: 'input',
        target: 'media',
        sourceHandle: undefined,
        targetHandle: 'reference',
      },
    ],
    lockedNodeIds: ['input'],
  };
}
function available(): WorkflowAdmissionAvailableSourceV1 {
  const workflow = projectWorkflowAdmissionExecutable(executable());
  const trigger = { type: 'manual', platform: 'internal', data: {} };
  const initial = createInitialWorkflowNodeState(workflow, trigger, {
    respectLocks: true,
  });
  const body = {
    version: 1 as const,
    state: 'available' as const,
    preparationVersion: 1 as const,
    requestHash: 'a'.repeat(64),
    organizationId: 'org',
    actorUserId: 'actor',
    workflowId: 'workflow',
    workflowVersionId: 'version',
    workflowVersionContentHash: `sha256:v1:${'b'.repeat(64)}`,
    brandId: 'brand',
    trigger,
    selection: { mode: 'full' as const, respectLocks: true },
    workflow,
    selectedNodeIds: topologicalSort(workflow.nodes, workflow.edges),
    initialNodeOutputs: Object.fromEntries(initial.nodeCache),
    initiallyCompletedNodeIds: [...initial.completedNodes],
  };
  return workflowAdmissionAvailableSourceSchema.parse({
    ...body,
    sourceHash: quoteSnapshotHash(body),
  });
}
function rehash(source: WorkflowAdmissionAvailableSourceV1) {
  const { sourceHash: _hash, ...body } = source;
  return { ...body, sourceHash: quoteSnapshotHash(body) };
}

describe('strict available workflow admission source and payload tombstone', () => {
  it('omits only legitimate structural undefined and copies nested graph data', () => {
    const raw = executable();
    const projected = projectWorkflowAdmissionExecutable(raw);
    expect(Object.hasOwn(projected.nodes[1] ?? {}, 'cachedOutput')).toBe(false);
    expect(Object.hasOwn(projected.edges[0] ?? {}, 'sourceHandle')).toBe(false);
    requireItem(raw.nodes, 1).config = { actionId: 'changed' };
    expect(projected.nodes[1]?.config).toEqual({
      actionId: 'imageGen',
      parameters: { width: 512, height: 512 },
    });
    const source = available();
    const parsed = parseWorkflowGenerationAdmissionSource(source);
    requireItem(source.workflow.nodes, 1).config.actionId = 'changed';
    expect(
      parsed.state === 'available' && parsed.workflow.nodes[1]?.config.actionId,
    ).toBe('imageGen');
  });
  it('supports the real converter output without silently copying scheduled runtime metadata', () => {
    const converter = new WorkflowEngineConverterService();
    const converted = converter.convertToExecutableWorkflow({
      id: 'workflow',
      versionId: 'version',
      organizationId: 'org',
      userId: 'actor',
      nodes: [
        {
          id: 'input',
          type: 'workflowInput',
          position: { x: 0, y: 0 },
          data: { label: 'Input', config: {} },
        },
      ],
      edges: [],
      lockedNodeIds: [],
    });
    expect(projectWorkflowAdmissionExecutable(converted).nodes).toHaveLength(1);
    expect(() =>
      projectWorkflowAdmissionExecutable({
        ...converted,
        scheduledFireJobId: 'job',
      }),
    ).toThrow();
  });
  it.each([
    undefined,
    Number.NaN,
    Infinity,
    -0,
    () => 'invalid',
    new Date(),
    new Map(),
  ])(
    'rejects noncanonical nested config %s rather than dropping it',
    (value) => {
      const raw = executable();
      requireItem(raw.nodes, 1).config = {
        actionId: 'imageGen',
        invalid: value,
      };
      expect(() => projectWorkflowAdmissionExecutable(raw)).toThrow();
    },
  );
  it('rejects canonical data keys that the structural schema would silently omit', () => {
    const raw = executable();
    Object.defineProperty(requireItem(raw.nodes, 1).config, '__proto__', {
      value: { privateInput: 'must-not-disappear' },
      enumerable: true,
    });
    expect(() => projectWorkflowAdmissionExecutable(raw)).toThrow();
  });
  it('does not invoke accessors or serialization hooks while inspecting structural fields', () => {
    const getter = vi.fn(() => 'media');
    const raw = executable();
    Object.defineProperty(requireItem(raw.nodes, 1), 'id', {
      get: getter,
      enumerable: true,
    });
    expect(() => projectWorkflowAdmissionExecutable(raw)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const hook = vi.fn(() => executable());
    expect(() =>
      projectWorkflowAdmissionExecutable({ ...executable(), toJSON: hook }),
    ).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });
  it('rejects custom prototypes, symbols, nonenumerable fields and sparse arrays', () => {
    const prototype = executable();
    Object.setPrototypeOf(prototype, { inherited: true });
    expect(() => projectWorkflowAdmissionExecutable(prototype)).toThrow();
    const symbol = executable();
    Object.defineProperty(requireItem(symbol.nodes, 0), Symbol('hidden'), {
      value: true,
      enumerable: true,
    });
    expect(() => projectWorkflowAdmissionExecutable(symbol)).toThrow();
    const hidden = executable();
    Object.defineProperty(requireItem(hidden.edges, 0), 'hidden', {
      value: true,
      enumerable: false,
    });
    expect(() => projectWorkflowAdmissionExecutable(hidden)).toThrow();
    const sparse = executable();
    delete sparse.nodes[0];
    expect(() => projectWorkflowAdmissionExecutable(sparse)).toThrow();
  });
  it('rejects decorated array prototypes and extra array properties', () => {
    const decorated = executable();
    Object.setPrototypeOf(decorated.nodes, Object.create(Array.prototype));
    expect(() => projectWorkflowAdmissionExecutable(decorated)).toThrow();
    const extra = executable();
    Object.defineProperty(extra.edges, 'extra', {
      value: 'invalid',
      enumerable: true,
    });
    expect(() => projectWorkflowAdmissionExecutable(extra)).toThrow();
  });
  it('rejects changed hashes and an author substituted for the execution actor even after rehashing', () => {
    const changed = available();
    changed.trigger.data = { changed: true };
    expect(() => parseWorkflowGenerationAdmissionSource(changed)).toThrow();
    const author = available();
    author.workflow.userId = 'version-author';
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(author)),
    ).toThrow();
  });
  it.each([
    'organizationId',
    'workflowId',
    'workflowVersionId',
    'brandId',
  ] as const)(
    'rejects source owner mismatch at %s even with a valid hash',
    (field) => {
      const source = available();
      source[field] = 'different';
      expect(() =>
        parseWorkflowGenerationAdmissionSource(rehash(source)),
      ).toThrow();
    },
  );
  it('rejects unknown source/graph structural fields and fabricated initial outputs', () => {
    const source = available();
    expect(() =>
      parseWorkflowGenerationAdmissionSource({
        ...source,
        fakeAuthority: true,
      }),
    ).toThrow();
    const cache = available();
    cache.initialNodeOutputs['foreign-node'] = 'provider-success';
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(cache)),
    ).toThrow();
    const completed = available();
    completed.initiallyCompletedNodeIds.push('media');
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(completed)),
    ).toThrow();
  });
  it('rejects duplicate identities, dangling edges and cycles', () => {
    const duplicate = available();
    duplicate.workflow.nodes.push(requireItem(duplicate.workflow.nodes, 0));
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(duplicate)),
    ).toThrow();
    const dangling = available();
    requireItem(dangling.workflow.edges, 0).source = 'absent';
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(dangling)),
    ).toThrow();
    const cycle = available();
    cycle.workflow.edges.push({ id: 'back', source: 'media', target: 'input' });
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(cycle)),
    ).toThrow();
  });
  it.each(['self-loop', 'full-cycle', 'outside-partial'] as const)(
    'rejects %s even when its selected order and source hash are recomputed',
    (kind) => {
      const source = available();
      source.workflow.edges.push({
        id: 'cycle',
        source: kind === 'full-cycle' ? 'media' : 'input',
        target: 'input',
      });
      if (kind === 'outside-partial') {
        source.selection = {
          mode: 'partial',
          requestedNodeIds: ['media'],
          respectLocks: true,
        };
      }
      source.selectedNodeIds =
        kind === 'outside-partial'
          ? ['media']
          : topologicalSort(source.workflow.nodes, source.workflow.edges);
      expect(() =>
        parseWorkflowGenerationAdmissionSource(rehash(source)),
      ).toThrow();
    },
  );
  it('validates partial selection using existing frozen initial cache and forbids invented dependencies', () => {
    const source = available();
    source.selection = {
      mode: 'partial',
      requestedNodeIds: ['media'],
      respectLocks: false,
    };
    source.selectedNodeIds = ['media'];
    expect(parseWorkflowGenerationAdmissionSource(rehash(source)).state).toBe(
      'available',
    );
    source.selection.requestedNodeIds.push('media');
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(source)),
    ).toThrow();
    const missing = available();
    missing.selection = {
      mode: 'partial',
      requestedNodeIds: ['media'],
      respectLocks: true,
    };
    requireItem(missing.workflow.nodes, 0).isLocked = false;
    missing.workflow.lockedNodeIds = [];
    missing.initialNodeOutputs = {};
    missing.initiallyCompletedNodeIds = [];
    missing.selectedNodeIds = ['media'];
    expect(() =>
      parseWorkflowGenerationAdmissionSource(rehash(missing)),
    ).toThrow();
  });
  it('scrubs every raw graph/input/cache/identity snapshot and retains original noncontent hashes only', () => {
    const source = available();
    const redacted = redactWorkflowGenerationAdmissionSource(source);
    expect(redacted).toEqual({
      version: 1,
      state: 'redacted',
      reason: 'execution-payload-retention',
      requestHash: source.requestHash,
      sourceHash: source.sourceHash,
    });
    expect(redactWorkflowGenerationAdmissionSource(redacted)).toEqual(redacted);
    expect(parseWorkflowGenerationAdmissionSource(redacted).state).toBe(
      'redacted',
    );
    expect(() =>
      parseWorkflowGenerationAdmissionSource({
        ...redacted,
        workflow: source.workflow,
      }),
    ).toThrow();
  });
  it.each([
    null,
    {},
    { state: 'available', rawPrompt: 'private' },
    { state: 'redacted', requestHash: 'bad' },
  ])(
    'clears malformed retained source instead of keeping raw payload %s',
    (value) => {
      expect(redactWorkflowGenerationAdmissionSource(value)).toBeNull();
    },
  );
});
