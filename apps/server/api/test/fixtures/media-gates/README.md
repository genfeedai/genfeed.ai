# Media gate fixtures

Labelled sets for the media-validation gates of epic #4877. They measure the
gates; they are not production data.

## Anonymisation rules

- No customer media, captions, transcripts, names, handles, URLs or brand
  identifiers. Every row is synthetic or taken from a public-domain source and
  says which in `source`.
- No real person is described. Text rows that must carry harmful language use
  the mildest phrasing that still exercises the category.
- **Image sets are never committed.** Labelled images for sexual, graphic or
  minor-safety categories must not live in a public repository. They are kept
  in an operator-held private bucket and referenced by a local manifest passed
  to the benchmark at run time (#4883).

## `moderation-transcripts.jsonl`

Text rows for the moderation classifier (#4880), scored as `transcript` inputs:

```json
{ "text": "…", "expected": ["harassment"], "source": "synthetic" }
```

`expected` lists every Genfeed `ModerationCategory` the row should flag; an
empty array is a safe row. `sexual_minors` has no text row on purpose — that
category is exercised only through the private image manifest.

Per-category precision and recall come from
`computeModerationCalibration` (`apps/server/api/src/services/moderation`);
#4883's benchmark mode runs this set against the configured provider and prints
them. **No live flip may cite this set alone**: it is a floor for wiring and
regression, sized for coverage, not a statistically meaningful accuracy claim.
