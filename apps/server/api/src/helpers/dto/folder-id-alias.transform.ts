import type { QueryAliasResolver } from '@api/helpers/pipes/validation.pipe';

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
 * This hook runs from the pipe AFTER `plainToInstance` (which skips
 * `@Transform` for source-absent keys under `exposeDefaultValues: true`) and
 * BEFORE validation, so an explicit `folderId` still wins and nothing else
 * about the alias survives onto the instance.
 */
export const resolveFolderIdAlias: QueryAliasResolver = (
  source,
  instance,
): void => {
  const target = instance as { folderId?: string | null };
  if (target.folderId !== undefined && target.folderId !== null) {
    return;
  }

  const alias = source.folder;
  if (typeof alias === 'string' && alias !== '') {
    target.folderId = alias;
  }
};
