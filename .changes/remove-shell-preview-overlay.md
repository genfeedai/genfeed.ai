packages: @genfeedai/contracts

Remove the `shell-preview` workspace-shell overlay and the typed-reference
machinery that existed only to demonstrate it. `WorkspaceShellOverlayKey` no
longer includes `'shell-preview'`; `WorkspaceShellReferenceKind`,
`WorkspaceShellTypedReference`, `WorkspaceShellOverlayReferenceAccess`,
`WorkspaceShellOverlayReferenceAccessRequest`,
`WorkspaceShellOverlayReferenceAccessResolver`,
`WorkspaceShellOverlayParameterMap`, `WorkspaceShellOverlayParameterContract`,
and `WorkspaceShellOverlayResolution` are deleted. `WorkspaceShellOverlayRequest`
is now a plain `{ key, parameters: Readonly<Record<string, never>> }` instead
of a per-key mapped type, `WorkspaceShellOverlayRegistration` drops its
`parameterContract` field, and `WorkspaceShellRestorationFailure` narrows to
`'invalid_overlay' | 'invalid_thread'` (the reference-specific failure values
can no longer occur). `resolveOverlayReferenceAccess` is removed from
`RestoreWorkspaceShellLocationParams` and `ResolveWorkspaceOverlayLaunchParams`.
`overlayRef` remains a reserved shell query param — any incoming value is now
always stripped during canonicalization rather than parsed.
