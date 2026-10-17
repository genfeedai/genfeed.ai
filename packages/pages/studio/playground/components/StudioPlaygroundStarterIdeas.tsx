'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundStarterIdeasProps } from '@genfeedai/props/studio/studio-playground.props';
import {
  buildStarterIdeaDocument,
  STUDIO_PLAYGROUND_STARTER_IDEAS,
  starterIdeaPromptTemplate,
  starterIdeaUsesSoftwareCopy,
  starterProductReferenceRole,
} from '@pages/studio/playground/utils/studio-playground-starter-ideas';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

function starterCopyKey(
  ideaId: string,
  part: 'lead' | 'tail',
  isSoftware: boolean,
  isTagged: boolean,
): string {
  if (part === 'tail') {
    return `${ideaId}.${isSoftware ? 'softwareCharacterTail' : 'characterTail'}`;
  }
  if (isTagged) {
    return `${ideaId}.${isSoftware ? 'softwareCharacterLead' : 'characterLead'}`;
  }
  return `${ideaId}.${isSoftware ? 'softwareLead' : 'lead'}`;
}

export default function StudioPlaygroundStarterIdeas({
  character,
  isDisabled = false,
  isDocked = false,
  offeringKind,
  onSelect,
  productReference,
}: StudioPlaygroundStarterIdeasProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground.starterIdeas');

  return (
    <section
      aria-label={translate('title')}
      className={
        isDocked
          ? 'mx-auto flex w-full max-w-4xl flex-col gap-2 pb-2'
          : 'mx-auto flex w-full max-w-4xl flex-col gap-4 py-8'
      }
      data-testid="studio-playground-starter-ideas"
    >
      {isDocked ? null : (
        <div className="flex flex-col gap-1 text-center">
          <h2 className="text-lg font-medium text-foreground">
            {translate('title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>
      )}
      <div
        className={
          isDocked
            ? 'flex gap-2 overflow-x-auto'
            : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {STUDIO_PLAYGROUND_STARTER_IDEAS.map((idea) => {
          const taggedCharacter =
            character !== undefined && idea.usesCharacter
              ? character
              : undefined;
          const usesSoftwareCopy = starterIdeaUsesSoftwareCopy(
            idea.id,
            offeringKind,
          );
          const lead = translate(
            starterCopyKey(
              idea.id,
              'lead',
              usesSoftwareCopy,
              taggedCharacter !== undefined,
            ),
          );
          const tail = taggedCharacter
            ? translate(starterCopyKey(idea.id, 'tail', usesSoftwareCopy, true))
            : undefined;
          const preview = taggedCharacter
            ? `${lead}${taggedCharacter.label}${tail ?? ''}`
            : lead;
          const productLabel = productReference
            ? (productReference.label ?? translate('productName'))
            : undefined;
          const attachedProduct =
            !usesSoftwareCopy &&
            idea.usesProductReference &&
            productReference &&
            productLabel
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
                  ...(idea.usesProductReference &&
                  !usesSoftwareCopy &&
                  !attachedProduct
                    ? {
                        openLibraryRole: starterProductReferenceRole(idea.type),
                      }
                    : {}),
                  ...(attachedProduct
                    ? { productReference: attachedProduct }
                    : {}),
                  promptTemplate: usesSoftwareCopy
                    ? taggedCharacter
                      ? idea.characterPromptTemplate
                      : undefined
                    : starterIdeaPromptTemplate(
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
              {isDocked ? null : (
                <span className="relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-muted/40">
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 14rem, (min-width: 640px) 50vw, 100vw"
                    src={idea.thumbnailUrl}
                  />
                </span>
              )}
              <span className="flex w-full flex-col items-start gap-1">
                <span className="break-words text-left text-sm font-medium leading-snug text-foreground/88">
                  {translate(`${idea.id}.label`)}
                </span>
                <span className="break-words text-left text-2xs leading-snug text-foreground/48">
                  {translate(`${idea.id}.detail`)}
                  {taggedCharacter
                    ? ` · ${translate('tagsCharacter', { name: taggedCharacter.label })}`
                    : ''}
                  {idea.usesProductReference && !usesSoftwareCopy
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
