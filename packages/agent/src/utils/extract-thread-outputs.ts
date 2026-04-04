import type {
  AgentChatMessage,
  AgentIngredientItem,
  AgentUiAction,
  AgentUiActionCta,
} from '@genfeedai/agent/models/agent-chat.model';

export type ThreadOutputKind = 'audio' | 'image' | 'text' | 'video';

export interface ThreadOutputVariant {
  ctas?: AgentUiActionCta[];
  id: string;
  kind: ThreadOutputKind;
  messageId: string;
  textContent?: string;
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

function buildTextVariants(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputVariant[] {
  const variants: ThreadOutputVariant[] = [];

  action.tweets?.forEach((text, index) => {
    if (!text.trim()) {
      return;
    }

    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:tweet:${index}`,
      kind: 'text',
      messageId,
      textContent: text,
      title: `Text ${index + 1}`,
    });
  });

  if (action.textContent?.trim()) {
    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:text-content`,
      kind: 'text',
      messageId,
      textContent: action.textContent,
      title: action.title,
    });
  }

  return variants;
}

function buildMediaVariants(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputVariant[] {
  const variants: ThreadOutputVariant[] = [];

  action.images?.forEach((url, index) => {
    if (!url) {
      return;
    }

    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:image:${index}`,
      kind: 'image',
      messageId,
      title: action.title,
      url,
    });
  });

  action.videos?.forEach((url, index) => {
    if (!url) {
      return;
    }

    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:video:${index}`,
      kind: 'video',
      messageId,
      title: action.title,
      url,
    });
  });

  action.audio?.forEach((url, index) => {
    if (!url) {
      return;
    }

    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:audio:${index}`,
      kind: 'audio',
      messageId,
      title: action.title,
      url,
    });
  });

  action.ingredients?.forEach((ingredient, index) => {
    if (!ingredient.url) {
      return;
    }

    variants.push({
      ctas: action.ctas,
      id: `${messageId}:${action.id}:ingredient:${index}`,
      kind: inferIngredientType(ingredient),
      messageId,
      thumbnailUrl: ingredient.thumbnailUrl,
      title: ingredient.title ?? action.title,
      url: ingredient.url,
    });
  });

  return variants;
}

function buildActionGroup(
  action: AgentUiAction,
  messageId: string,
): ThreadOutputGroup | null {
  const variants = [
    ...buildMediaVariants(action, messageId),
    ...buildTextVariants(action, messageId),
  ];

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
    status: action.status,
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
    message.metadata?.uiActions?.forEach((action) => {
      const group = buildActionGroup(action, message.id);
      if (group) {
        groups.push(group);
      }
    });

    const mediaGroup = buildMessageMediaGroup(message);
    if (mediaGroup) {
      groups.push(mediaGroup);
    }
  });

  return groups;
}
