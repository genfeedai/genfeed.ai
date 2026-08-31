'use client';

import type { ArtifactEditorShellProps } from '@props/content/artifact-editor.props';
import Badge from '@ui/display/badge/Badge';

/**
 * Chrome shared by every dedicated artifact editor page. Workspace breadcrumbs
 * own navigation; this shell owns artifact identity and the action rail so each
 * editor body only renders the fields it actually edits.
 *
 * Compact layout: one header strip with identity + title on the left and
 * actions on the right. No tall multi-row sub-topbar.
 */
export default function ArtifactEditorShell({
  actions,
  artifactLabel,
  badges,
  children,
  description,
  isDirty = false,
  title,
}: ArtifactEditorShellProps) {
  return (
    <div className="flex flex-col">
      <div className="border-border border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-6 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="gen-label rounded-full border border-border bg-foreground/[0.04] px-2 py-0.5 text-2xs text-foreground/55">
                {artifactLabel}
              </span>
              {badges}
              {/* variant, not status — a status badge would relabel itself. */}
              {isDirty ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : null}
            </div>

            <div className="min-w-0">
              <h1 className="truncate font-semibold text-foreground text-lg leading-tight">
                {title}
              </h1>
              {description ? (
                <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">
              {actions}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 py-6">{children}</div>
    </div>
  );
}
