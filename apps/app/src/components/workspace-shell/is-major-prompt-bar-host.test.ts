import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { isMajorPromptBarHost } from './is-major-prompt-bar-host';

describe('isMajorPromptBarHost', () => {
  it('treats studio and edit surfaces as major prompt-bar hosts', () => {
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.ROOT)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.GENERATE)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.STUDIO.CLIPS)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.EDIT.ROOT)).toBe(true);
    expect(isMajorPromptBarHost(APP_ROUTES.EDIT.ARTICLE)).toBe(true);
  });

  it('leaves ordinary product pages on the compact page promptbar', () => {
    expect(isMajorPromptBarHost('/workspace')).toBe(false);
    expect(isMajorPromptBarHost('/library/assets')).toBe(false);
    expect(isMajorPromptBarHost('/analytics')).toBe(false);
    expect(isMajorPromptBarHost('/agent')).toBe(false);
  });
});
