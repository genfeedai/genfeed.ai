import type { TransformFnParams } from 'class-transformer';

/**
 * Accept the client's `folder` query key on a DTO that declares `folderId`.
 *
 * Every Library list surface sends `?folder=<id>` (see
 * `use-ingredients-loading.ts`), while the query DTOs declare the canonical
 * scalar FK name `folderId`. The global ValidationPipe validates with
 * `{ whitelist: true }`, so an undeclared `folder` key is deleted before the
 * controller ever sees it — the folder axis silently widened to "all folders"
 * instead of failing loudly.
 *
 * The transform runs on the plain source object during `plainToInstance`, so it
 * reads `folder` before whitelisting removes it. An explicit `folderId` still
 * wins; nothing else about the alias survives onto the instance.
 */
export function resolveFolderIdAlias({
  obj,
  value,
}: TransformFnParams): unknown {
  if (value !== undefined && value !== null && value !== '') {
    return value;
  }

  const alias = (obj as Record<string, unknown> | undefined)?.folder;

  return typeof alias === 'string' && alias !== '' ? alias : value;
}
