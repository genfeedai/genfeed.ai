/**
 * Codicon ids used outside of `package.json` contributions.
 *
 * Only built-in codicon ids render. VS Code draws an unregistered `$(id)` as
 * empty space instead of failing, so an invented brand id disappears silently —
 * a custom id needs a `contributes.icons` entry backed by an icon font shipped
 * inside the VSIX. Ids are verified in `codicons.test.ts`.
 */
export const STATUS_BAR_ICON = '$(broadcast)';
