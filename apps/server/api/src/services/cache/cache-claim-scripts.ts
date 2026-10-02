export const CLAIM_CRUN_REQUEST_SLOT_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 10000)
local count = redis.call('ZCARD', KEYS[1])
if count >= 20 then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, tonumber(oldest[2]) + 10000 - now)}
end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('EXPIRE', KEYS[1], 11)
return {1, 0}
`;

export const SET_OWNED_CLAIM_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SETEX', KEYS[2], ARGV[3], ARGV[2])
return 1
`;

export const RELEASE_OWNED_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if #KEYS > 1 then
  redis.call('DEL', KEYS[2])
end
redis.call('DEL', KEYS[1])
return 1
`;
