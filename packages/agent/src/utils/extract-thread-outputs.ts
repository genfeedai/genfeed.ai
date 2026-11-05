import type {
  AgentChatMessage,
  AgentIngredientItem,
  AgentUiAction,
  AgentUiActionCta,
} from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentContentFormat,
  AgentContentPreviewCardAction,
} from '@genfeedai/contracts/interfaces';

export type ThreadOutputKind = 'audio' | 'image' | 'text' | 'video';

export interface ThreadOutputVariant {
  brandId?: string | null;
  credentialId?: string;
  assetId?: string;
  ctas?: AgentUiActionCta[];
  id: string;
  kind: ThreadOutputKind;
  contentFormat?: AgentContentFormat;
  messageId: string;
  platform?: string;
  preheader?: string;
  subject?: string;
  textContent?: string;
  threadSegments?: string[];
  thumbnailUrl?: string;
  title?: string;
  url?: string;
}

export interface ThreadOutputGroup {
  ctas: AgentUiActionCta[];
  description?: string;
  id: string;
  messageId: string;
  sourceActionId?: string;
  sourceActionType?: AgentUiAction['type'];
  status?: string;
  title: string;
  variants: ThreadOutputVariant[];
}

function inferTypeFromUrl(url: string): ThreadOutputKind {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.endsWith('.mp3') || normalizedUrl.endsWith('.wav')) {
    return 'audio';
  }
  if (normalizedUrl.endsWith('.mp4') || normalizedUrl.endsWith('.mov')) {
    return 'video';
  }
  return 'image';
}

function inferIngredientType(
  ingredient: AgentIngredientItem,
): ThreadOutputKind {
  return ingredient.type === 'video' ? 'video' : 'image';
}

/** The written fields an output variant copies from its card. */
type TextOutputSource = Pick<
  AgentContentPreviewCardAction,
  | 'brandId'
  | 'contentFormat'
  | 'credentialId'
  | 'platform'
  | 'preheader'
  | 'subject'
  | 'textContent'
  | 'tweets'
>;

/** The cards that carry written output, and the fields they carry. */
function readTextOutputSource(action: AgentUiAction): TextOutputSource | null {
  switch (action.type) {
    case 'content_preview_card':
      return action;
    case 'brand_voice_profile_card':
      return { brandId: action.brandId, textContent: action.textContent };
    case 'ai_text_action_card':
    case 'publish_post_card':
      return { textContent: action.textContent };
    default:
      return null;
  }
}

