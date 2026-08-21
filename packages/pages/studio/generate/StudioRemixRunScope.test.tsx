import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  StudioRemixRunScope,
  useStudioRemixRunScope,
} from './StudioRemixRunScope';

describe('StudioRemixRunScope', () => {
  it('tells nested Studio controls when canonical remix identity is locked', () => {
    const { result } = renderHook(() => useStudioRemixRunScope(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StudioRemixRunScope isActive>{children}</StudioRemixRunScope>
      ),
    });

    expect(result.current).toBe(true);
  });
});
