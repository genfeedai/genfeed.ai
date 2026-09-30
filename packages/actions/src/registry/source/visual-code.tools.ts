import type { SourceTool } from '../../interfaces/source-tool.interface';
import type { ToolParameterSchema } from '../../interfaces/tool-definition.interface';
import {
  VISUAL_CODE_ACTION_ALIASES,
  VISUAL_CODE_INPUT_SCHEMAS,
} from '../contracts/visual-code-action-contracts';

const descriptions: Record<string, string> = {
  catalog:
    'List available visual-code models, rendering limits, rates and inspection support for this brand.',
  quote:
    'Quote a visual-code request without spending credits. Show the selected model, inspection uncertainty, output formats and maximum credits before requesting approval.',
  generate:
    'Create a versioned visual project from a prompt or directly supplied React/Remotion source. Requires a prior quote and approved maximumCredits. Untrusted code runs only in an isolated renderer; completed outputs enter the brand Library.',
  status:
    'Read visual project revision history, diagnostics, costs, previews and completed Library outputs. Source is available through the authenticated source download.',
  revise:
    'Create an immutable visual revision using exactly one prompt, sourceCode or props change and an approved quote. expectedRevision prevents overwriting newer work.',
  export:
    'Export retained source to MP4, PNG or JPEG Library outputs using an approved quote and expectedRevision.',
  cancel:
    'Request cancellation of the current visual revision. Consumed work is charged and unused held credits are released.',
  retry:
    'Explicitly retry retained source from a failed or cancelled visual revision using a new requestId and approved quote. No automatic source repair occurs; inspect prior diagnostics for uncertain provider work.',
};
export const VISUAL_CODE_TOOLS: SourceTool[] = Object.entries(
  VISUAL_CODE_ACTION_ALIASES,
).map(([name, operation]) => ({
  name,
  description: descriptions[operation],
  creditCost: 0,
  requiredRole: 'user',
  parameters: VISUAL_CODE_INPUT_SCHEMAS[operation] as ToolParameterSchema,
}));
