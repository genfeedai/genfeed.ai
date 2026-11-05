import type {
  AgentUiAction,
  AgentUiActionOf,
} from './agent-ui-action.interface';

/**
 * Every platform a connect card offers, lowercased and de-duplicated.
 * Collapsed cards carry `platforms`; a single card carries `platform`.
 */
export function collectConnectPlatforms(
  action: AgentUiActionOf<'oauth_connect_card'>,
): string[] {
  const candidates = action.platforms?.length
    ? action.platforms
    : [action.platform ?? ''];

  const platforms: string[] = [];
  candidates.forEach((candidate) => {
    const normalized = candidate.trim().toLowerCase();
    if (normalized && !platforms.includes(normalized)) {
      platforms.push(normalized);
    }
  });

  return platforms;
}

/**
 * A turn that probes connection status once per platform emits one
 * `oauth_connect_card` per probe — six stacked cards for a single question.
 * Collapse them into one picker card at the position of the first card.
 *
 * The server applies it before storing a turn and the client to streamed
 * turns, so both render the same way.
 */
export function collapseOAuthConnectCards(
  uiActions: AgentUiAction[],
): AgentUiAction[] {
  const connectCards = uiActions.filter(
    (action) => action.type === 'oauth_connect_card',
  );

  if (connectCards.length < 2) {
    return uiActions;
  }

  const platforms = connectCards.flatMap(collectConnectPlatforms);
  const uniquePlatforms = platforms.filter(
    (platform, index) => platforms.indexOf(platform) === index,
  );

  const [firstCard] = connectCards;
  const collapsed: AgentUiAction =
    uniquePlatforms.length === 0
      ? // Every card was the platform-less generic picker: keep the first one.
        firstCard
      : {
          ...firstCard,
          description:
            firstCard.description ??
            'Connect an account to unlock publishing and scheduling.',
          id: `oauth-connect-collapsed-${firstCard.id}`,
          platform:
            uniquePlatforms.length === 1 ? uniquePlatforms[0] : undefined,
          platforms: uniquePlatforms,
          title:
            uniquePlatforms.length === 1
              ? firstCard.title
              : 'Connect an account',
        };

  let hasEmittedCollapsed = false;

  return uiActions.flatMap<AgentUiAction>((action) => {
    if (action.type !== 'oauth_connect_card') {
      return [action];
    }

    if (hasEmittedCollapsed) {
      return [];
    }

    hasEmittedCollapsed = true;
    return [collapsed];
  });
}
