packages: actions, agent, contracts, pages, ui

Image/video generation and prompt enhancement accept optional requestedSkillSlugs.
Studio generation hooks, agent cards, tool schemas, and Studio handoffs preserve
these selections through the shared server resolver. Existing callers may omit
the field. Explicit selections must resolve to accessible, active, compatible
skills with complete instructions; invalid or unavailable selections fail instead
of silently falling back to generation without the selected guidance.

useStudioPromptEnhancement accepts an optional image/video contentType. Callers
that know the current modality should supply it, especially when the model is Auto
or empty. Existing callers retain model-based inference. Reusable enhanced prompt
IDs are scoped to modality as well as the selected skills and generation context.
Studio removes recognized skill command tokens from submitted prompt text and
forwards their slugs separately; removing a token removes its temporary selection.

No database migration or mandatory caller migration is required.
