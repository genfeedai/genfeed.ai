CREATE FUNCTION capture_credential_connected_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."isConnected" THEN NEW."connectedAt" := COALESCE(NEW."connectedAt", CURRENT_TIMESTAMP); END IF;
  ELSIF NEW."isConnected" AND NOT OLD."isConnected" THEN
    NEW."connectedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER credential_connected_at BEFORE INSERT OR UPDATE OF "isConnected"
ON credentials FOR EACH ROW EXECUTE FUNCTION capture_credential_connected_at();
