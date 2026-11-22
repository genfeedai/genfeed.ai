/**
 * Atomic consume step for Better Auth's rate-limit counter.
 *
 * KEYS[1] counter key. ARGV: now (ms), window (ms), max, ttl (s), identity.
 * Stores `{ count, key, lastRequest }` as JSON with the TTL refreshed on every
 * write. A missing, expired or malformed value starts a new window at 1.
 * Returns `{ allowed (1 or 0), retryAfter (s) }`.
 */
export const CONSUME_RATE_LIMIT_SCRIPT = `
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local count = nil
local last = nil
local raw = redis.call('GET', KEYS[1])
if raw then
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == 'table'
    and type(parsed.count) == 'number'
    and type(parsed.lastRequest) == 'number' then
    count = parsed.count
    last = parsed.lastRequest
  end
end
if count == nil or now - last >= windowMs then
  count = 0
elseif count >= max then
  return {0, math.ceil((last + windowMs - now) / 1000)}
end
redis.call('SET', KEYS[1], cjson.encode({count = count + 1, key = ARGV[5], lastRequest = now}), 'EX', ttl)
return {1, 0}
`;
