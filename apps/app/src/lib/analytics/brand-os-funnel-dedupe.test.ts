// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimBrandOsFunnelStage,
  hasAcceptedBrandOsDraft,
  markBrandOsDraftAccepted,
} from './brand-os-funnel-dedupe';

describe('Brand OS funnel dedupe', () => {
  beforeEach(() => window.localStorage.clear());

  it('gates first generation on an accepted Brand OS draft', () => {
    expect(hasAcceptedBrandOsDraft()).toBe(false);
    markBrandOsDraftAccepted();
    expect(hasAcceptedBrandOsDraft()).toBe(true);
    expect(claimBrandOsFunnelStage('first_generation')).toBe(true);
    expect(claimBrandOsFunnelStage('first_generation')).toBe(false);
  });
});
