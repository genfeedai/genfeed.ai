import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
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
      <div className="my-2 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Response handled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
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
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="w-full resize-none"
          />
        ) : (
          <div className="rounded border border-border bg-background p-2.5 text-sm text-foreground">
            {reply || 'No draft reply provided'}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={handleApprove}
          isDisabled={!reply.trim()}
          className="flex-1 bg-green-500 text-white hover:bg-green-600"
        >
          <HiCheck className="h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.SM}
          onClick={handleEdit}
          className="flex-1"
        >
          <HiPencil className="h-3.5 w-3.5" />
          {isEditing ? 'Save' : 'Edit'}
        </Button>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={handleSkip}
          className="flex-1 bg-muted text-muted-foreground hover:bg-muted/80"
        >
          <HiForward className="h-3.5 w-3.5" />
          Skip
        </Button>
      </div>
    </div>
  );
}
