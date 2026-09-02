import { ButtonVariant } from '@genfeedai/contracts';
import { Pre } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  CircleAlert,
  CircleCheck,
  Code,
  FileText,
  Image,
  Terminal,
} from 'lucide-react';
import { memo } from 'react';
import { useAgentWorkflowStore } from '../store';
import type { Evidence, EvidenceType } from '../types';

const EVIDENCE_ICONS: Record<EvidenceType, typeof Terminal> = {
  diff: Code,
  log: FileText,
  screenshot: Image,
  test_result: Terminal,
};

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const Icon = EVIDENCE_ICONS[evidence.type];

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all',
        evidence.passed
          ? 'border-success/20 bg-success/10'
          : 'border-destructive/20 bg-destructive/10',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            'size-4',
            evidence.passed ? 'text-success' : 'text-destructive',
          )}
        />
        <span className="text-sm font-medium text-foreground/80">
          {evidence.title}
        </span>
        {evidence.passed ? (
          <CircleCheck className="size-4 text-success ml-auto" />
        ) : (
          <CircleAlert className="size-4 text-destructive ml-auto" />
        )}
      </div>
      <Pre
        variant="ghost"
        size="xs"
        className="max-h-40 overflow-y-auto bg-background-secondary text-foreground/50"
      >
        {evidence.content}
      </Pre>
    </div>
  );
}

function VerificationPanelInner() {
  const evidence = useAgentWorkflowStore((s) => s.verificationEvidence);
  const allPassed = useAgentWorkflowStore((s) => s.getAllEvidencePassed());
  const canAdvance = useAgentWorkflowStore((s) => s.canAdvance());
  const advance = useAgentWorkflowStore((s) => s.advance);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleCheck
            className={cn(
              'size-5',
              allPassed ? 'text-success' : 'text-foreground/40',
            )}
          />
          <h2 className="text-sm font-semibold text-foreground/90">
            Verification evidence
          </h2>
        </div>
        {evidence.length > 0 && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              allPassed
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {evidence.filter((e) => e.passed).length}/{evidence.length} passed
          </span>
        )}
      </div>

      {evidence.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/10 p-6 text-center">
          <p className="text-sm text-foreground/40">
            Waiting for verification evidence from the agent…
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {evidence.map((e) => (
            <EvidenceItem key={e.id} evidence={e} />
          ))}
        </div>
      )}

      {canAdvance && (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={() => advance('user')}
          className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-success-foreground transition-colors hover:bg-success/90"
        >
          Accept & mark complete
        </Button>
      )}
    </div>
  );
}

export const VerificationPanel = memo(VerificationPanelInner);
