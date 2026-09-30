import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';

import {
  collapseOAuthConnectCards,
  collectConnectPlatforms,
} from './collapse-oauth-connect-cards';

function connectCard(partial: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'oauth-connect-twitter-1',
    platform: 'twitter',
    title: 'X (Twitter) not connected',
    type: 'oauth_connect_card',
    ...partial,
  };
}

function preview(): AgentUiAction {
  return {
    id: 'preview-1',
    title: 'Draft ready',
    type: 'content_preview_card',
  };
}

describe('collectConnectPlatforms', () => {
  it('reads the collapsed platforms list first', () => {
    expect(
      collectConnectPlatforms(
        connectCard({ platform: 'twitter', platforms: ['Twitter', 'TIKTOK'] }),
      ),
    ).toEqual(['twitter', 'tiktok']);
  });

  it('falls back to the single platform field', () => {
    expect(collectConnectPlatforms(connectCard())).toEqual(['twitter']);
  });

  it('returns nothing for the generic picker card', () => {
    expect(
      collectConnectPlatforms(connectCard({ platform: '   ' })),
    ).toHaveLength(0);
  });
});

describe('collapseOAuthConnectCards', () => {
  it('leaves a single connect card untouched', () => {
    const uiActions = [connectCard(), preview()];
    expect(collapseOAuthConnectCards(uiActions)).toEqual(uiActions);
  });

  it('collapses one card per status probe into one picker card', () => {
    const collapsed = collapseOAuthConnectCards([
      connectCard({ id: 'a', platform: 'twitter' }),
      connectCard({ id: 'b', platform: 'instagram' }),
      preview(),
      connectCard({ id: 'c', platform: 'youtube' }),
    ]);

    expect(collapsed).toHaveLength(2);
    const [card, ...rest] = collapsed;
    expect(card.type).toBe('oauth_connect_card');
    expect(card.platforms).toEqual(['twitter', 'instagram', 'youtube']);
    expect(card.platform).toBeUndefined();
    expect(card.title).toBe('Connect an account');
    expect(rest[0]?.type).toBe('content_preview_card');
  });

  it('de-duplicates repeated platforms and keeps a single-platform title', () => {
    const [card] = collapseOAuthConnectCards([
      connectCard({ id: 'a' }),
      connectCard({ id: 'b' }),
    ]);

    expect(card.platforms).toEqual(['twitter']);
    expect(card.platform).toBe('twitter');
    expect(card.title).toBe('X (Twitter) not connected');
  });

  it('keeps only the first generic picker when no platform is named', () => {
    const collapsed = collapseOAuthConnectCards([
      connectCard({ id: 'a', platform: undefined, title: 'Choose one' }),
      connectCard({ id: 'b', platform: undefined, title: 'Choose one' }),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.id).toBe('a');
  });

  it('preserves order of non-connect cards', () => {
    const collapsed = collapseOAuthConnectCards([
      preview(),
      connectCard({ id: 'a', platform: 'twitter' }),
      connectCard({ id: 'b', platform: 'tiktok' }),
    ]);

    expect(collapsed.map((action) => action.type)).toEqual([
      'content_preview_card',
      'oauth_connect_card',
    ]);
  });
});
