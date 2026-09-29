import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_COMPOSER_ACTIONS,
  getConversationComposerAction,
  parseConversationComposerCommand,
  resolveConversationComposerDestinationHref,
} from './conversation-composer-actions.constant';

describe('conversation composer action registry', () => {
  it('parses only an explicit leading allowlisted command', () => {
    expect(parseConversationComposerCommand('/discover competitors')).toEqual({
      invocation: {
        action: getConversationComposerAction('discover'),
        arguments: 'competitors',
      },
      kind: 'action',
    });
    expect(
      parseConversationComposerCommand('Please publish this post'),
    ).toEqual({ kind: 'none' });
  });

  it('keeps unknown commands distinguishable for recoverable guidance', () => {
    expect(parseConversationComposerCommand('/delete everything')).toEqual({
      command: { command: 'delete' },
      kind: 'unknown',
    });
  });

  it('routes every action to brand when a brand is selected, else org', () => {
    const activeHref = (path: string) => `/acme/moonrise${path}`;
    const orgHref = (path: string) => `/acme/~${path}`;

    for (const action of CONVERSATION_COMPOSER_ACTIONS) {
      expect(
        resolveConversationComposerDestinationHref({
          activeHref,
          orgHref,
          route: action.route,
          routeBrandSlug: 'moonrise',
          selectedBrandSlug: null,
        }),
      ).toBe(activeHref(action.route));

      expect(
        resolveConversationComposerDestinationHref({
          activeHref,
          orgHref,
          route: action.route,
          routeBrandSlug: '',
          selectedBrandSlug: 'moonrise',
        }),
      ).toBe(activeHref(action.route));

      expect(
        resolveConversationComposerDestinationHref({
          activeHref,
          orgHref,
          route: action.route,
          routeBrandSlug: '',
          selectedBrandSlug: '',
        }),
      ).toBe(orgHref(action.route));
    }
  });
});
