'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Container from '@ui/layout/container/Container';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import BatchComposer from './BatchComposer';
import BatchDetail from './BatchDetail';
import BatchHistoryList from './BatchHistoryList';
import {
  batchCollectionHeaderTabs,
  isBatchHistoryPath,
} from './batch-collection-tabs';
import { useBatchWorkflowPage } from './useBatchWorkflowPage';

function BatchWorkflowPageContent() {
  const pathname = usePathname();
  const { href } = useOrgUrl();
  const t = useTranslations('pages.studioBatch');
  const isHistory = isBatchHistoryPath(pathname ?? '');
  const {
    activeBatchStatus,
    availableOutputs,
    canRunBatch,
    clearFiles,
    error,
    files,
    getInputProps,
    getRootProps,
    handleBackToComposer,
    handleDownload,
    handleOpenInLibrary,
    handleOpenRecentExecution,
    handlePublish,
    handleRunBatch,
    hasPendingUploads,
    isDragActive,
    isBootstrapping,
    isLoadingExecution,
    isRunningBulkAction,
    isStartingBatch,
    openPostBatchModal,
    push,
    recentExecutions,
    requestedExecutionId,
    removeFile,
    selectedOutputIds,
    selectedOutputs,
    selectedWorkflowId,
    setSelectedOutputIds,
    setSelectedWorkflowId,
    toggleOutputSelection,
    workflowsById,
    workflows,
  } = useBatchWorkflowPage();

  const showDetail =
    isHistory &&
    Boolean(
      requestedExecutionId &&
        activeBatchStatus &&
        activeBatchStatus.id === requestedExecutionId,
    );

  return (
    <Container
      headerTabs={batchCollectionHeaderTabs(href)}
      label={t('title')}
      titleVisibility="sr-only"
    >
      {error ? (
        <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {(isBootstrapping || isLoadingExecution) && (
        <div className="mb-6 rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground shadow-border">
          {isLoadingExecution ? t('loadingExecution') : t('loadingWorkflows')}
        </div>
      )}

      {showDetail && activeBatchStatus ? (
        <BatchDetail
          activeBatchStatus={activeBatchStatus}
          availableOutputs={availableOutputs}
          selectedOutputs={selectedOutputs}
          selectedOutputIds={selectedOutputIds}
          isRunningBulkAction={isRunningBulkAction}
          workflowsById={workflowsById}
          onBackToComposer={handleBackToComposer}
          onSelectAll={() =>
            setSelectedOutputIds(
              new Set(availableOutputs.map(({ item }) => item.id)),
            )
          }
          onClearSelection={() => setSelectedOutputIds(new Set())}
          onDownload={handleDownload}
          onPublish={handlePublish}
          onOpenInLibrary={handleOpenInLibrary}
          onToggleOutputSelection={toggleOutputSelection}
          onNavigate={push}
          onOpenPostModal={openPostBatchModal}
        />
      ) : isHistory ? (
        <BatchHistoryList
          recentExecutions={recentExecutions}
          workflowsById={workflowsById}
          onOpenRecentExecution={handleOpenRecentExecution}
        />
      ) : (
        <BatchComposer
          workflows={workflows}
          selectedWorkflowId={selectedWorkflowId}
          onWorkflowChange={setSelectedWorkflowId}
          files={files}
          batchRunState={{ canRun: canRunBatch, isStarting: isStartingBatch }}
          onRunBatch={() => void handleRunBatch()}
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          dropzoneState={{ hasPendingUploads, isDragActive }}
          onClearFiles={clearFiles}
          onRemoveFile={removeFile}
        />
      )}
    </Container>
  );
}

export default function BatchWorkflowPage() {
  return (
    <Suspense fallback={null}>
      <BatchWorkflowPageContent />
    </Suspense>
  );
}
