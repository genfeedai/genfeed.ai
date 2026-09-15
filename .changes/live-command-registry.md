packages: services contexts

The command palette service exposes subscribeRegistry(listener), returning an
unsubscribe callback. Registrations, removals, and clearing an occupied registry
notify subscribers once per changed batch. The shared provider refreshes visible
results with the active query, so commands registered after opening or searching
appear immediately and removed commands cannot remain selected. Existing
registration ownership and command execution behavior are preserved.
