'use client';

import type { ArtifactEditorShellProps } from '@props/content/artifact-editor.props';
import Badge from '@ui/display/badge/Badge';
import ArtifactEditorBackLink from './artifact-editor-back-link';

/**
 * Chrome shared by every dedicated artifact editor page. Owns the back link to
 * the list the artifact was opened from, the artifact identity, and the action
 * rail — so each editor body only renders the fields it actually edits.
 */
export default function ArtifactEditorShell({
  actions,
  artifactLabel,
  backHref,
  backLabel,
  badges,
  children,
  description,
  isDirty = false,
  title,
}: ArtifactEditorShellProps) {
  return (
    <div className="flex flex-col">
      <div className="border-white/[0.08] border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ArtifactEditorBackLink backHref={backHref} backLabel={backLabel} />

            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="gen-label rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-foreground/55">
              {artifactLabel}
            </span>
            {badges}
            {/* variant, not status — a status badge would relabel itself. */}
            {isDirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
          </div>

          <div>
            <h1 className="font-semibold text-foreground text-xl">{title}</h1>
            {description ? (
              <p className="mt-1 text-muted-foreground text-sm">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 py-6">{children}</div>
    </div>
  );
}
