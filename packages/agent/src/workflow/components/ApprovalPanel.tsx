import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check, MessageSquare, ShieldCheck } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useAgentWorkflowStore } from '../store';
import { ApproachCard } from './ApproachCard';

function ApprovalPanelInner() {
  const approaches = useAgentWorkflowStore((s) => s.approaches);
  const selectedApproachId = useAgentWorkflowStore((s) => s.selectedApproachId);
  const selectApproach = useAgentWorkflowStore((s) => s.selectApproach);
  const approveApproach = useAgentWorkflowStore((s) => s.approveApproach);
  const addMessage = useAgentWorkflowStore((s) => s.addMessage);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);

  const selectedApproach = approaches.find((a) => a.id === selectedApproachId);

  const handleApprove = useCallback(() => {
    if (selectedApproach) {
      addMessage('user', `Approved approach: "${selectedApproach.title}"`);
      approveApproach();
    }
  }, [selectedApproach, addMessage, approveApproach]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="size-5 text-info" />
        <h2 className="text-sm font-semibold text-foreground/90">
          Select & approve an approach
        </h2>
      </div>

      <div className="space-y-3">
        {approaches.map((approach) => (
          <ApproachCard
            key={approach.id}
            approach={approach}
            isSelected={approach.id === selectedApproachId}
            onSelect={selectApproach}
            disabled={isLocked}
          />
        ))}
      </div>

      {selectedApproach && (
        <div className="flex items-center gap-3 pt-2 border-t border-foreground/10">
          <Button
            variant={ButtonVariant.SUCCESS}
            withWrapper={false}
            onClick={handleApprove}
            isDisabled={isLocked}
          >
            <Check className="size-4" />
            Approve & proceed
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            onClick={() =>
              addMessage(
                'user',
                'Requesting changes to the proposed approaches.',
              )
            }
            isDisabled={isLocked}
          >
            <MessageSquare className="size-4" />
            Request changes
          </Button>
        </div>
      )}
    </div>
  );
}

export const ApprovalPanel = memo(ApprovalPanelInner);
