'use client';

import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import {
  Film,
  Image,
  type LucideIcon,
  Mic,
  Music,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createElement, type ReactElement, useMemo } from 'react';
import { useStudioPlaygroundProposals } from '@/features/studio/playground/hooks/useStudioPlaygroundProposals';
import {
  buildStarterIdeaDocument,
  STUDIO_PLAYGROUND_STARTER_IDEAS,
  starterIdeaPromptTemplate,
  starterIdeaUsesSoftwareCopy,
  starterProductReferenceRole,
} from '@/features/studio/playground/utils/studio-playground-starter-ideas';
import type {
  StudioPlaygroundEmptyStateProps,
  StudioPlaygroundStarterIdea,
  StudioPlaygroundStarterSelection,
} from '@/features/studio/props/studio-playground.props';

const CARD_COUNT = 3;
const ICON_CLASS = 'size-5 text-foreground/50';

const TYPE_ICONS: Record<StudioPlaygroundStarterIdea['type'], LucideIcon> = {
  avatar: UserRound,
  image: Image,
  'image-edit': Image,
  music: Music,
  video: Film,
  voice: Mic,
};

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

/** Ideas for the generation type being worked on come first. */
function orderStarterIdeas(
  type: StudioPlaygroundEmptyStateProps['type'],
): readonly StudioPlaygroundStarterIdea[] {
  const group = type === 'image-edit' ? 'image' : type;
  const matches = (idea: StudioPlaygroundStarterIdea) => idea.type === group;
  return [
    ...STUDIO_PLAYGROUND_STARTER_IDEAS.filter(matches),
    ...STUDIO_PLAYGROUND_STARTER_IDEAS.filter((idea) => !matches(idea)),
  ];
}

interface EmptyStateCard {
  item: PromptBarSuggestionItem;
  /** Built on click so a repeated pick always gets a fresh seed id. */
  select: () => StudioPlaygroundStarterSelection;
}

/**
 * The Playground's empty state, in the same shape as the agent's new
 * conversation: a centered title and subtitle, three suggested prompt cards,
 * and the prompt bar below. The agent's own drafts for the brand (#7341) lead
 * when it has any; the starter ideas fill the rest and are the fallback.
 * A click fills the prompt and setup, never generates.
 */
export default function StudioPlaygroundEmptyState({
  brandId,
  character,
  isDisabled = false,
  offeringKind,
  onSelect,
  productReference,
  type,
}: StudioPlaygroundEmptyStateProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const { isBrandApproved, isLoading, proposals } =
    useStudioPlaygroundProposals(brandId, type);

  const cards = useMemo<EmptyStateCard[]>(() => {
    const proposalCards = proposals.map(
      (proposal, index): EmptyStateCard => ({
        item: {
          description: proposal.why,
          icon: createElement(Sparkles, { className: ICON_CLASS }),
          id: `proposal:${index}`,
          label: proposal.title,
          prompt: proposal.prompt,
        },
        select: () => ({
          agentPrompt: proposal.prompt,
          aspectRatio: proposal.aspectRatio,
          content: buildStarterIdeaDocument(
            proposal.prompt,
            undefined,
            undefined,
          ),
          seedId: `proposal:${index}:${Date.now()}`,
          type,
        }),
      }),
    );

    const starterCards = orderStarterIdeas(type).map((idea): EmptyStateCard => {
      const taggedCharacter =
        character !== undefined && idea.usesCharacter ? character : undefined;
      const usesSoftwareCopy = starterIdeaUsesSoftwareCopy(
        idea.id,
        offeringKind,
      );
      const copy = (part: 'lead' | 'tail', isTagged: boolean) =>
        translate(
          `starterIdeas.${starterCopyKey(idea.id, part, usesSoftwareCopy, isTagged)}`,
        );
      const lead = copy('lead', taggedCharacter !== undefined);
      const tail = taggedCharacter ? copy('tail', true) : undefined;
      const preview = taggedCharacter
        ? `${lead}${taggedCharacter.label}${tail ?? ''}`
        : lead;
      const productLabel = productReference
        ? (productReference.label ?? translate('starterIdeas.productName'))
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
      const detail = [
        translate(`starterIdeas.${idea.id}.detail`),
        taggedCharacter
          ? translate('starterIdeas.tagsCharacter', {
              name: taggedCharacter.label,
            })
          : null,
        idea.usesProductReference && !usesSoftwareCopy
          ? productLabel
            ? translate('starterIdeas.usesProduct', { name: productLabel })
            : translate('starterIdeas.needsProduct')
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        item: {
          description: detail,
          icon: createElement(TYPE_ICONS[idea.type], {
            className: ICON_CLASS,
          }),
          id: idea.id,
          label: translate(`starterIdeas.${idea.id}.label`),
          prompt: preview,
        },
        select: () => ({
          aspectRatio: idea.aspectRatio,
          content: buildStarterIdeaDocument(lead, tail, taggedCharacter),
          instrumental: idea.instrumental,
          ...(idea.usesProductReference && !usesSoftwareCopy && !attachedProduct
            ? { openLibraryRole: starterProductReferenceRole(idea.type) }
            : {}),
          ...(attachedProduct ? { productReference: attachedProduct } : {}),
          promptTemplate: usesSoftwareCopy
            ? taggedCharacter
              ? idea.characterPromptTemplate
              : undefined
            : starterIdeaPromptTemplate(idea, taggedCharacter !== undefined),
          seedId: `${idea.id}:${taggedCharacter?.id ?? 'plain'}:${attachedProduct?.id ?? 'no-product'}:${Date.now()}`,
          type: idea.type,
        }),
      };
    });

    return [...proposalCards, ...starterCards].slice(0, CARD_COUNT);
  }, [character, offeringKind, productReference, proposals, translate, type]);

  return (
    <PromptEmptyState
      description={translate('start.description')}
      isInFlow
      isWide
      title={translate('start.title')}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="@container w-full min-w-0">
          <PromptBarSuggestions
            className="grid grid-cols-1 sm:grid-cols-1 @lg:grid-cols-3 [&>button]:w-full [&>button]:max-w-none"
            isDisabled={isDisabled}
            onSuggestionSelect={(suggestion) => {
              const card = cards.find(
                (candidate) => candidate.item.id === suggestion.id,
              );
              if (card) onSelect(card.select());
            }}
            suggestions={cards.map((card) => card.item)}
            variant="cards"
          />
        </div>
        {isLoading ? (
          <p
            aria-live="polite"
            className="text-center text-xs text-muted-foreground"
            role="status"
          >
            {translate('agentProposals.loading')}
          </p>
        ) : null}
        {!isBrandApproved ? (
          <p
            className="text-center text-xs text-muted-foreground"
            data-testid="studio-playground-agent-proposals-approval"
          >
            {translate('agentProposals.needsBrandApproval')}
          </p>
        ) : null}
      </div>
    </PromptEmptyState>
  );
}
