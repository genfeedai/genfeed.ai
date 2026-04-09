'use client';

import type { AudioInputNodeData } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Expand, Link, Music, Upload, X } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';

function AudioInputNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as AudioInputNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState(nodeData.url || '');

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const audio = document.createElement('audio');
        audio.onloadedmetadata = () => {
          updateNodeData<AudioInputNodeData>(id, {
            audio: event.target?.result as string,
            duration: audio.duration,
            filename: file.name,
            source: 'upload',
          });
        };
        audio.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData],
  );

  const handleRemoveAudio = useCallback(() => {
    updateNodeData<AudioInputNodeData>(id, {
      audio: null,
      duration: null,
      filename: null,
      url: undefined,
    });
    setUrlValue('');
  }, [id, updateNodeData]);

  const handleUrlSubmit = useCallback(() => {
    if (!urlValue.trim()) return;

    // Create an audio element to validate and get duration
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.onloadedmetadata = () => {
      updateNodeData<AudioInputNodeData>(id, {
        audio: urlValue,
        duration: audio.duration,
        filename: urlValue.split('/').pop() || 'url-audio',
        source: 'url',
        url: urlValue,
      });
      setShowUrlInput(false);
    };
    audio.onerror = () => {
      // Still set the URL even if we can't load it (might be CORS)
      updateNodeData<AudioInputNodeData>(id, {
        audio: urlValue,
        duration: null,
        filename: urlValue.split('/').pop() || 'url-audio',
        source: 'url',
        url: urlValue,
      });
      setShowUrlInput(false);
    };
    audio.src = urlValue;
  }, [id, updateNodeData, urlValue]);

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleUrlSubmit();
      } else if (e.key === 'Escape') {
        setShowUrlInput(false);
        setUrlValue(nodeData.url || '');
      }
    },
    [handleUrlSubmit, nodeData.url],
  );

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  // Header actions - Upload, Link, and Expand buttons
  const headerActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          title="Upload audio"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowUrlInput(!showUrlInput)}
          title="Paste URL"
        >
          <Link className="h-3.5 w-3.5" />
        </Button>
        {nodeData.audio && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleExpand}
            title="Expand preview"
          >
            <Expand className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    ),
    [showUrlInput, nodeData.audio, handleExpand],
  );

  return (
    <BaseNode {...props} headerActions={headerActions}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* URL Input (shown when link button clicked) */}
      {showUrlInput && (
        <div className="mb-3 flex gap-2">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://..."
            className="nodrag nopan flex-1 h-7 px-2 text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUrlSubmit}
            disabled={!urlValue.trim()}
            className="h-7 px-2 text-xs"
          >
            Load
          </Button>
        </div>
      )}

      {/* Audio Preview or Empty State */}
      {nodeData.audio ? (
        <div className="space-y-2">
          <div className="relative">
            <audio src={nodeData.audio} controls className="w-full h-8">
              <track kind="captions" />
            </audio>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={handleRemoveAudio}
              className="absolute -right-1 -top-1 h-5 w-5"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {nodeData.filename}
            {nodeData.duration && ` • ${formatDuration(nodeData.duration)}`}
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 min-h-16 w-full flex-col items-center justify-center gap-1 border border-dashed border-border/50 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40 h-auto"
        >
          <Music className="h-5 w-5 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/70">
            Drop or click
          </span>
        </Button>
      )}
    </BaseNode>
  );
}

export const AudioInputNode = memo(AudioInputNodeComponent);
