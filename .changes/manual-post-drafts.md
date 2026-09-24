packages: @genfeedai/contracts @genfeedai/client @genfeedai/services @genfeedai/props @genfeedai/ui

Post creation accepts a platform and an explicit workspace brand without a credential for drafts. Scheduling and publishing still require an account. Post and thread modal schemas accept account-free drafts. PostsService.generateDraftText accepts a prompt, platform, format, and required brandId and returns editable text without saving or publishing. ModalPost accepts defaultPlatform for channel-specific draft entry points.
