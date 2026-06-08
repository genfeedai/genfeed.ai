'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { buildStudioAgentHref } from '@utils/url/desktop-loop-url.util';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

type StudioEditDetailHeaderProps = {
  categoryLabel: string;
  selectedIngredient: IIngredient | null;
  backHref: string;
};

export default function StudioEditDetailHeader({
  categoryLabel,
  selectedIngredient,
  backHref,
}: StudioEditDetailHeaderProps) {
  return (
    <div className="border-b border-white/[0.08] bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
            <Link href={backHref}>
              <HiArrowLeft className="size-4" />
              Back to Generate
            </Link>
          </Button>

          <h1 className="text-xl font-semibold">Edit {categoryLabel}</h1>
        </div>
        {selectedIngredient ? (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link
              href={buildStudioAgentHref(
                selectedIngredient.metadataLabel || 'Untitled asset',
                selectedIngredient.promptText,
              )}
            >
              Ask Agent
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
