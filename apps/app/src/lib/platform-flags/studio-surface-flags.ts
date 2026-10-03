import {
  APP_ROUTES,
  type PlatformStudioFlagKey,
} from '@genfeedai/contracts/constants';

/** Studio routes with their own Admin flag; Generate follows `studio` itself. */
const STUDIO_SURFACE_FLAGS: ReadonlyArray<
  readonly [route: string, flagKey: PlatformStudioFlagKey]
> = [
  [APP_ROUTES.STUDIO.MOTION, 'studio_motion'],
  [APP_ROUTES.STUDIO.STORYBOARD, 'studio_storyboard'],
  [APP_ROUTES.STUDIO.CLIPS, 'studio_clips'],
  [APP_ROUTES.STUDIO.BATCH, 'studio_batch'],
  [APP_ROUTES.STUDIO.EDITOR, 'studio_editor'],
];

/**
 * The Studio surface flag of a brand- or org-scoped path such as
 * `/acme/brand/studio/motion` or `/acme/~/studio/editor/new`.
 */
export function getStudioSurfaceFlagKey(
  path?: string | null,
): PlatformStudioFlagKey | undefined {
  const pathname = path?.split(/[?#]/)[0];
  if (!pathname) {
    return undefined;
  }

  return STUDIO_SURFACE_FLAGS.find(
    ([route]) => pathname.endsWith(route) || pathname.includes(`${route}/`),
  )?.[1];
}

/**
 * Whether the Studio surface behind `path` is on. Only an explicit `false`
 * hides it, so a flag the API does not know yet keeps the surface visible.
 */
export function isStudioSurfaceEnabled(
  path: string | null | undefined,
  flags: Readonly<Record<string, unknown>>,
): boolean {
  const flagKey = getStudioSurfaceFlagKey(path);
  return flagKey === undefined || flags[flagKey] !== false;
}
