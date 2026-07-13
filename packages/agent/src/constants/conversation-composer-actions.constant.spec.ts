import { APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { AGENT_SLASH_COMMANDS } from './agent-slash-commands.constant';
import {
  CONVERSATION_COMPOSER_ACTIONS,
  getConversationComposerAction,
  parseConversationComposerCommand,
} from './conversation-composer-actions.constant';

describe('conversation composer action registry', () => {
  it('contains exactly the eight trusted issue actions', () => {
    expect(CONVERSATION_COMPOSER_ACTIONS.map((action) => action.name)).toEqual([
      'create',
      'remix',
      'research',
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
      route: APP_ROUTES.POSTS.REVIEW,
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
          route: APP_ROUTES.POSTS.REMIX,
        }),
      },
      {
        name: 'research',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.RESEARCH.ROOT,
        }),
      },
      {
        name: 'workflow',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.WORKFLOWS.ROOT,
        }),
      },
      {
        name: 'schedule',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.POSTS.CALENDAR,
        }),
      },
      {
        name: 'publish',
        resolved: expect.objectContaining({
          requiredScope: 'brand',
          route: APP_ROUTES.POSTS.REVIEW,
        }),
      },
      {
        name: 'analyze',
        resolved: expect.objectContaining({
          requiredScope: 'organization',
          route: APP_ROUTES.ANALYTICS.ROOT,
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
    expect(parseConversationComposerCommand('/research competitors')).toEqual({
      invocation: {
        action: getConversationComposerAction('research'),
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
});
