import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { type ReactElement, useCallback, useState } from 'react';
import {
  HiChatBubbleLeftRight,
  HiCheck,
  HiForward,
  HiPencil,
} from 'react-icons/hi2';

interface EngagementOpportunityCardProps {
  action: AgentUiAction;
  onApprove?: (reply: string) => void;
  onEdit?: (reply: string) => void;
  onSkip?: () => void;
}

export function EngagementOpportunityCard({
  action,
  onApprove,
  onEdit,
  onSkip,
}: EngagementOpportunityCardProps): ReactElement {
  const originalPost = action.originalPost;
  const [reply, setReply] = useState(action.draftReply ?? '');
  const [acted, setActed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove?.(reply);
    setActed(true);
  }, [reply, onApprove]);

  const handleEdit = useCallback(() => {
    if (isEditing) {
      onEdit?.(reply);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  }, [isEditing, reply, onEdit]);

  const handleSkip = useCallback(() => {
    onSkip?.();
    setActed(true);
  }, [onSkip]);

  if (acted) {
    return (
      <div className="my-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Response handled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiChatBubbleLeftRight className="h-5 w-5 text-emerald-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Engagement Opportunity'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Original post preview */}
      {originalPost && (
        <div className="mb-3 rounded border border-border bg-muted p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">
              {originalPost.author}
            </span>
            {originalPost.platform && (
              <span className="text-[10px] text-muted-foreground">
                on {originalPost.platform}
              </span>
            )}
          </div>
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {originalPost.content}
          </p>
        </div>
      )}

      {/* Draft reply */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Draft Reply
        </label>
        {isEditing ? (
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <div className="rounded border border-border bg-background p-2.5 text-sm text-foreground">
            {reply || 'No draft reply provided'}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={!reply.trim()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-green-500 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <HiCheck className="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={handleEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-black text-foreground transition-colors hover:bg-accent"
        >
          <HiPencil className="h-3.5 w-3.5" />
          {isEditing ? 'Save' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-muted px-3 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:bg-muted/80"
        >
          <HiForward className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>
    </div>
  );
}
