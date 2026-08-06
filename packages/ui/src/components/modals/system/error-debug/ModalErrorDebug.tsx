'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  ModalEnum,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { IErrorDebugInfo } from '@genfeedai/interfaces/modals/error-debug.interface';
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
import { Button } from '@ui/primitives/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

interface ErrorSectionProps {
  children?: ReactNode;
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function handleCancel(): void {
  closeModal(ModalEnum.ERROR_DEBUG);
}

function ErrorSection({
  children,
  title,
  isExpanded,
  onToggle,
}: ErrorSectionProps) {
  return (
    <Card
      variant={CardVariant.DEFAULT}
      // Nested sections stay neutral so the outer destructive shell is the
      // only strong status signal (avoids red-on-red mud).
      className="rounded-lg border border-border bg-background-secondary hover:border-border"
      bodyClassName="gap-0 p-4"
    >
      {onToggle ? (
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="font-semibold text-foreground">{title}</h3>
        </Button>
      ) : (
        <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
      )}

      {children}
    </Card>
  );
}

export default function ModalErrorDebug() {
  const clipboardService = ClipboardService.getInstance();
  const preClassName =
    'mt-2 max-h-48 overflow-y-auto border border-border bg-background text-foreground/85';

  const [errorInfo, setErrorInfo] = useState<IErrorDebugInfo | null>(null);
  const [isResponseExpanded, setIsResponseExpanded] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const { refresh } = useRouter();

  useEffect(() => {
    const existing = getErrorDebugInfo();
    if (existing) {
      setErrorInfo(existing);
    }
    return subscribe((info) => setErrorInfo(info));
  }, []);

  // Called by Modal's onClose after modal is closed - cleanup state
  const handleModalClosed = () => {
    setErrorInfo(null);
    clearErrorDebugInfo();
    setIsResponseExpanded(false);
    setIsStackExpanded(false);
    setIsContextExpanded(false);
  };

  const handleCopy = async () =>
    await clipboardService.copyToClipboard(errorInfo?.message || '');

  return (
    <Modal
      id={ModalEnum.ERROR_DEBUG}
      title="Request failed"
      isError
      error={errorInfo?.message}
      onClose={handleModalClosed}
      // Shell styling is owned by Modal isError — don't wash the whole box red.
      modalBoxClassName="rounded-xl"
    >
      {errorInfo && (
        <>
          <div className="space-y-3 text-foreground">
            <ErrorSection title="Request">
              <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
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

            {errorInfo.response?.data !== undefined ? (
              <ErrorSection
                title="Response"
                isExpanded={isResponseExpanded}
                onToggle={() => setIsResponseExpanded(!isResponseExpanded)}
              >
                {isResponseExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {JSON.stringify(errorInfo.response.data, null, 2)}
                  </Pre>
                )}
              </ErrorSection>
            ) : null}

            {errorInfo.stack && (
              <ErrorSection
                title="Stack"
                isExpanded={isStackExpanded}
                onToggle={() => setIsStackExpanded(!isStackExpanded)}
              >
                {isStackExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {errorInfo.stack}
                  </Pre>
                )}
              </ErrorSection>
            )}

            {errorInfo.context && Object.keys(errorInfo.context).length > 0 && (
              <ErrorSection
                title="Context"
                isExpanded={isContextExpanded}
                onToggle={() => setIsContextExpanded(!isContextExpanded)}
              >
                {isContextExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {JSON.stringify(errorInfo.context, null, 2)}
                  </Pre>
                )}
              </ErrorSection>
            )}
          </div>

          <ModalActions className="mt-4">
            {errorInfo.errorCode === 'ERROR_BOUNDARY' && errorInfo.onRetry && (
              <Button
                label="Try Again"
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.LG}
                className="bg-warning text-warning-foreground hover:bg-warning/90 md:h-9 md:px-4 md:py-2"
                onClick={() => {
                  errorInfo.onRetry?.();
                  handleCancel();
                }}
              />
            )}

            <Button
              label="Copy"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.LG}
              className="md:h-9 md:px-4 md:py-2"
              onClick={handleCopy}
            />

            <Button
              label="Reload"
              variant={ButtonVariant.DESTRUCTIVE}
              size={ButtonSize.LG}
              className="md:h-9 md:px-4 md:py-2"
              onClick={() => {
                handleCancel();
                refresh();
              }}
            />
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
