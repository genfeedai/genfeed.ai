'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import {
  clearErrorDebugInfo,
  getErrorDebugInfo,
  subscribe,
} from '@genfeedai/services/core/error-debug-store';
import { Pre } from '@genfeedai/ui';
import Card from '@ui/card/Card';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import {
  formatErrorDebugContext,
  formatErrorDebugForAgent,
  formatErrorDebugRequest,
  formatErrorDebugResponse,
  resolveErrorDebugSummary,
} from '@ui/modals/system/error-debug/error-debug-copy.util';
import { Button } from '@ui/primitives/button';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

interface ErrorSectionProps {
  children?: ReactNode;
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  /** Optional section copy payload — shows a Copy control in the header. */
  copyText?: string;
  onCopy?: (text: string) => void | Promise<void>;
  copyLabel?: string;
}

function handleCancel(): void {
  closeModal(ModalEnum.ERROR_DEBUG);
}

function ErrorSection({
  children,
  title,
  isExpanded,
  onToggle,
  copyText,
  onCopy,
  copyLabel = 'Copy section',
}: ErrorSectionProps) {
  const showBody = onToggle ? isExpanded : true;

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className="rounded-lg border border-border bg-background-secondary hover:border-border"
      bodyClassName="gap-0 p-4"
    >
      <div className="flex items-center gap-2">
        {onToggle ? (
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <h3 className="font-semibold text-foreground">{title}</h3>
          </Button>
        ) : (
          <h3 className="min-w-0 flex-1 font-semibold text-foreground">
            {title}
          </h3>
        )}

        {copyText && onCopy ? (
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            ariaLabel={copyLabel}
            tooltip={copyLabel}
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void onCopy(copyText);
            }}
          />
        ) : null}
      </div>

      {showBody ? children : null}
    </Card>
  );
}

export default function ModalErrorDebug() {
  const clipboardService = ClipboardService.getInstance();
  const preClassName =
    'mt-2 max-h-48 overflow-y-auto border border-border bg-background text-foreground/85';

  const [errorInfo, setErrorInfo] = useState<IErrorDebugInfo | null>(null);
  const [isResponseExpanded, setIsResponseExpanded] = useState(true);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [didCopyAgent, setDidCopyAgent] = useState(false);
  const { refresh } = useRouter();

  useEffect(() => {
    const existing = getErrorDebugInfo();
    if (existing) {
      setErrorInfo(existing);
    }
    return subscribe((info) => setErrorInfo(info));
  }, []);

  const handleModalClosed = () => {
    setErrorInfo(null);
    clearErrorDebugInfo();
    setIsResponseExpanded(true);
    setIsStackExpanded(false);
    setIsContextExpanded(false);
    setDidCopyAgent(false);
  };

  const handleCopyText = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }
      await clipboardService.copyToClipboard(text);
    },
    [clipboardService],
  );

  const handleCopyForAgent = useCallback(async () => {
    if (!errorInfo) {
      return;
    }
    await handleCopyText(formatErrorDebugForAgent(errorInfo));
    setDidCopyAgent(true);
    window.setTimeout(() => setDidCopyAgent(false), 2000);
  }, [errorInfo, handleCopyText]);

  const requestCopy = errorInfo ? formatErrorDebugRequest(errorInfo) : '';
  const responseCopy = errorInfo ? formatErrorDebugResponse(errorInfo) : '';
  const contextCopy = errorInfo ? formatErrorDebugContext(errorInfo) : '';

  const summary = errorInfo ? resolveErrorDebugSummary(errorInfo) : null;

  return (
    <Modal
      id={ModalEnum.ERROR_DEBUG}
      title="Request failed"
      isError
      error={summary}
      onClose={handleModalClosed}
      modalBoxClassName="rounded-xl"
    >
      {errorInfo && (
        <>
          <div className="space-y-3 text-foreground">
            <ErrorSection
              title="Request"
              copyText={requestCopy}
              copyLabel="Copy request"
              onCopy={handleCopyText}
            >
              <div className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                {errorInfo.url && (
                  <>
                    <span className="text-muted-foreground">URL</span>
                    <span
                      className="truncate font-mono text-foreground"
                      title={errorInfo.url}
                    >
                      {errorInfo.url}
                    </span>
                  </>
                )}

                {errorInfo.method && (
                  <>
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-mono uppercase">
                      {errorInfo.method}
                    </span>
                  </>
                )}

                {errorInfo.status && (
                  <>
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-mono">
                      {errorInfo.status} {errorInfo.statusText || ''}
                    </span>
                  </>
                )}

                {errorInfo.errorCode && (
                  <>
                    <span className="text-muted-foreground">Code</span>
                    <span className="font-mono">{errorInfo.errorCode}</span>
                  </>
                )}

                <span className="text-muted-foreground">Time</span>
                <span className="font-mono text-xs">{errorInfo.timestamp}</span>
              </div>
            </ErrorSection>

            {responseCopy ? (
              <ErrorSection
                title="Response"
                isExpanded={isResponseExpanded}
                onToggle={() => setIsResponseExpanded(!isResponseExpanded)}
                copyText={responseCopy}
                copyLabel="Copy response"
                onCopy={handleCopyText}
              >
                {isResponseExpanded ? (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {responseCopy}
                  </Pre>
                ) : null}
              </ErrorSection>
            ) : null}

            {errorInfo.stack ? (
              <ErrorSection
                title="Stack"
                isExpanded={isStackExpanded}
                onToggle={() => setIsStackExpanded(!isStackExpanded)}
                copyText={errorInfo.stack}
                copyLabel="Copy stack"
                onCopy={handleCopyText}
              >
                {isStackExpanded ? (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {errorInfo.stack}
                  </Pre>
                ) : null}
              </ErrorSection>
            ) : null}

            {contextCopy ? (
              <ErrorSection
                title="Context"
                isExpanded={isContextExpanded}
                onToggle={() => setIsContextExpanded(!isContextExpanded)}
                copyText={contextCopy}
                copyLabel="Copy context"
                onCopy={handleCopyText}
              >
                {isContextExpanded ? (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {contextCopy}
                  </Pre>
                ) : null}
              </ErrorSection>
            ) : null}
          </div>

          <ModalActions className="mt-4">
            <Button
              label="Reload"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.LG}
              className="md:h-9 md:px-4 md:py-2"
              onClick={() => {
                handleCancel();
                refresh();
              }}
            />

            {errorInfo.errorCode === 'ERROR_BOUNDARY' && errorInfo.onRetry ? (
              <Button
                label="Try Again"
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.LG}
                className="md:h-9 md:px-4 md:py-2"
                onClick={() => {
                  errorInfo.onRetry?.();
                  handleCancel();
                }}
              />
            ) : null}

            <Button
              label={didCopyAgent ? 'Copied for agent' : 'Copy for agent'}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.LG}
              className="md:h-9 md:gap-2 md:px-4 md:py-2"
              icon={
                didCopyAgent ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )
              }
              onClick={() => {
                void handleCopyForAgent();
              }}
            />
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
