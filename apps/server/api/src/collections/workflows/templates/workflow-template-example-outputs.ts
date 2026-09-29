import type { WorkflowTemplateExampleOutput } from '@genfeedai/contracts/interfaces';

type ExampleOutputRecord = Readonly<
  Record<string, WorkflowTemplateExampleOutput>
>;

/**
 * Example output per template id (#5498), shown as the template's preview on
 * the templates page instead of its workflow graph. Kept apart from the graph
 * definitions so media and graphs change independently.
 *
 * System templates are global: every entry must be a public, already-hosted
 * asset (never tenant media). A template without an entry keeps the graph
 * preview; `workflow-template-example-outputs.spec.ts` lists the ones still
 * waiting for media.
 */
export const WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS: ExampleOutputRecord = {};

export function getWorkflowTemplateExampleOutput(
  templateId: string,
  outputs: ExampleOutputRecord = WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS,
): WorkflowTemplateExampleOutput | undefined {
  return Object.hasOwn(outputs, templateId) ? outputs[templateId] : undefined;
}

/** Attaches each template's example output, keyed by the template id. */
export function withExampleOutputs<
  T extends { exampleOutput?: WorkflowTemplateExampleOutput; id: string },
>(
  templates: Record<string, T>,
  outputs: ExampleOutputRecord = WORKFLOW_TEMPLATE_EXAMPLE_OUTPUTS,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(templates).map(([templateId, template]) => {
      const exampleOutput = getWorkflowTemplateExampleOutput(
        template.id,
        outputs,
      );
      return [
        templateId,
        exampleOutput === undefined ? template : { ...template, exampleOutput },
      ];
    }),
  );
}
