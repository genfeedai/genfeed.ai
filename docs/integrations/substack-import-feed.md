# Substack newsletter import feed

Genfeed exposes each brand's published newsletter archive as a generic RSS 2.0
feed that Substack can read through its post importer:

```text
https://api.genfeed.ai/v1/public/rss/brands/{brandId}/newsletters
```

Paste that URL into Substack's **Import posts** flow. Substack performs the
import; Genfeed does not connect to a private Substack API, create a Substack
publish target, or schedule Substack delivery.

## Feed contract

Each item contains the newsletter title, summary, complete sanitized HTML body,
publication timestamp, a canonical public URL, and a GUID in this form:

```text
urn:genfeed:newsletter:{newsletterId}
```

The GUID depends only on the canonical Genfeed newsletter ID. Updating or
republishing the same record changes its body but never its import identity.
Items are ordered by publication time and then by ID, so the same database
state produces the same archive order. The feed returns the complete eligible
archive rather than a moving pagination window.

## Visibility policy

Only newsletters that meet every condition below enter the feed or resolve at
their canonical public URL:

- `status` is `published`;
- `publishedAt` is present;
- the owning brand exists and is not soft-deleted;
- the record is not soft-deleted; and
- the body is non-empty.

Draft, review, approved, archived, deleted, and empty newsletters are excluded.
The current newsletter record does not model a paid tier, so paid content is
not supported by this public feed. If paid or protected newsletter visibility
is added later, it must remain ineligible here unless a separate safe summary
policy is introduced and covered by the feed contract tests.

Substack's current importer instructions are documented in its
[official import guide](https://support.substack.com/hc/en-us/articles/360037830351-How-do-I-import-my-posts-from-another-platform-such-as-Mailchimp-WordPress-Medium-or-Ghost).
