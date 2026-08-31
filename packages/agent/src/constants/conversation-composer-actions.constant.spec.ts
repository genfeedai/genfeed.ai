import { APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { AGENT_SLASH_COMMANDS } from './agent-slash-commands.constant';
import {
  CONVERSATION_COMPOSER_ACTIONS,
  getConversationComposerAction,
  parseConversationComposerCommand,
  resolveConversationComposerDestinationHref,
} from './conversation-composer-actions.constant';

describe('conversation composer action registry', () => {
  it('contains exactly the eight trusted issue actions', () => {
    expect(CONVERSATION_COMPOSER_ACTIONS.map((action) => action.name)).toEqual([
      'create',
      'remix',
      'discover',
      'workflow',
      'schedule',
      'publish',
      'analyze',
      'reply',
    ]);
  });

  it('maps publish to review without granting publish authority', () => {
    expect(getConversationComposerAction('publish')).toMatchObject({
      isConsequentialProposal: true,
      route: APP_ROUTES.PUBLISHING.REVIEW,
    });
  });

  it('resolves every action to its canonical route and required scope', () => {
    expect(
      CONVERSATION_COMPOSER_ACTIONS.map((action) => ({
        name: action.name,
        resolved: getConversationComposerAction(action.name),
      })),
    ).toEqual([
      {
        name: 'create',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.STUDIO.ROOT,
        }),
      },
      {
        name: 'remix',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.PUBLISHING.REMIX,
        }),
      },
      {
        name: 'discover',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.DISCOVERY.ROOT,
        }),
      },
      {
        name: 'workflow',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.AUTOMATION.WORKFLOWS,
        }),
      },
      {
        name: 'schedule',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.PUBLISHING.CALENDAR,
        }),
      },
      {
        name: 'publish',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.PUBLISHING.REVIEW,
        }),
      },
      {
        name: 'analyze',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.ANALYTICS.OVERVIEW,
        }),
      },
      {
        name: 'reply',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.MESSAGES.ROOT,
        }),
      },
    ]);
  });

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

  it('keeps legacy schedule and analyze prompt shortcuts under explicit aliases', () => {
    expect(AGENT_SLASH_COMMANDS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'schedule-post',
          promptPrefix: 'Schedule a post for ',
        }),
        expect.objectContaining({
          name: 'analyze-performance',
          promptPrefix: 'Analyze performance of ',
        }),
      ]),
    );
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
