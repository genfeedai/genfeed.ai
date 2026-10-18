import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { isMajorPromptBarHost } from './is-major-prompt-bar-host';

describe('isMajorPromptBarHost', () => {
  it('treats Studio routes that render a full prompt bar as hosts', () => {
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.PLAYGROUND)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.MOTION)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.CLIPS_NEW)).toBe(true);
    expect(isMajorPromptBarHost(`${APP_ROUTES.STUDIO.CLIPS}/project-1`)).toBe(
      true,
    );
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.STORYBOARD_NEW)).toBe(true);
    expect(isMajorPromptBarHost(`${APP_ROUTES.STUDIO.STORYBOARD}/run-1`)).toBe(
      true,
    );
  });

  it('keeps the agent bubble on Studio and edit routes without a prompt bar', () => {
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.ROOT)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.CLIPS)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.STORYBOARD)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.TURBO)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.TURBO_NEW)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.EDITOR)).toBe(false);
    expect(isMajorPromptBarHost(`${APP_ROUTES.STUDIO.EDITOR}/video-1`)).toBe(
      false,
    );
    expect(isMajorPromptBarHost(APP_ROUTES.EDIT.ROOT)).toBe(false);
    expect(isMajorPromptBarHost(APP_ROUTES.EDIT.ARTICLE)).toBe(false);
    expect(isMajorPromptBarHost(`${APP_ROUTES.EDIT.NEWSLETTER}/issue-1`)).toBe(
      false,
    );
  });

  it('does not match a sibling route that only shares a name prefix', () => {
    expect(isMajorPromptBarHost('/studio/playground-archive')).toBe(false);
    expect(isMajorPromptBarHost('/studio/motions')).toBe(false);
  });

  it('leaves ordinary product pages on the compact page promptbar', () => {
    expect(isMajorPromptBarHost('/workspace')).toBe(false);
    expect(isMajorPromptBarHost('/library/assets')).toBe(false);
    expect(isMajorPromptBarHost('/analytics')).toBe(false);
    expect(isMajorPromptBarHost('/agent')).toBe(false);
  });
});
