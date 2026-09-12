packages: @genfeedai/contracts @genfeedai/agent @genfeedai/pages

Add `AgentStudioHandoffPayload` and `AgentStudioHandoffScope` to
`@genfeedai/contracts` (#4670) — the short-lived, organization-scoped payload
an Agent "Open in Studio" trigger hands off (prompt, concrete model, and
applicable image/video/avatar/voice parameters) so Studio generate can open
pre-filled without spending credits or re-prompting.

`@genfeedai/agent` gains `createStudioHandoff`/`consumeStudioHandoff` on
`AgentApiService` (`CreateAgentStudioHandoffParams`,
`CreateAgentStudioHandoffResult`, `ConsumeAgentStudioHandoffResult` types),
and wires an `onOpenInStudio?: (studioUrl: string) => void` slot through
`GenerationActionCard`/`useGenerationActionCard`/`GenerationActionCardControls`/
`GenerationActionCardStatusPanel` — rendered on both the pre-generation
review card and the completed-result card, inert until a host wires actual
navigation.

`@genfeedai/pages` gains the Studio side: `useStudioGenerateHandoff` reads
the `handoff` URL query param once, consumes it (single-use — the server
deletes it on this call), and `StudioGenerateWorkspace` applies the result
through the existing `applyTypeSettings` (which already marks every patched
field `'user'`-owned in the shared setup store, so the prefill takes
precedence over whatever was remembered for that type) plus the composer
prompt and any reference assets. A missing, expired, already-consumed, or
foreign handoff — or any other failure to consume one — falls back to
Studio's usual defaults with a toast, never a blocked page.
