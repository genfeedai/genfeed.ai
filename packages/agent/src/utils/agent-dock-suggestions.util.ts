import type { ConversationComposerShellContextValue } from '@genfeedai/agent/components/ConversationComposerShellContext';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { filterActionsByRole } from '@genfeedai/agent/utils/filter-actions-by-role';
import { MemberRole } from '@genfeedai/contracts';
import { PostCard } from '@ui/primitives/animated-icons/custom-lucide';
import {
  ClipboardCheck,
  FolderOpen,
  LayoutGrid,
  MessageSquareText,
  Search,
} from 'lucide-react';
import { createElement } from 'react';

const ICON_CLASS = 'size-4 text-muted-foreground';
const CREATOR_ROLES = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR];

export function createLibraryDockSuggestions(): SuggestedAction[] {
  return [
    {
      id: 'library-search',
      icon: createElement(Search, { className: ICON_CLASS }),
      label: 'Find an asset',
      description: 'Search your library',
      prompt: 'Help me find an asset in this library for my next post.',
    },
    {
      id: 'library-organize',
      visibleTo: CREATOR_ROLES,
      icon: createElement(FolderOpen, { className: ICON_CLASS }),
      label: 'Organize library',
      description: 'Group related assets',
      prompt:
        'Review this library and suggest how to group related assets. Show me the proposed changes before applying them.',
    },
    {
      id: 'library-post',
      visibleTo: CREATOR_ROLES,
      icon: createElement(PostCard, { className: ICON_CLASS }),
      label: 'Draft a post',
      description: 'Start from your library',
      prompt:
        'Help me draft a post using a suitable asset from this library and the brand voice.',
    },
    {
      id: 'library-review',
      icon: createElement(ClipboardCheck, { className: ICON_CLASS }),
      label: 'Review recent assets',
      description: 'Choose what to use next',
      prompt:
        'Review recent assets in this library and recommend what to use next.',
    },
  ];
}

export function resolveAgentDockSuggestions(
  references: ConversationComposerShellContextValue['artifactReferences'],
  pageActions: readonly SuggestedAction[],
  role?: MemberRole,
): SuggestedAction[] {
  const records = new Map(
    (references ?? []).map((item) => {
      const reference = 'reference' in item ? item.reference : item;
      return [`${reference.kind}:${reference.recordId}`, reference];
    }),
  );
  if (records.size === 0)
    return filterActionsByRole([...pageActions], role).slice(0, 4);

  const isMultiple = records.size > 1;
  const hasOnlyMedia = [...records.values()].every(
    (reference) =>
      reference.kind === 'asset' || reference.kind === 'ingredient',
  );
  const subject = isMultiple ? 'the selected content' : 'the selected item';
  return filterActionsByRole(
    [
      {
        id: 'selection-post',
        visibleTo: CREATOR_ROLES,
        icon: createElement(PostCard, { className: ICON_CLASS }),
        label: isMultiple ? 'Draft posts' : 'Draft a post',
        description: isMultiple
          ? 'Use your selected records'
          : 'Start from your selection',
        prompt: `Draft ${isMultiple ? 'posts' : 'a post'} using ${subject} and the brand voice.`,
      },
      {
        id: 'selection-review',
        icon: createElement(ClipboardCheck, { className: ICON_CLASS }),
        label: 'Review selection',
        description: 'Get a second opinion',
        prompt: `Review ${subject} and recommend concrete improvements.`,
      },
      hasOnlyMedia && !isMultiple
        ? {
            id: 'selection-caption',
            visibleTo: CREATOR_ROLES,
            icon: createElement(MessageSquareText, { className: ICON_CLASS }),
            label: 'Write a caption',
            description: 'For your selected asset',
            prompt:
              'Write a caption for the selected asset using its content and the brand voice.',
          }
        : {
            id: 'selection-variations',
            visibleTo: CREATOR_ROLES,
            icon: createElement(LayoutGrid, { className: ICON_CLASS }),
            label: 'Create variations',
            description: 'Explore another direction',
            prompt: `Suggest variations of ${subject} that preserve the brand voice.`,
          },
      {
        id: 'selection-organize',
        visibleTo: CREATOR_ROLES,
        icon: createElement(FolderOpen, { className: ICON_CLASS }),
        label: 'Organize selection',
        description: 'Group related content',
        prompt: `Suggest how to organize ${subject}. Show me the proposed changes before applying them.`,
      },
    ],
    role,
  );
}
