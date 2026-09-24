packages: props

Remove `@genfeedai/props/layout/workspace-snapshot-section.props`, including
`WorkspaceSnapshotSectionProps` and `WorkspaceSnapshotSummaryItem`, alongside
the unused app snapshot component. No repository consumers remain. Local
extensions importing these types should remove the obsolete snapshot integration
or define their own view-specific props; there is no replacement shared API.
