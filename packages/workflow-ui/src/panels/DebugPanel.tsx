'use client';

import { Pre } from '@genfeedai/ui';
import { Bug, ChevronDown, ChevronRight, Copy, Trash2, X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import type { DebugPayload } from '../stores/execution/types';
import { useExecutionStore } from '../stores/executionStore';
import { useUIStore } from '../stores/uiStore';
import { Button } from '../ui/button';
import { PanelContainer } from './PanelContainer';

interface PayloadCardProps {
  payload: DebugPayload;
}

function PayloadCard({ payload }: PayloadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(payload.input, null, 2),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard access denied - fallback to execCommand
        const textArea = document.createElement('textarea');
        textArea.value = JSON.stringify(payload.input, null, 2);
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Both methods failed
        }
        document.body.removeChild(textArea);
      }
    },
    [payload.input],
  );

  const timestamp = new Date(payload.timestamp).toLocaleTimeString();

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-[var(--muted)]/50 h-auto rounded-none"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--foreground)] truncate">
              {payload.nodeName || payload.nodeId}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded">
              {payload.nodeType}
            </span>
          </div>
          <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
            {payload.model} &bull; {timestamp}
          </div>
        </div>
      </Button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] p-3 bg-[var(--muted)]/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">
              Payload
            </span>
            <Button
              variant="link"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-[var(--primary)] h-auto p-0"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <Pre variant="debug" size="xs" className="text-[11px]">
            {JSON.stringify(payload.input, null, 2)}
          </Pre>
        </div>
      )}
    </div>
  );
}

function DebugPanelComponent() {
  const debugPayloads = useExecutionStore((s) => s.debugPayloads);
  const clearDebugPayloads = useExecutionStore((s) => s.clearDebugPayloads);
  const setShowDebugPanel = useUIStore((s) => s.setShowDebugPanel);

  const handleClose = useCallback(() => {
    setShowDebugPanel(false);
  }, [setShowDebugPanel]);

  return (
    <PanelContainer className="w-80 h-full border-l border-[var(--border)] bg-[var(--background)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-sm">Debug Console</span>
          {debugPayloads.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded-full">
              {debugPayloads.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {debugPayloads.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearDebugPayloads}
              title="Clear all payloads"
            >
              <Trash2 className="w-4 h-4 text-[var(--muted-foreground)]" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {debugPayloads.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted-foreground)]">
            <Bug className="w-12 h-12 mx-auto mb-3 opacity-50 text-amber-500/50" />
            <p className="text-sm font-medium mb-2">No payloads captured</p>
            <p className="text-xs">
              Run a workflow with debug mode enabled to capture API payloads.
            </p>
          </div>
        ) : (
          debugPayloads.map((payload, index) => (
            <PayloadCard
              key={`${payload.nodeId}-${payload.timestamp}-${index}`}
              payload={payload}
            />
          ))
        )}
      </div>

      {/* Footer info */}
      {debugPayloads.length > 0 && (
        <div className="p-3 border-t border-[var(--border)] bg-[var(--muted)]/30">
          <p className="text-[10px] text-[var(--muted-foreground)]">
            {debugPayloads.length} payload
            {debugPayloads.length !== 1 ? 's' : ''} captured. Click to expand
            and view details.
          </p>
        </div>
      )}
    </PanelContainer>
  );
}

const MemoizedDebugPanel = memo(DebugPanelComponent);

export function DebugPanel() {
  return <MemoizedDebugPanel />;
}
