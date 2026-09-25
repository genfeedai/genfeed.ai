packages: @genfeedai/actions, @genfeedai/agent, @genfeedai/hooks, @genfeedai/integrations, @genfeedai/models, @genfeedai/services

Agent strategy runs carry an execution id and a performance snapshot. The
workflow-execution hook accepts the customer activity filters. Bot
integrations can bind an agent report channel and submit an approve or
reject decision. Post models expose the workflow execution and review
decision used by that loop. Workflow actions now include agent report
delivery for Discord, email, and Telegram.
