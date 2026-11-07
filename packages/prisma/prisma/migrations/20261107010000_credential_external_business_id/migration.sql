-- Instagram Unified Login (#9582): the connection is a Business Integration
-- System User token owned by the client's business portfolio, not a Facebook
-- User token reached through a linked Page. The portfolio id is needed to
-- manage that token and tells the two kinds of connection apart. NULL means a
-- Facebook-Login connection (every row that exists today), which keeps working
-- until the brand reconnects.
ALTER TABLE "credentials"
  ADD COLUMN "externalBusinessId" TEXT;
