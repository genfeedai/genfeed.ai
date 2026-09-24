packages: @genfeedai/agent @genfeedai/helpers @genfeedai/services @genfeedai/props @genfeedai/contracts

Onboarding now delivers a brand image and tweet before account connection. The agent prompt bar accepts a separate composer banner, empty-state props support a docked composer, and content preview cards dispatch live review actions. The toolbar no longer exposes the duplicate workspace-shortcut dropdown; consumers should use slash commands.

The helpers package exports normalizeBrandAudience from @genfeedai/helpers/brand-audience.helper for stored string or array audiences. Brand rename voice configuration now accepts audience as string[], matching IBrandAgentConfig; callers sending a single audience should wrap it in an array.

Brand form props replace separate organization name and change callback with step, canContinue, and onBack. The single brand name is also the initial workspace name. Profile selector props add optional disabled state; header props expose the current step. Personal email domain exclusions include additional consumer-provider aliases so their websites are not suggested as company websites.
