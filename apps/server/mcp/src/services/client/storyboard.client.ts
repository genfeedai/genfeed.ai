import { storyboardARollQuoteSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { storyboardRunSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { storyboardStillQuoteSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import {
  type StoryboardToolInput,
  storyboardToolSchemas,
} from '@mcp/tools/storyboard.schemas';
import type { AxiosResponse } from 'axios';

const LONG_FORM_PRESENTER_PATHS = {
  animatic: 'animatic',
  presenter: 'a-roll',
} as const;

export function storyboardRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}

export function parseStoryboardRun(
  base: BaseApiClient,
  response: AxiosResponse,
) {
  const resource = base.unwrapObject<Record<string, unknown>>(response);
  const attributes = storyboardRecord(resource.attributes);
  return storyboardRunSchema.parse({
    ...attributes,
    ...(typeof resource.id === 'string' ? { id: resource.id } : {}),
  });
}

type StoryboardScriptEdits = Extract<
  StoryboardToolInput<'storyboard_long_form'>,
  { action: 'edit_script' }
>;

/**
 * Applies narration and cutaway brief edits to the saved plan. A changed brief
 * drops the cutaway's footage, as in the Storyboard, since it no longer matches.
 */
export function editLongFormScript(
  plan: StoryboardPlan,
  edits: Pick<StoryboardScriptEdits, 'segments' | 'cutaways'>,
): StoryboardPlan {
  const longForm = plan.longForm;
  if (!longForm) throw new Error('This storyboard is not a long-form video.');
  const segmentEdits = new Map(
    (edits.segments ?? []).map((edit) => [edit.id, edit]),
  );
  const cutawayEdits = new Map(
    (edits.cutaways ?? []).map((edit) => [edit.id, edit]),
  );
  const segments = longForm.segments.map((segment) => {
    const segmentEdit = segmentEdits.get(segment.id);
    segmentEdits.delete(segment.id);
    return {
      ...segment,
      ...(segmentEdit?.narration === undefined
        ? {}
        : { narration: segmentEdit.narration }),
      ...(segmentEdit?.sectionLabel === undefined
        ? {}
        : { sectionLabel: segmentEdit.sectionLabel }),
      cutaways: segment.cutaways.map((cutaway) => {
        const cutawayEdit = cutawayEdits.get(cutaway.id);
        cutawayEdits.delete(cutaway.id);
        if (
          cutawayEdit?.brief === undefined ||
          cutawayEdit.brief === cutaway.brief
        )
          return cutaway;
        const { assetId: _assetId, ...rest } = cutaway;
        return { ...rest, brief: cutawayEdit.brief };
      }),
    };
  });
  const unknown = [...segmentEdits.keys(), ...cutawayEdits.keys()];
  if (unknown.length > 0)
    throw new Error(`Unknown segment or cutaway ids: ${unknown.join(', ')}`);
  return { ...plan, longForm: { ...longForm, segments } };
}

/** Long-form storyboard steps: plan, quote, render, reconcile and assemble. */
export class StoryboardClient {
  constructor(private readonly base: BaseApiClient) {}

  /** Reads, edits, quotes and assembles a long-form storyboard (#8225). */
  storyboardLongForm(input: StoryboardToolInput<'storyboard_long_form'>) {
    const parsed = storyboardToolSchemas.storyboard_long_form.parse(input);
    const runsPath = `/brands/${encodeURIComponent(parsed.brandId)}/storyboard-runs`;
    const runPath =
      parsed.action === 'create'
        ? runsPath
        : `${runsPath}/${encodeURIComponent(parsed.runId)}`;
    return this.base.request(
      'working on a long-form storyboard',
      async (http) => {
        switch (parsed.action) {
          case 'create':
            return parseStoryboardRun(
              this.base,
              await http.post(runsPath, {
                clientRequestId: parsed.clientRequestId,
                source: {
                  kind: 'brief',
                  brief: parsed.brief,
                  length: 'long_form',
                },
              }),
            );
          case 'get':
            return parseStoryboardRun(this.base, await http.get(runPath));
          case 'draft_plan':
            return parseStoryboardRun(
              this.base,
              await http.post(`${runPath}/plan/draft`, {
                expectedRevision: parsed.expectedRevision,
                ...(parsed.instruction === undefined
                  ? {}
                  : { instruction: parsed.instruction }),
              }),
            );
          case 'edit_script': {
            const current = parseStoryboardRun(
              this.base,
              await http.get(runPath),
            );
            return parseStoryboardRun(
              this.base,
              await http.patch(`${runPath}/plan`, {
                expectedRevision: parsed.expectedRevision,
                plan: editLongFormScript(current.config.plan, parsed),
              }),
            );
          }
          case 'approve_plan':
            return parseStoryboardRun(
              this.base,
              await http.post(`${runPath}/plan/approve`, {
                expectedRevision: parsed.expectedRevision,
              }),
            );
          case 'quote': {
            if (parsed.stage === 'cutaways') {
              const response = await http.post(`${runPath}/stills/quote`, {
                expectedRevision: parsed.expectedRevision,
                ...(parsed.cutawayIds ? { cutawayIds: parsed.cutawayIds } : {}),
              });
              return storyboardStillQuoteSchema.parse(response.data);
            }
            const response = await http.post(
              `${runPath}/${LONG_FORM_PRESENTER_PATHS[parsed.stage]}/quote`,
              { expectedRevision: parsed.expectedRevision },
            );
            return storyboardARollQuoteSchema.parse(response.data);
          }
          case 'reconcile':
            // Presenter and animatic renders, then the cutaway stills.
            await http.post(`${runPath}/a-roll/reconcile`, {});
            return parseStoryboardRun(
              this.base,
              await http.post(`${runPath}/stills/reconcile`, {}),
            );
          case 'assemble': {
            const response = await http.post(
              `${runPath}/${parsed.track === 'final' ? 'long-form' : 'animatic'}/assemble`,
              {},
            );
            return storyboardRecord(response.data);
          }
        }
      },
      this.base.failWithDetail('Failed to update the long-form storyboard'),
    );
  }

  /** Starts a quoted paid step; the API refuses it if the inputs changed. */
  renderStoryboardLongForm(
    input: StoryboardToolInput<'start_storyboard_long_form'>,
  ) {
    const { brandId, cutawayIds, expectedRevision, inputHash, runId, stage } =
      storyboardToolSchemas.start_storyboard_long_form.parse(input);
    const runPath = `/brands/${encodeURIComponent(brandId)}/storyboard-runs/${encodeURIComponent(runId)}`;
    return this.base.request(
      'rendering a long-form storyboard',
      async (http) =>
        parseStoryboardRun(
          this.base,
          stage === 'cutaways'
            ? await http.post(`${runPath}/stills`, {
                cutawayIds,
                expectedRevision,
                inputHash,
              })
            : await http.post(
                `${runPath}/${LONG_FORM_PRESENTER_PATHS[stage]}`,
                {
                  expectedRevision,
                  inputHash,
                },
              ),
        ),
      this.base.failWithDetail('Failed to render the long-form storyboard'),
    );
  }
}