function buildTextVariants(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputVariant[] {
  const source = readTextOutputSource(action);
  if (!source) {
    return [];
  }
  const variants: ThreadOutputVariant[] = [];
  const textFields = {
    brandId: source.brandId,
    contentFormat: source.contentFormat,
    credentialId: source.credentialId,
    ctas: action.ctas,
    messageId,
    platform: source.platform,
  };
  const threadSegments =
    source.contentFormat === 'thread'
      ? source.tweets?.map((text) => text.trim()).filter(Boolean)
      : undefined;

  if (threadSegments && threadSegments.length > 0) {
    variants.push({
      ...textFields,
      id: `${messageId}:${action.id}:thread`,
      kind: 'text',
      textContent: threadSegments[0],
      threadSegments,
      title: action.title,
    });

    return variants;
  }

  source.tweets?.forEach((text, index) => {
    if (!text.trim()) {
      return;
    }

    variants.push({
      ...textFields,
      id: `${messageId}:${action.id}:tweet:${index}`,
      kind: 'text',
      preheader: source.preheader,
      subject: source.subject,
      textContent: text,
      title: `Text ${index + 1}`,
    });
  });

  if (source.textContent?.trim()) {
    variants.push({
      ...textFields,
      id: `${messageId}:${action.id}:text-content`,
      kind: 'text',
      preheader: source.preheader,
      subject: source.subject,
      textContent: source.textContent,
      title: action.title,
    });
  }

  return variants;
}

function buildUrlVariants(
  action: AgentUiAction,
  messageId: string,
  kind: Exclude<ThreadOutputKind, 'text'>,
  urls: string[] | undefined,
  assetId?: string,
): ThreadOutputVariant[] {
  return (urls ?? []).flatMap((url, index) =>
    url
      ? [
          {
            assetId: urls?.length === 1 ? assetId : undefined,
            ctas: action.ctas,
            id: `${messageId}:${action.id}:${kind}:${index}`,
            kind,
            messageId,
            title: action.title,
            url,
          },
        ]
      : [],
  );
}

function buildMediaVariants(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputVariant[] {
  switch (action.type) {
    case 'content_preview_card':
      return [
        ...buildUrlVariants(
          action,
          messageId,
          'image',
          action.images,
          action.assetId,
        ),
        ...buildUrlVariants(action, messageId, 'video', action.videos),
        ...buildUrlVariants(action, messageId, 'audio', action.audio),
      ];
    case 'image_transform_card':
      return buildUrlVariants(action, messageId, 'image', action.images);
    case 'ingredient_picker_card':
      return action.ingredients.flatMap((ingredient, index) =>
        ingredient.url
          ? [
              {
                assetId: ingredient.id,
                ctas: action.ctas,
                id: `${messageId}:${action.id}:ingredient:${index}`,
                kind: inferIngredientType(ingredient),
                messageId,
                thumbnailUrl: ingredient.thumbnailUrl,
                title: ingredient.title ?? action.title,
                url: ingredient.url,
              },
            ]
          : [],
      );
    default:
      return [];
  }
}

function buildSummaryVariants(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputVariant[] {
  if (action.type !== 'completion_summary_card') {
    return [];
  }
  return (action.outputVariants ?? []).flatMap((variant) => {
    if (variant.kind === 'text' && !variant.textContent?.trim()) {
      return [];
    }
    if (variant.kind !== 'text' && !variant.url) {
      return [];
    }

    return [
      {
        ctas: action.ctas,
        id: `${messageId}:${action.id}:output:${variant.id}`,
        kind: variant.kind,
        messageId,
        textContent: variant.textContent,
        threadSegments: variant.threadSegments,
        thumbnailUrl: variant.thumbnailUrl,
        title: variant.title,
        url: variant.url,
      } satisfies ThreadOutputVariant,
    ];
  });
}

function buildActionGroup(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputGroup | null {
  const directVariants = [
    ...buildMediaVariants(action, messageId),
    ...buildTextVariants(action, messageId),
  ];
  const variants =
    directVariants.length > 0
      ? directVariants
      : buildSummaryVariants(action, messageId);

  if (variants.length === 0) {
    return null;
  }

  return {
    ctas: action.ctas ?? [],
    description: action.description,
    id: `${messageId}:${action.id}`,
    messageId,
    sourceActionId: action.id,
    sourceActionType: action.type,
    status: 'status' in action ? action.status : undefined,
    title: action.title,
    variants,
  };
}

function buildMessageMediaGroup(
  message: AgentChatMessage,
): ThreadOutputGroup | null {
  const mediaUrl = message.metadata?.mediaUrl;

  if (!mediaUrl) {
    return null;
  }

  return {
    ctas: [],
    id: `${message.id}:media-url`,
    messageId: message.id,
    title: 'Generated media',
    variants: [
      {
        id: `${message.id}:media-url:variant`,
        kind: inferTypeFromUrl(mediaUrl),
        messageId: message.id,
        url: mediaUrl,
      },
    ],
  };
}

export function extractThreadOutputs(
  messages: AgentChatMessage[] | null | undefined,
): ThreadOutputGroup[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const groups: ThreadOutputGroup[] = [];

  messages.forEach((message) => {
    const actionGroups = (message.metadata?.uiActions ?? []).flatMap(
      (action) => {
        const group = buildActionGroup(action, message.id);
        return group ? [group] : [];
      },
    );
    const hasDetailedOutput = actionGroups.some(
      (group) => group.sourceActionType !== 'completion_summary_card',
    );

    groups.push(
      ...actionGroups.filter(
        (group) =>
          !hasDetailedOutput ||
          group.sourceActionType !== 'completion_summary_card',
      ),
    );

    const mediaGroup = buildMessageMediaGroup(message);
    if (mediaGroup) {
      groups.push(mediaGroup);
    }
  });

  return groups;
}
