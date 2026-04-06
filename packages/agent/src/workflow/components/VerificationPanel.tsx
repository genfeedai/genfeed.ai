import { ButtonVariant } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import {
  AlertCircle,
  CheckCircle2,
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
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-red-500/20 bg-red-500/5',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            'size-4',
            evidence.passed ? 'text-emerald-400' : 'text-red-400',
          )}
        />
        <span className="text-sm font-medium text-white/80">
          {evidence.title}
        </span>
        {evidence.passed ? (
          <CheckCircle2 className="size-4 text-emerald-400 ml-auto" />
        ) : (
          <AlertCircle className="size-4 text-red-400 ml-auto" />
        )}
      </div>
      <Pre
        variant="ghost"
        size="xs"
        className="text-white/50 bg-black/20 max-h-40 overflow-y-auto"
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
          <CheckCircle2
            className={cn(
              'size-5',
              allPassed ? 'text-emerald-400' : 'text-white/40',
            )}
          />
          <h2 className="text-sm font-semibold text-white/90">
            Verification evidence
          </h2>
        </div>
        {evidence.length > 0 && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              allPassed
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400',
            )}
          >
            {evidence.filter((e) => e.passed).length}/{evidence.length} passed
          </span>
        )}
      </div>

      {evidence.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
          <p className="text-sm text-white/40">
            Waiting for verification evidence from the agent...
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
          className="w-full py-2.5 text-sm font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors"
        >
          Accept & mark complete
        </Button>
      )}
    </div>
  );
}

export const VerificationPanel = memo(VerificationPanelInner);
