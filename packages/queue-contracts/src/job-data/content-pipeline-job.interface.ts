/**
 * Content pipeline queue contract.
 *
 * The API owns the concrete pipeline configuration while this shared envelope
 * keeps queue producers, workers, and tests independent from the API app.
 */
export interface ContentPipelineJobData<TConfig = unknown> {
  config: TConfig;
  organizationId: string;
  personaId: string;
  type: 'generate-and-publish' | 'batch-generate';
}
