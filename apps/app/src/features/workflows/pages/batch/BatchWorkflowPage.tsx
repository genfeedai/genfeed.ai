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
    handleOpenRecentJob,
    handlePublish,
    handleRunBatch,
    hasPendingUploads,
    isDragActive,
    isBootstrapping,
    isLoadingJob,
    isRunningBulkAction,
    isStartingBatch,
    openPostBatchModal,
    push,
    recentJobs,
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
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {(isBootstrapping || isLoadingJob) && (
          <div className="mb-6 rounded-xl border border-white/10 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
            {isLoadingJob
              ? 'Loading batch job…'
              : 'Loading workflows and recent jobs…'}
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
                new Set(availableOutputs.map(({ item }) => item._id)),
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
            recentJobs={recentJobs}
            workflowsById={workflowsById}
            onOpenRecentJob={handleOpenRecentJob}
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
