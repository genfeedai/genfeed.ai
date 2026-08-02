'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ArtifactEditorBackLinkProps } from '@props/content/artifact-editor.props';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * Back navigation shared by every artifact editor page. Editors are opened from
 * a list, so returning to that list is part of the editor contract rather than
 * something each page invents.
 */
export default function ArtifactEditorBackLink({
  backHref,
  backLabel,
}: ArtifactEditorBackLinkProps) {
  return (
    <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
      <Link href={backHref}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
    </Button>
  );
}
