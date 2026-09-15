packages: agent, actions

Preserve required Agent approvals in every mode. Generation reviews use current
organization-validated model estimates and persist approval or decline on the
original conversation action. Agent mode changes save the thread and user default
atomically, and new conversations inherit the saved default.
