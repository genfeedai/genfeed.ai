packages: contracts, pages, ui

Music settings now use the selected model's capability contract. Pass the model
key to `getStudioDurations('music', modelKey)`; omitted, Auto, unknown, and
unsupported model keys return no duration options. Replace imports of
`STUDIO_MUSIC_DURATIONS` and `GENERATION_SETUP_MUSIC_DURATION_OPTIONS_SECONDS`
with the shared `resolveMusicSettings` resolver. Non-music duration behavior is
unchanged.

`normalizeMusicSettings` reconciles duration, instrumental mode, and lyrics.
Music generation payload duration is optional: Lyria 3 Pro and Mureka do not
accept requested duration. MusicGen values snap to the offered 5–30 second grid;
Eleven Music retains the offered 10–90 second grid. Clear unsupported fields
when changing or restoring a model. Preserve supported lyrics while editing and
trim them only when constructing a generation request.

Self-hosters must configure Mureka with an absolute HTTPS base URL without URL
credentials, query, or fragment. Authenticated redirects are disabled. This
change does not activate Mureka or establish live provider/playback acceptance.
