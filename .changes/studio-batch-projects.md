packages: @genfeedai/contracts, @genfeedai/serializers

Studio Batch projects (#5463). Contracts add the BatchProjectKind,
BatchProjectStatus, BatchProjectItemStatus and BatchProjectStep enums, the
IBatchProject / IBatchProjectItem / IBatchProjectScheduledTarget interfaces
with their create, update, items, dispatch, review and schedule inputs, and
API_ENDPOINTS.BATCH_PROJECTS. Serializers add BatchProjectSerializer
(`batch-project`).
