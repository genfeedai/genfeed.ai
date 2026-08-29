'use client';

import { Suspense } from 'react';
import BatchComposer from './BatchComposer';
import BatchDetail from './BatchDetail';
import BatchPageHeader from './BatchPageHeader';
import { useBatchWorkflowPage } from './useBatchWorkflowPage';

function BatchWorkflowPageContent() {
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

  return (
    <div className="min-h-screen bg-background">
      <BatchPageHeader
        activeBatchStatus={activeBatchStatus}
        onBackToComposer={handleBackToComposer}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {(isBootstrapping || isLoadingExecution) && (
          <div className="mb-6 rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground shadow-border">
            {isLoadingExecution
              ? 'Loading batch execution…'
              : 'Loading workflows and recent executions…'}
          </div>
        )}

        {activeBatchStatus ? (
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
            recentExecutions={recentExecutions}
            workflowsById={workflowsById}
            onOpenRecentExecution={handleOpenRecentExecution}
          />
        )}
      </main>
    </div>
  );
}

export default function BatchWorkflowPage() {
  return (
    <Suspense fallback={null}>
      <BatchWorkflowPageContent />
    </Suspense>
  );
}
