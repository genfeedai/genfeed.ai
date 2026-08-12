'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

interface CompatibilityHandleDefinition {
  id: string;
  label: string;
}

interface CompatibilityNodeDefinition {
  description: string;
  inputs: CompatibilityHandleDefinition[];
  label: string;
  outputs: CompatibilityHandleDefinition[];
}

const TEMPLATE_COMPATIBILITY_DEFINITIONS: Record<
  string,
  CompatibilityNodeDefinition
> = {
  'ai-avatar-video': {
    description:
      'Generate a talking-head avatar video using saved identity defaults or runtime overrides.',
    inputs: [
      { id: 'script', label: 'Script' },
      { id: 'photoUrl', label: 'Photo URL' },
      { id: 'clonedVoiceId', label: 'Cloned Voice ID' },
      { id: 'audioUrl', label: 'Audio URL' },
    ],
    label: 'Avatar UGC Video',
    outputs: [{ id: 'video', label: 'Video' }],
  },
  'effect-captions': {
    description: 'Burn captions into the incoming video.',
    inputs: [{ id: 'video', label: 'Video' }],
    label: 'Add Captions',
    outputs: [{ id: 'video', label: 'Video' }],
  },
  musicSource: {
    description:
      'Resolve background music from trends, uploads, library, or generation.',
    inputs: [
      { id: 'uploadUrl', label: 'Upload URL' },
      { id: 'generatePrompt', label: 'AI Prompt' },
    ],
    label: 'Music Source',
    outputs: [{ id: 'musicUrl', label: 'Music URL' }],
  },
  soundOverlay: {
    description: 'Overlay a sound track onto an input video.',
    inputs: [
      { id: 'videoUrl', label: 'Video URL' },
      { id: 'soundUrl', label: 'Sound URL' },
    ],
    label: 'Sound Overlay',
    outputs: [{ id: 'videoUrl', label: 'Video URL' }],
  },
  socialRead: {
    description: 'Get recent posts, mentions, or search results from X.',
    inputs: [
      { id: 'brand', label: 'Brand' },
      { id: 'query', label: 'Search' },
      { id: 'username', label: 'Username' },
    ],
    label: 'Read posts',
    outputs: [
      { id: 'posts', label: 'Posts' },
      { id: 'summary', label: 'Summary' },
      { id: 'count', label: 'Count' },
    ],
  },
  reportDelivery: {
    description: 'Send results privately by notification or email.',
    inputs: [
      { id: 'content', label: 'Content' },
      { id: 'subject', label: 'Subject' },
      { id: 'html', label: 'Email body' },
    ],
    label: 'Send report',
    outputs: [
      { id: 'delivered', label: 'Sent' },
      { id: 'destination', label: 'Sent to' },
    ],
  },
  postReply: {
    description: 'Reply to a social post or Messages conversation.',
    inputs: [
      { id: 'brand', label: 'Brand' },
      { id: 'postId', label: 'Post ID' },
      { id: 'conversationId', label: 'Conversation ID' },
      { id: 'text', label: 'Reply Text' },
    ],
    label: 'Post Reply',
    outputs: [
      { id: 'replyId', label: 'Reply ID' },
      { id: 'replyUrl', label: 'Reply URL' },
    ],
  },
  sendDm: {
    description: 'Send a direct message on a connected social account.',
    inputs: [
      { id: 'brand', label: 'Brand' },
      { id: 'recipientId', label: 'Recipient ID' },
      { id: 'conversationId', label: 'Conversation ID' },
      { id: 'text', label: 'Message Text' },
    ],
    label: 'Send DM',
    outputs: [{ id: 'messageId', label: 'Message ID' }],
  },
};

function handleTopOffset(index: number, total: number): string {
  return `${((index + 1) * 100) / (total + 1)}%`;
}

interface NodeHandlesProps {
  handles: CompatibilityHandleDefinition[];
  position: Position;
}

function NodeHandles({
  handles,
  position,
}: NodeHandlesProps): React.JSX.Element {
  return (
    <>
      {handles.map((handle, index) => (
        <Handle
          key={`${position}-${handle.id}`}
          id={handle.id}
          type={position === Position.Left ? 'target' : 'source'}
          position={position}
          className="!h-3 !w-3 !border-border !bg-primary"
          style={{ top: handleTopOffset(index, handles.length) }}
          title={handle.label}
        />
      ))}
    </>
  );
}

function TemplateCompatibilityNodeComponent(
  props: NodeProps,
): React.JSX.Element {
  const definition =
    TEMPLATE_COMPATIBILITY_DEFINITIONS[props.type] ??
    TEMPLATE_COMPATIBILITY_DEFINITIONS['ai-avatar-video'];
  const displayLabel =
    typeof props.data?.label === 'string' ? props.data.label : definition.label;

  return (
    <div className="relative min-w-[280px] space-y-3 rounded-xl shadow-border bg-card p-4 text-card-foreground">
      <NodeHandles handles={definition.inputs} position={Position.Left} />
      <NodeHandles handles={definition.outputs} position={Position.Right} />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{displayLabel}</h3>
          <p className="text-xs text-muted-foreground">
            {definition.description}
          </p>
        </div>
        <span className="rounded-full border border-border/80 bg-secondary/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
          Template
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {definition.inputs.map((handle) => (
          <span
            key={`in-${handle.id}`}
            className="rounded-full border border-border/80 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            in: {handle.label}
          </span>
        ))}
        {definition.outputs.map((handle) => (
          <span
            key={`out-${handle.id}`}
            className="rounded-full border border-border/80 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            out: {handle.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const TemplateCompatibilityNode = memo(
  TemplateCompatibilityNodeComponent,
);
