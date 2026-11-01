import { ButtonVariant } from '@genfeedai/contracts';
import { Pre } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Alert, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
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
    <Alert
      icon={<Icon className="size-4" />}
      variant={evidence.passed ? 'success' : 'destructive'}
    >
      <AlertTitle className="flex items-center justify-between gap-2">
        {evidence.title}
        {evidence.passed ? (
          <CircleCheck className="size-4" />
        ) : (
          <CircleAlert className="size-4" />
        )}
      </AlertTitle>
      <Pre
        variant="ghost"
        size="xs"
        className="max-h-40 overflow-y-auto bg-card text-foreground/50"
      >
        {evidence.content}
      </Pre>
    </Alert>
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
              allPassed ? 'text-success' : 'text-muted-foreground',
            )}
          />
          <h2 className="text-sm font-semibold text-foreground/90">
            Verification evidence
          </h2>
        </div>
        {evidence.length > 0 && (
          <Badge
            casing="normal"
            shape="pill"
            size="lg"
            variant={allPassed ? 'success' : 'destructive'}
          >
            {evidence.filter((e) => e.passed).length}/{evidence.length} passed
          </Badge>
        )}
      </div>

      {evidence.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/10 p-6 text-center">
          <p className="text-sm text-muted-foreground">
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
