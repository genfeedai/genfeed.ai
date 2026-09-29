import { listSystemWorkflowCatalog } from '@api/collections/workflows/system-workflow-catalog';
import {
  getWorkflowTemplateExampleOutput,
  WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS,
  withExampleOutputs,
} from '@api/collections/workflows/templates/workflow-template-example-outputs';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { MediaType } from '@genfeedai/contracts';
import {
  parseWorkflowTemplateExampleOutput,
  type WorkflowTemplateExampleOutput,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const THREAD_IMAGE: WorkflowTemplateExampleOutput = {
  mediaType: MediaType.IMAGE,
  url: 'https://cdn.example.com/examples/thread.png',
};

/** Every global system template, by id: the starter set and the catalog. */
const SYSTEM_TEMPLATES = new Map<string, string>([
  ...Object.values(WORKFLOW_TEMPLATES).map(
    (template) => [template.id, template.name] as const,
  ),
  ...listSystemWorkflowCatalog().map(
    (entry) => [entry.canonicalId, entry.label] as const,
  ),
]);

const TEMPLATES_WITHOUT_EXAMPLE_OUTPUT = [...SYSTEM_TEMPLATES].filter(
  ([templateId]) => !getWorkflowTemplateExampleOutput(templateId),
);

describe('workflow template example outputs', () => {
  it('keys every example output by a real system template id', () => {
    const unknownIds = Object.keys(WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS).filter(
      (templateId) => !SYSTEM_TEMPLATES.has(templateId),
    );
    expect(unknownIds).toEqual([]);
  });

  it('points every example output at a well-formed public asset', () => {
    for (const output of Object.values(WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS)) {
      expect(parseWorkflowTemplateExampleOutput(output)).toEqual(output);
    }
  });

  it('serves each template with exactly its mapped example output', () => {
    for (const template of Object.values(WORKFLOW_TEMPLATES)) {
      expect(template.exampleOutput).toEqual(
        getWorkflowTemplateExampleOutput(template.id),
      );
    }
    for (const entry of listSystemWorkflowCatalog()) {
      expect(entry.exampleOutput).toEqual(
        getWorkflowTemplateExampleOutput(entry.canonicalId),
      );
    }
  });

  it('reads an unknown or inherited id as no example output', () => {
    const outputs = { 'founder-x-thread': THREAD_IMAGE };
    expect(
      getWorkflowTemplateExampleOutput('founder-x-thread', outputs),
    ).toEqual(THREAD_IMAGE);
    expect(
      getWorkflowTemplateExampleOutput('missing', outputs),
    ).toBeUndefined();
    expect(
      getWorkflowTemplateExampleOutput('constructor', outputs),
    ).toBeUndefined();
  });

  it('attaches example outputs by template id and leaves the rest untouched', () => {
    const plain = { id: 'plain', name: 'Plain' };
    const thread = { id: 'founder-x-thread', name: 'Thread' };
    const templates = withExampleOutputs(
      { 'founder-x-thread': thread, plain },
      { 'founder-x-thread': THREAD_IMAGE },
    );

    expect(templates['founder-x-thread']).toEqual({
      ...thread,
      exampleOutput: THREAD_IMAGE,
    });
    expect(templates.plain).toBe(plain);
    expect(templates.plain).not.toHaveProperty('exampleOutput');
  });

  /**
   * Gap report, not a gate: example media is supplied by a human, so each
   * system template still previewing its graph shows up as a todo.
   */
  describe('system templates still missing example output', () => {
    it(`reports ${TEMPLATES_WITHOUT_EXAMPLE_OUTPUT.length} of ${SYSTEM_TEMPLATES.size} system templates without example output`, () => {
      expect(SYSTEM_TEMPLATES.size).toBeGreaterThan(0);
    });

    for (const [templateId, name] of TEMPLATES_WITHOUT_EXAMPLE_OUTPUT) {
      it.todo(`${name} (${templateId}) needs example output media`);
    }
  });
});
