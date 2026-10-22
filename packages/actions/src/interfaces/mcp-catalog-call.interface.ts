export type McpCatalogCanonicalName = 'check_channel' | 'upload_media';

export type McpCatalogOperation =
  | {
      canonicalName: 'check_channel';
      action: 'capabilities';
      executionName: 'get_scheduler_capabilities';
    }
  | {
      canonicalName: 'check_channel';
      action: 'validate';
      executionName: 'validate_scheduler_target';
    }
  | {
      canonicalName: 'upload_media';
      action: 'request';
      executionName: 'request_media_upload';
    }
  | {
      canonicalName: 'upload_media';
      action: 'complete';
      executionName: 'complete_media_upload';
    };

export type ResolvedMcpCatalogCall = McpCatalogOperation & {
  requestedName: string;
  arguments: Record<string, unknown>;
};
