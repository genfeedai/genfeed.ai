'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { WorkspaceInspectorPreview } from '@/lib/workspace-shell/workspace-inspector-preview.util';

type WorkspaceInspectorPreviewContextValue = {
  readonly preview: WorkspaceInspectorPreview | null;
  readonly setPreview: (preview: WorkspaceInspectorPreview | null) => void;
};

const WorkspaceInspectorPreviewContext =
  createContext<WorkspaceInspectorPreviewContextValue | null>(null);

export function WorkspaceInspectorPreviewProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [preview, setPreviewState] = useState<WorkspaceInspectorPreview | null>(
    null,
  );
  const setPreview = useCallback((next: WorkspaceInspectorPreview | null) => {
    setPreviewState(next);
  }, []);
  const value = useMemo(() => ({ preview, setPreview }), [preview, setPreview]);

  return (
    <WorkspaceInspectorPreviewContext.Provider value={value}>
      {children}
    </WorkspaceInspectorPreviewContext.Provider>
  );
}

export function useWorkspaceInspectorPreview(): WorkspaceInspectorPreviewContextValue {
  const value = useContext(WorkspaceInspectorPreviewContext);

  if (!value) {
    return {
      preview: null,
      setPreview: () => undefined,
    };
  }

  return value;
}
