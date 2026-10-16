'use client';

import { Button } from '@ui/primitives/button';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react';

export interface BrandKitReviewApplyState {
  isApplying: boolean;
  isDisabled: boolean;
  onApply: () => void;
  summary: string;
}

const BrandKitReviewApplyStateContext =
  createContext<BrandKitReviewApplyState | null>(null);
const BrandKitReviewApplySetterContext = createContext<Dispatch<
  SetStateAction<BrandKitReviewApplyState | null>
> | null>(null);

interface BrandKitReviewActionsProviderProps {
  children: ReactNode;
}

export function BrandKitReviewActionsProvider({
  children,
}: BrandKitReviewActionsProviderProps) {
  const [state, setState] = useState<BrandKitReviewApplyState | null>(null);

  return (
    <BrandKitReviewApplySetterContext.Provider value={setState}>
      <BrandKitReviewApplyStateContext.Provider value={state}>
        {children}
      </BrandKitReviewApplyStateContext.Provider>
    </BrandKitReviewApplySetterContext.Provider>
  );
}

export function useBrandKitReviewApplySetter() {
  return useContext(BrandKitReviewApplySetterContext);
}

export function BrandKitReviewApplyControls({
  state,
}: {
  state: BrandKitReviewApplyState;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
      data-testid="brand-kit-apply-bar"
    >
      <p className="text-xs text-muted-foreground">{state.summary}</p>
      <Button
        isDisabled={state.isDisabled}
        isLoading={state.isApplying}
        label="Apply Selected Fields"
        onClick={state.onApply}
      />
    </div>
  );
}

export function BrandKitReviewApplyBar() {
  const state = useContext(BrandKitReviewApplyStateContext);
  if (!state) {
    return null;
  }

  return <BrandKitReviewApplyControls state={state} />;
}
