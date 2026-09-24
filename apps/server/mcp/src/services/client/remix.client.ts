import { quoteBrandRemixGenerationSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-generation.contract';
import { quoteBrandRemixScenesSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import type { RemixToolInput } from '@mcp/tools/remix.schemas';

/** Canonical remix routes; authorization, revision checks and billing remain API-owned. */
export class RemixClient {
  constructor(private readonly base: BaseApiClient) {}

  importSourcePost({ brandId, url }: RemixToolInput<'import_source_post'>) {
    return this.send(
      'post',
      `/social-sources/import-post?brandId=${encodeURIComponent(brandId)}`,
      { url },
    );
  }

  createRemixConcept({
    brandId,
    sourcePostId,
  }: RemixToolInput<'create_remix_concept'>) {
    return this.send(
      'post',
      `/brands/${encodeURIComponent(brandId)}/content-runs/remixes`,
      { source: { kind: 'source_post', sourcePostId } },
    );
  }

  getRemixRun({ runId }: RemixToolInput<'get_remix_run'>) {
    return this.send('get', this.path(runId));
  }

  updateRemixConcept({
    runId,
    ...body
  }: RemixToolInput<'update_remix_concept'>) {
    return this.send('patch', this.path(runId), body);
  }

  attachRemixAnalysisSource({
    runId,
    ...body
  }: RemixToolInput<'attach_remix_analysis_source'>) {
    return this.send('patch', `${this.path(runId)}/scenes/source`, body);
  }

  async quoteRemixGeneration({
    runId,
    ...body
  }: RemixToolInput<'quote_remix_generation'>) {
    const run = await this.getRemixRun({ runId });
    const family = this.family(run);
    if (family === 'generation') {
      if (
        body.operation !== 'generate' ||
        body.sceneId !== undefined ||
        body.repairStage !== undefined
      ) {
        throw new Error(
          'Image and copy remixes only support generation quotes.',
        );
      }
      return this.send(
        'post',
        `${this.path(runId)}/generation/quote`,
        quoteBrandRemixGenerationSchema.parse({
          expectedRevision: body.expectedRevision,
          ...(body.model === undefined ? {} : { model: body.model }),
        }),
      );
    }
    if (body.model !== undefined)
      throw new Error(
        'Scene quotes select their canonical models; model is not accepted.',
      );
    return this.send(
      'post',
      `${this.path(runId)}/scenes/quote`,
      quoteBrandRemixScenesSchema.parse({
        expectedRevision: body.expectedRevision,
        operation: body.operation,
        ...(body.sceneId === undefined ? {} : { sceneId: body.sceneId }),
        ...(body.repairStage === undefined
          ? {}
          : { repairStage: body.repairStage }),
      }),
    );
  }

  async startRemixGeneration({
    runId,
    ...body
  }: RemixToolInput<'start_remix_generation'>) {
    const run = await this.getRemixRun({ runId });
    const family = this.family(run);
    const quote =
      family === 'generation'
        ? run.generationQuote
        : record(run.scenePipeline).quote;
    if (record(quote).id !== body.quoteId)
      throw new Error(
        'The quote does not match the current remix. Request a fresh quote.',
      );
    return this.send('post', `${this.path(runId)}/${family}/execute`, body);
  }

  async controlRemixGeneration({
    runId,
    action,
    expectedRevision,
  }: RemixToolInput<'control_remix_generation'>) {
    const run = await this.getRemixRun({ runId });
    if (this.family(run) !== 'scenes' || !run.scenePipeline)
      throw new Error(
        'Cancellation and resume require an existing scene pipeline.',
      );
    return this.send('post', `${this.path(runId)}/scenes/${action}`, {
      expectedRevision,
    });
  }

  private family(run: Record<string, unknown>): 'generation' | 'scenes' {
    const kind = record(record(run.draft).output).kind;
    if (kind === 'copy' || kind === 'image') return 'generation';
    if (kind === 'video' || kind === 'avatar') return 'scenes';
    throw new Error('Unsupported canonical remix output.');
  }

  private path(runId: string) {
    return `/content-runs/${encodeURIComponent(runId)}/remix`;
  }

  private send(
    method: 'get' | 'patch' | 'post',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'accessing remix',
      async (http) => {
        const response =
          method === 'get'
            ? await http.get(path)
            : await http[method](path, body);
        const resource =
          this.base.unwrapObject<Record<string, unknown>>(response);
        if (
          resource.attributes &&
          typeof resource.attributes === 'object' &&
          !Array.isArray(resource.attributes)
        ) {
          return {
            ...record(resource.attributes),
            ...(resource.id === undefined ? {} : { id: resource.id }),
          };
        }
        return resource;
      },
      this.base.failWithDetail('Failed to access remix'),
    );
  }
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
