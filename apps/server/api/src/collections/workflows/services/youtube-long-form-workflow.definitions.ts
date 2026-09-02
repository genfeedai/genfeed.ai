import { WORKFLOW_ARTIFACT_ACTION_IDS } from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import {
  YOUTUBE_LONG_FORM_ACTION_IDS,
  YOUTUBE_LONG_FORM_OUTPUT_TYPES,
  YOUTUBE_LONG_FORM_WORKFLOW_ID,
  YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID,
} from '@api/collections/workflows/services/youtube-long-form-workflow.constants';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export function registerYoutubeLongFormWorkflowDefinitions(
  runner: SystemWorkflowRunnerService,
): void {
  runner.registerWorkflow({
    canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
    changeSummary:
      'Resolve YouTube once, keep processing media ephemeral, transform the transcript, and persist only authenticated account output.',
    definition: {
      edges: [
        {
          id: 'source-to-extraction',
          source: 'resolve-source',
          target: 'extract-audio',
          targetHandle: 'source',
        },
        {
          id: 'transcript-to-transform',
          source: 'transcribe-audio',
          target: 'transform-text',
          targetHandle: 'transcript',
        },
        {
          id: 'audio-to-register',
          source: 'extract-audio',
          sourceHandle: 'audioStorageKey',
          target: 'register-audio',
          targetHandle: 'storageKey',
        },
        {
          id: 'source-to-register',
          source: 'extract-audio',
          sourceHandle: 'sourceStorageKey',
          target: 'register-source',
          targetHandle: 'storageKey',
        },
        {
          id: 'source-metadata-to-register',
          source: 'extract-audio',
          sourceHandle: 'sourceArtifactMetadata',
          target: 'register-source',
          targetHandle: 'metadata',
        },
        {
          id: 'extraction-to-transcription',
          source: 'extract-audio',
          target: 'transcribe-audio',
          targetHandle: 'media',
        },
        {
          id: 'audio-registration-to-transcription',
          source: 'register-audio',
          target: 'transcribe-audio',
          targetHandle: 'audioArtifact',
        },
        {
          id: 'source-registration-to-transcription',
          source: 'register-source',
          target: 'transcribe-audio',
          targetHandle: 'sourceArtifact',
        },
        {
          id: 'transform-to-persist',
          source: 'transform-text',
          target: 'persist-output',
          targetHandle: 'document',
        },
        {
          id: 'audio-registration-to-persist',
          source: 'register-audio',
          target: 'persist-output',
          targetHandle: 'audioArtifact',
        },
        {
          id: 'source-registration-to-persist',
          source: 'register-source',
          target: 'persist-output',
          targetHandle: 'sourceArtifact',
        },
      ],
      inputVariables: [
        {
          description: 'Public YouTube video URL with spoken audio.',
          key: 'youtubeUrl',
          label: 'YouTube URL',
          required: true,
          type: 'url',
        },
        {
          defaultValue: 'article',
          description: 'Long-form output format to persist.',
          key: 'outputType',
          label: 'Output format',
          required: true,
          type: 'enum',
          validation: { options: [...YOUTUBE_LONG_FORM_OUTPUT_TYPES] },
        },
        {
          defaultValue: 'account',
          key: 'persistence',
          label: 'Persistence',
          required: true,
          type: 'string',
          validation: { options: ['account', 'preview'] },
        },
        {
          defaultValue: 'ttl',
          key: 'retentionPolicy',
          label: 'Source retention policy',
          required: true,
          type: 'string',
          validation: { options: ['terminal', 'ttl'] },
        },
        {
          key: 'brandId',
          label: 'Brand ID',
          required: false,
          type: 'string',
        },
      ],
      nodes: [
        actionNode(
          'resolve-source',
          YOUTUBE_LONG_FORM_ACTION_IDS.RESOLVE_SOURCE,
          'Resolve YouTube source',
          ['youtubeUrl'],
          0,
        ),
        actionNode(
          'extract-audio',
          YOUTUBE_LONG_FORM_ACTION_IDS.EXTRACT_AUDIO,
          'Extract YouTube audio',
          [],
          280,
        ),
        actionNode(
          'register-audio',
          WORKFLOW_ARTIFACT_ACTION_IDS.REGISTER,
          'Register temporary audio',
          [],
          560,
          {
            kind: 'audio',
            producerNodeId: 'extract-audio',
            retentionPolicy: 'terminal',
          },
        ),
        actionNode(
          'register-source',
          WORKFLOW_ARTIFACT_ACTION_IDS.REGISTER,
          'Register temporary source video',
          ['retentionPolicy'],
          560,
          { kind: 'source-video', producerNodeId: 'extract-audio' },
        ),
        actionNode(
          'transcribe-audio',
          YOUTUBE_LONG_FORM_ACTION_IDS.TRANSCRIBE_AUDIO,
          'Transcribe YouTube audio',
          [],
          840,
        ),
        actionNode(
          'transform-text',
          YOUTUBE_LONG_FORM_ACTION_IDS.TRANSFORM_TEXT,
          'Transform long-form text',
          ['outputType'],
          1120,
        ),
        actionNode(
          'persist-output',
          YOUTUBE_LONG_FORM_ACTION_IDS.PERSIST_OUTPUT,
          'Persist selected output',
          ['brandId', 'persistence'],
          1400,
        ),
      ],
    },
    description:
      'Transforms one public YouTube video into a preview or tenant-owned long-form text output.',
    label: 'YouTube to Long-form Text',
    resultNodeId: 'persist-output',
    version: 2,
  });

  runner.registerWorkflow({
    canonicalId: YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID,
    changeSummary:
      'Promote one explicitly selected YouTube source into the authenticated tenant Library.',
    definition: {
      edges: [
        {
          id: 'plan-to-promotion',
          source: 'plan-source-asset',
          sourceHandle: 'ingredientId',
          target: 'promote-artifact',
          targetHandle: 'targetId',
        },
        {
          id: 'promotion-to-asset',
          source: 'promote-artifact',
          sourceHandle: 'targetId',
          target: 'create-source-asset',
          targetHandle: 'ingredientId',
        },
      ],
      inputVariables: [
        {
          key: 'artifactId',
          label: 'Source artifact ID',
          required: true,
          type: 'string',
        },
      ],
      nodes: [
        actionNode(
          'plan-source-asset',
          YOUTUBE_LONG_FORM_ACTION_IDS.PLAN_SOURCE_LIBRARY_ASSET,
          'Plan source Library asset',
          ['artifactId'],
          0,
        ),
        actionNode(
          'promote-artifact',
          WORKFLOW_ARTIFACT_ACTION_IDS.PROMOTE,
          'Retain source artifact',
          ['artifactId'],
          280,
          { targetType: 'ingredient' },
        ),
        actionNode(
          'create-source-asset',
          YOUTUBE_LONG_FORM_ACTION_IDS.CREATE_SOURCE_LIBRARY_ASSET,
          'Create source Library asset',
          ['artifactId'],
          560,
        ),
      ],
    },
    description:
      'Promotes one retained YouTube source from a completed long-form execution into the tenant Library.',
    label: 'YouTube Source to Library',
    resultNodeId: 'create-source-asset',
    version: 1,
  });
}

function actionNode(
  id: string,
  actionId: string,
  label: string,
  inputVariableKeys: string[],
  x: number,
  parameters?: Record<string, unknown>,
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    label,
    parameters,
    position: { x, y: 120 },
  });
}
