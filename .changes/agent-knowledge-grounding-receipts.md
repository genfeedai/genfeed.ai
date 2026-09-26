packages: @genfeedai/agent @genfeedai/pages @genfeedai/props @genfeedai/contracts/interfaces

Agent draft cards carry `knowledgeReceipts` (`AgentUiAction.knowledgeReceipts`
in the agent model and contracts) and render them with the new
`KnowledgeReceiptList` component. `BrandKnowledgeSelection` joins
`@props/content/knowledge-library.props`.

The unused `@genfeedai/pages/agent` entry (`AgentPageContent`) is removed; the
live Agent workspace mounts the Knowledge picker itself.
