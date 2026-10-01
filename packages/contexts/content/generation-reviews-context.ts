'use client';

import type { GenerationReviewsContextValue } from '@genfeedai/props/admin/generation-reviews.props';
import { createContext } from 'react';

export const GenerationReviewsContext =
  createContext<GenerationReviewsContextValue>({
    refreshVersion: 0,
    setIsRefreshing: () => {},
  });
