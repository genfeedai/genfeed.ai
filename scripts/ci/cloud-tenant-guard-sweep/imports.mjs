import { pathToFileURL } from 'node:url';

export function createWorkspaceImporter({
  mode,
  resolveSpecifier,
  parentURL,
  nativeImport = (specifier) => import(specifier),
  loadScopedImporter = () => import('tsx/esm/api'),
}) {
  if (!['ci', 'local'].includes(mode))
    throw new Error('Validated CLOUD import mode required');
  let scopedImporter;
  return async (specifier) => {
    const url = pathToFileURL(resolveSpecifier(specifier)).href;
    if (mode === 'ci') return nativeImport(url);
    scopedImporter ??= loadScopedImporter();
    const { tsImport } = await scopedImporter;
    return tsImport(url, { parentURL, tsconfig: false });
  };
}
