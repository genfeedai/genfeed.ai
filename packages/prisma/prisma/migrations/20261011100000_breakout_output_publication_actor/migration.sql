-- Nullable server-owned capture of the member or key that scheduled a breakout output. Existing outputs stay unbound and publish only through their generating actor.
ALTER TABLE "breakout_response_outputs" ADD COLUMN "publicationActor" JSONB;
