import fs from 'node:fs';
import path from 'node:path';
import {
  FONT_FAMILY_METADATA,
  FontFamily,
  resolveFontFamily,
} from '@genfeedai/contracts';

/**
 * Where the shipped static TTFs live. The service cwd differs per image: the
 * package dir under `bun --filter`, the repo root for `docker/Dockerfile`.
 */
function fontDirectories(): string[] {
  return [
    path.resolve('public', 'assets', 'fonts'),
    path.resolve('apps', 'server', 'files', 'public', 'assets', 'fonts'),
    path.resolve(__dirname, '..', 'public', 'assets', 'fonts'),
  ];
}

/**
 * Absolute path of the TTF for a font key (`poppins-bold`) or persisted label
 * (`POPPINS_BOLD`). Callers pass client-supplied values straight through, so
 * anything that is not a shipped font resolves to the default instead of
 * becoming a path segment or a missing file that fails the whole render.
 */
export function resolveFontFile(
  fontFamily: string | null | undefined,
  fallback: FontFamily = FontFamily.MONTSERRAT_BLACK,
): string {
  const font = resolveFontFamily(fontFamily) ?? fallback;
  const fileName = `${FONT_FAMILY_METADATA[font].key}.ttf`;
  const directories = fontDirectories();
  const directory =
    directories.find((candidate) =>
      fs.existsSync(path.join(candidate, fileName)),
    ) ?? directories[0];
  return path.join(directory, fileName);
}
