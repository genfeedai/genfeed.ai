import type { ContainerProps } from './ui.props';

/**
 * Type-level regression test for the `moduleChrome={false}` guard on
 * `ContainerProps`: it must be a compile error to pair `moduleChrome: false`
 * with `headerTabs` or `tabs`, because neither renders once `Container` is
 * forced into the classic layout — see the `moduleChrome` doc comment on
 * `ui.props.ts`.
 *
 * This file asserts nothing at runtime. Its name deliberately does not end
 * in `.test.ts`/`.test.tsx` so `vitest` never picks it up as a suite —
 * `tsc --noEmit` (via `bun run type-check`) is the only thing that runs it.
 * `@ts-expect-error` itself becomes an error when the statement below it
 * type-checks cleanly, so weakening or removing the guard turns this file
 * red.
 */

// @ts-expect-error `moduleChrome: false` must forbid `headerTabs`.
const _forbidsHeaderTabsWithModuleChromeFalse: ContainerProps = {
  children: null,
  headerTabs: { fullWidth: false, tabs: [] },
  moduleChrome: false,
};

// @ts-expect-error `moduleChrome: false` must forbid `tabs`.
const _forbidsTabsWithModuleChromeFalse: ContainerProps = {
  children: null,
  moduleChrome: false,
  tabs: [{ id: 'x', label: 'X' }],
};

// Sanity checks for the allowed shapes — these must NOT error, or the guard
// has become too strict for the common case (most pages never set
// `moduleChrome` at all).
const _allowsHeaderTabsWithModuleChromeTrue: ContainerProps = {
  children: null,
  headerTabs: { fullWidth: false, tabs: [] },
  moduleChrome: true,
};

const _allowsHeaderTabsWhenUnset: ContainerProps = {
  children: null,
  headerTabs: { fullWidth: false, tabs: [] },
};

const _allowsModuleChromeFalseAlone: ContainerProps = {
  children: null,
  moduleChrome: false,
};

void _forbidsHeaderTabsWithModuleChromeFalse;
void _forbidsTabsWithModuleChromeFalse;
void _allowsHeaderTabsWithModuleChromeTrue;
void _allowsHeaderTabsWhenUnset;
void _allowsModuleChromeFalseAlone;
