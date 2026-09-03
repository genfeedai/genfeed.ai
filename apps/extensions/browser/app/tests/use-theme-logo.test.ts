import { describe, expect, it } from 'vitest';
import { useThemeLogo } from '~hooks/ui/use-theme-logo/use-theme-logo';
import { logoURL } from '~services/environment.service';

describe('useThemeLogo', () => {
  it('returns the CDN brand mark used by the rest of the extension', () => {
    expect(useThemeLogo()).toBe(logoURL);
    expect(useThemeLogo()).toContain('/assets/branding/logo.svg');
  });
});
