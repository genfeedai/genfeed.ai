/**
 * Every API file that calls a text model, and where brand context is accounted
 * for. `model-callers.test.ts` sweeps the API source: a file that calls a model
 * must be the `source` or an `alsoCovers` entry of a registry row in
 * `generation-types.ts`, or be listed here with a reason. A new generation
 * service therefore cannot ship without a row or a written exemption.
 *
 * `needs-triage` is the sweep result for files that may generate content and
 * show no brand-context call. It is a list to shrink, never to grow: decide
 * each file, then move it to a registry row or to `not-generative`.
 */

export type ModelCallerStatus = 'not-generative' | 'needs-triage';

export interface ModelCallerEntry {
  status: ModelCallerStatus;
  note: string;
}

const API = 'apps/server/api/src';

function entries(
  status: ModelCallerStatus,
  note: string,
  paths: readonly string[],
): ReadonlyArray<readonly [string, ModelCallerEntry]> {
  return paths.map((path) => [`${API}/${path}`, { note, status }] as const);
}

export const MODEL_CALLERS: Readonly<Record<string, ModelCallerEntry>> =
  Object.fromEntries([
    ...entries(
      'not-generative',
      'Embeddings, judging, scoring or inspection of existing content; nothing is authored.',
      [
        'collections/contexts/services/context-embedding-provider.service.ts',
        'collections/contexts/services/knowledge-conflict-judge.service.ts',
        'collections/personas/services/character-image-inspection.service.ts',
        'services/brand-publish-policy/brand-policy-judge.service.ts',
        'services/brand-validation/brand-fact-check.service.ts',
        'services/content-quality/content-quality-scorer.service.ts',
        'services/media-perception/media-perception-describer.service.ts',
        'services/seo/seo-scorer.service.ts',
        'collections/workflows/services/video-qa-continuity-resolver.service.ts',
        'collections/content-intelligence/services/pattern-analyzer.service.ts',
        'collections/insights/services/insights.service.ts',
      ],
    ),
    ...entries(
      'not-generative',
      'Task planning, quality checks or context compression for the agent; the output is not brand content.',
      [
        'services/agent-threading/services/thread-context-compressor.service.ts',
        'services/task-orchestration/task-decomposition.service.ts',
        'services/task-orchestration/constants/decomposition-prompt.constant.ts',
        'services/task-orchestration/workspace-task-quality.service.ts',
      ],
    ),
    ...entries(
      'not-generative',
      'Provider client, pricing or the prompt enhancer that the registered image and video rows call; it adds no content of its own.',
      [
        'collections/visual-projects/services/visual-project-billing.service.ts',
        'services/integrations/replicate/services/replicate.service.ts',
        'services/integrations/xai/services/xai.service.ts',
        'services/harness/media-prompt-enhancement.service.ts',
        'services/prompt-enhancement/prompt-enhancement.service.ts',
      ],
    ),
    ...entries(
      'not-generative',
      'Reads a reference video or image into shot fields the person edits in the plan (#10578); it describes the reference and adds no brand copy of its own.',
      [
        'collections/content-runs/services/storyboard-reference-analysis.service.ts',
      ],
    ),
    ...entries(
      'needs-triage',
      'Rewrites or writes content and shows no brand-context call in this file.',
      [
        'collections/brands/services/brand-generation.service.ts',
        'collections/clipper-projects/services/highlight-rewrite.service.ts',
        'collections/content-runs/services/brand-remix-scene-analysis.service.ts',
        'collections/launch-copy/services/launch-copy-generator.service.ts',
        'collections/workflows/services/workflow-content-executor-registrar.service.ts',
        'collections/workflows/services/workflow-core-executor-registrar.service.ts',
        'collections/workflows/services/workflow-generation.service.ts',
        'collections/workflows/services/youtube-long-form-workflow.service.ts',
        'endpoints/ai-actions/ai-actions.service.ts',
        'services/ai-influencer/ai-influencer.service.ts',
        'services/content-engine/content-planner.service.ts',
      ],
    ),
    ...entries(
      'needs-triage',
      'Prompt enhancement endpoints for the prompt library; decide whether the brand applies.',
      [
        'collections/prompts/controllers/prompts.controller.ts',
        'collections/prompts/enhance-created-prompt.ts',
      ],
    ),
    ...entries(
      'needs-triage',
      'Agent chat; brand context arrives through agent context assembly, which this registry does not assert.',
      [
        'services/agent-orchestrator/agent-orchestrator-plan-mode.service.ts',
        'services/agent-orchestrator/agent-orchestrator-stream-loop.service.ts',
        'services/agent-orchestrator/agent-orchestrator-sync-loop.service.ts',
      ],
    ),
  ]);
