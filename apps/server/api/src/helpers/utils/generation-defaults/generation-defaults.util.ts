interface ResolveGenerationDefaultModelParams<TModel extends string> {
  explicit?: TModel | null;
  brandDefault?: TModel | null;
  organizationDefault?: TModel | null;
  systemDefault: TModel;
}

export function resolveGenerationDefaultModel<TModel extends string>({
  explicit,
  brandDefault,
  organizationDefault,
  systemDefault,
}: ResolveGenerationDefaultModelParams<TModel>): TModel {
  return explicit || brandDefault || organizationDefault || systemDefault;
}

export function isImageToVideoRequest(params: {
  endFrame?: string | null;
  references?: Array<string | null | undefined> | null;
}): boolean {
  return Boolean(params.endFrame) || Boolean(params.references?.length);
}
