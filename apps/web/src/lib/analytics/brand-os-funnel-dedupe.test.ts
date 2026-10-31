// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimBrandOsFunnelStage,
  hasAcceptedBrandOsDraft,
  markBrandOsDraftAccepted,
} from './brand-os-funnel-dedupe';

describe('Brand OS funnel dedupe', () => {
  beforeEach(() => window.localStorage.clear());

  it('claims each sanitized stage exactly once', () => {
    expect(claimBrandOsFunnelStage('draft_saved')).toBe(true);
    expect(claimBrandOsFunnelStage('draft_saved')).toBe(false);
    expect(claimBrandOsFunnelStage('draft_accepted')).toBe(true);
  });

  it('gates first generation on an accepted Brand OS draft', () => {
    expect(hasAcceptedBrandOsDraft()).toBe(false);
    markBrandOsDraftAccepted();
    expect(hasAcceptedBrandOsDraft()).toBe(true);
    expect(claimBrandOsFunnelStage('first_generation')).toBe(true);
    expect(claimBrandOsFunnelStage('first_generation')).toBe(false);
  });
});
