'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundStarterIdeasProps } from '@genfeedai/props/studio/studio-playground.props';
import {
  buildStarterIdeaDocument,
  STUDIO_PLAYGROUND_STARTER_IDEAS,
  starterIdeaPromptTemplate,
  starterProductReferenceRole,
} from '@pages/studio/playground/utils/studio-playground-starter-ideas';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

export default function StudioPlaygroundStarterIdeas({
  character,
  isDisabled = false,
  onSelect,
  productReference,
}: StudioPlaygroundStarterIdeasProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground.starterIdeas');

  return (
    <section
      aria-label={translate('title')}
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8"
      data-testid="studio-playground-starter-ideas"
    >
      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-lg font-medium text-foreground">
          {translate('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_PLAYGROUND_STARTER_IDEAS.map((idea) => {
          const taggedCharacter =
            character !== undefined && idea.usesCharacter
              ? character
              : undefined;
          const lead = translate(
            taggedCharacter ? `${idea.id}.characterLead` : `${idea.id}.lead`,
          );
          const tail = taggedCharacter
            ? translate(`${idea.id}.characterTail`)
            : undefined;
          const preview = taggedCharacter
            ? `${lead}${taggedCharacter.label}${tail ?? ''}`
            : lead;
          const productLabel = productReference
            ? (productReference.label ?? translate('productName'))
            : undefined;
          const attachedProduct =
            idea.usesProductReference && productReference && productLabel
              ? {
                  id: productReference.id,
                  label: productLabel,
                  previewUrl: productReference.previewUrl,
                  role: starterProductReferenceRole(idea.type),
                }
              : undefined;

          return (
            <Button
              ariaLabel={translate('apply', {
                label: translate(`${idea.id}.label`),
              })}
              className={[
                'flex h-auto min-h-[5.5rem] w-full flex-col items-start gap-2.5',
                'rounded-2xl border border-border bg-background px-3.5 py-3.5',
                'text-left normal-case tracking-normal text-foreground/88',
                'shadow-md shadow-black/25 transition-colors',
                'hover:border-border/80 hover:bg-background-secondary',
              ].join(' ')}
              isDisabled={isDisabled}
              key={idea.id}
              onClick={() => {
                onSelect({
                  aspectRatio: idea.aspectRatio,
                  content: buildStarterIdeaDocument(
                    lead,
                    tail,
                    taggedCharacter,
                  ),
                  instrumental: idea.instrumental,
                  ...(idea.usesProductReference && !attachedProduct
                    ? {
                        openLibraryRole: starterProductReferenceRole(idea.type),
                      }
                    : {}),
                  ...(attachedProduct
                    ? { productReference: attachedProduct }
                    : {}),
                  promptTemplate: starterIdeaPromptTemplate(
                    idea,
                    taggedCharacter !== undefined,
                  ),
                  seedId: `${idea.id}:${taggedCharacter?.id ?? 'plain'}:${attachedProduct?.id ?? 'no-product'}:${Date.now()}`,
                  type: idea.type,
                });
              }}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <span className="flex w-full flex-col items-start gap-1">
                <span className="break-words text-left text-sm font-medium leading-snug text-foreground/88">
                  {translate(`${idea.id}.label`)}
                </span>
                <span className="break-words text-left text-2xs leading-snug text-foreground/48">
                  {translate(`${idea.id}.detail`)}
                  {taggedCharacter
                    ? ` · ${translate('tagsCharacter', { name: taggedCharacter.label })}`
                    : ''}
                  {idea.usesProductReference
                    ? ` · ${
                        productLabel
                          ? translate('usesProduct', { name: productLabel })
                          : translate('needsProduct')
                      }`
                    : ''}
                </span>
              </span>
              <span className="line-clamp-3 break-words text-left text-2xs leading-snug text-foreground/48">
                {preview}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
