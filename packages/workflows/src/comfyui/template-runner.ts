import type {
  ComfyUIHistoryEntry,
  ComfyUIPrompt,
  ComfyUIWorkflowTemplate,
} from '@genfeedai/types';
import { ComfyUIClient } from './client';

/**
 * Resolves a ComfyUI workflow template with user-provided inputs,
 * then executes it on a ComfyUI instance.
 */
export class ComfyUITemplateRunner {
  constructor(private readonly client: ComfyUIClient) {}

  /**
   * Resolve template inputs into a concrete prompt.
   * Injects user values into the template's node graph.
   */
  resolvePrompt(
    template: ComfyUIWorkflowTemplate,
    values: Record<string, unknown>,
  ): ComfyUIPrompt {
    // Deep clone the template prompt
    const prompt: ComfyUIPrompt = JSON.parse(JSON.stringify(template.prompt));

    for (const input of template.inputs) {
      const value = values[input.key] ?? input.default;

      if (input.required && value === undefined) {
        throw new Error(`Missing required input: ${input.key}`);
      }

      if (value !== undefined) {
        const node = prompt[input.nodeId];
        if (!node) {
          throw new Error(`Template references unknown node: ${input.nodeId}`);
        }
        node.inputs[input.field] = value;
      }
    }

    return prompt;
  }

  /**
   * Run a template with the given inputs and wait for completion.
   */
  async run(
    template: ComfyUIWorkflowTemplate,
    values: Record<string, unknown>,
  ): Promise<ComfyUIHistoryEntry> {
    const prompt = this.resolvePrompt(template, values);
    const { prompt_id } = await this.client.queuePrompt(prompt);
    return this.client.waitForCompletion(prompt_id);
  }
}
