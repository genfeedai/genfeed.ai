packages: @genfeedai/contracts

Add `OrgAndPersonalContentMemoryRetrievalParams` to
`@genfeedai/contracts/interfaces` (knowledge-base). It backs automatic
chat-retrieval grounding for an agent thread that has no validated brand:
organization-scope Knowledge plus the acting user's own personal-scope
Knowledge, via `ContextsService.retrieveOrgAndPersonalContentMemory`.
