export const RELAY_VERSION = '0.7-contract';

export const READ_TOOLS = Object.freeze(new Set([
  'status',
  'files_list',
  'files_stat',
  'files_read',
  'files_search',
  'browser_read_url',
]));

const ID_RE = /^[A-Za-z0-9._-]{1,120}$/;
const CHAT_ID_RE = /^[A-Za-z0-9-]{8,}$/;
const MAX_MESSAGE_CHARS = 6000;
const MAX_TTL = 4;

export function assertId(value, name = 'id') {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new Error(`${name} must match ${ID_RE}`);
  }
  return value;
}

export function assertChatId(value) {
  if (typeof value !== 'string' || !CHAT_ID_RE.test(value)) {
    throw new Error('target_chat_id is invalid');
  }
  return value;
}

export function assertTtl(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TTL) {
    throw new Error(`ttl must be an integer from 1 to ${MAX_TTL}`);
  }
  return value;
}

export function validateReadRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('request must be an object');
  const id = assertId(request.id);
  if (request.op !== 'local_read') throw new Error('op must be local_read');
  if (!READ_TOOLS.has(request.tool)) throw new Error('tool is not on the read-only allowlist');
  const args = request.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  if ('command' in args || 'shell' in args || 'executable' in args || 'argv' in args) {
    throw new Error('process execution fields are forbidden');
  }
  return {id, op: 'local_read', tool: request.tool, arguments: structuredClone(args)};
}

export function makeDispatchEnvelope({id, target_chat_id, message, ttl = 1, origin_chat_id = null}) {
  assertId(id);
  assertChatId(target_chat_id);
  assertTtl(ttl);
  if (origin_chat_id != null) assertChatId(origin_chat_id);
  if (typeof message !== 'string' || message.length < 1 || message.length > MAX_MESSAGE_CHARS) {
    throw new Error(`message must be 1..${MAX_MESSAGE_CHARS} characters`);
  }
  return Object.freeze({
    protocol: 'ktbus-chat-dispatch-v1',
    dispatch_id: id,
    origin_chat_id,
    target_chat_id,
    ttl,
    message,
  });
}

export function forwardEnvelope(envelope, nextTargetChatId) {
  if (!envelope || envelope.protocol !== 'ktbus-chat-dispatch-v1') throw new Error('invalid envelope');
  if (envelope.ttl <= 1) throw new Error('dispatch ttl exhausted');
  return makeDispatchEnvelope({
    id: envelope.dispatch_id,
    origin_chat_id: envelope.origin_chat_id,
    target_chat_id: nextTargetChatId,
    ttl: envelope.ttl - 1,
    message: envelope.message,
  });
}

export class ReplayWindow {
  constructor(limit = 800) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be positive');
    this.limit = limit;
    this.ids = new Set();
  }

  claim(id) {
    assertId(id);
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    while (this.ids.size > this.limit) {
      this.ids.delete(this.ids.values().next().value);
    }
    return true;
  }
}
