packages: @genfeedai/config

Add the optional `CONTENT_EVAL_GENFEED_API_KEY` to the API env config and its
schema. The content-eval media ladder (#4926) uses it to generate through the
product API as a dedicated eval organization. It defaults to unset, so
self-hosters and existing deployments need no change.
