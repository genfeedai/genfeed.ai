packages: @genfeedai/serializers @genfeedai/contracts @genfeedai/contracts/constants

Add `LiveSessionSerializer` plus live-session JSON:API attributes/config for
the ceiling-reserved realtime session resource.

Contracts gain the live-session workload/ceiling constants, status enums,
MiniMax H3 Max Director catalog key, and the `interactive_session`
generation-brief exemption reason. Realtime director models are enumerated
exemptions, not one-shot video compilers (session ceilings go to 900s;
capability duration is capped at 300s).

Existing serializer consumers keep compiling. Brief compilers treat Director
as exempt; live-session open/terminate remains the billing path.
