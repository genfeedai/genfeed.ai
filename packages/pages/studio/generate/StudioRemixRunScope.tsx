'use client';

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useContext,
} from 'react';

const StudioRemixRunContext = createContext(false);
const StudioRemixAvatarSelectionContext = createContext(false);

export function StudioRemixRunScope({
  canSelectAvatar = false,
  children,
  isActive,
}: PropsWithChildren<{
  readonly canSelectAvatar?: boolean;
  readonly isActive: boolean;
}>): ReactElement {
  return (
    <StudioRemixRunContext.Provider value={isActive}>
      <StudioRemixAvatarSelectionContext.Provider
        value={isActive && canSelectAvatar}
      >
        {children}
      </StudioRemixAvatarSelectionContext.Provider>
    </StudioRemixRunContext.Provider>
  );
}

export function useStudioRemixRunScope(): boolean {
  return useContext(StudioRemixRunContext);
}

export function useStudioRemixAvatarSelection(): boolean {
  return useContext(StudioRemixAvatarSelectionContext);
}
