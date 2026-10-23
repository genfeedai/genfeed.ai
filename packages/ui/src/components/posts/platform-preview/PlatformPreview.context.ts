'use client';
import type { PlatformPreviewPresentation } from '@genfeedai/props/components/platform-preview.props';
import { createContext } from 'react';
export const PreviewPresentation = createContext<PlatformPreviewPresentation>(
  {},
);
