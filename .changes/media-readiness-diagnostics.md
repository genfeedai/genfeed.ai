packages: @genfeedai/serializers

Expose a `media-readiness-diagnostic` serializer for the deterministic
pre-publish media gate. Diagnostics are computed per publish attempt rather
than persisted, so the helper derives a stable id from the violation identity —
the same asset breaking the same rule on the same platform serializes to the
same id across attempts.

`kind` is nullable: an attached asset id that does not resolve inside the
organization has no known media kind, and that case is reported as a blocking
diagnostic rather than passing unchecked.

Additive only. Existing serializer exports are unchanged.
