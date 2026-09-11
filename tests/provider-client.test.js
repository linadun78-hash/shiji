const test = require('node:test');
const assert = require('node:assert/strict');
const { createProviderClient } = require('../src/provider-client');

test('posts a unified chat request to a normalized OpenAI-compatible endpoint', async () => {
  let call;
  const client = createProviderClient({ fetchFn: async (url, options) => {
    call = { url, options };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  } });
  const result = await client.complete({ baseUrl: 'https://api.example/v1/', model: 'demo', apiKey: 'secret', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(result.content, '{"ok":true}');
  assert.equal(call.url, 'https://api.example/v1/chat/completions');
  assert.equal(call.options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(call.options.body).response_format, { type: 'json_object' });
});

test('maps provider status codes to safe stable error codes', async () => {
  const client = createProviderClient({ fetchFn: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota secret' } }) }) });
  await assert.rejects(client.complete({ baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'k', messages: [] }), (error) => error.code === 'provider_rate_limited' && !/quota secret/.test(error.message));
});

test('reports client request rejection separately from network failure', async () => {
  const client = createProviderClient({ fetchFn: async () => ({ ok: false, status: 400, json: async () => ({}) }) });
  await assert.rejects(client.complete({ baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'k', messages: [] }), (error) => error.code === 'provider_bad_request' && /请求参数/.test(error.message));
});

const request = { baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'k', messages: [] };

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

test('default requests time out after 30 seconds with an explicit timeout message', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const client = createProviderClient({ fetchFn: async (_url, options) => {
    signal = options.signal;
    return waitForAbort(signal);
  } });
  const pending = client.complete(request);
  const rejected = assert.rejects(pending, (error) => error.code === 'provider_timeout' && /超时/.test(error.message));
  t.mock.timers.tick(29999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, true);
  await rejected;
});

test('a request can wait 120 seconds without changing the client default', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const client = createProviderClient({ fetchFn: async (_url, options) => {
    signals.push(options.signal);
    return waitForAbort(options.signal);
  } });
  const longRequest = client.complete({ ...request, timeoutMs: 120000 });
  const shortRequest = client.complete(request);
  const longRejected = assert.rejects(longRequest, { code: 'provider_timeout' });
  const shortRejected = assert.rejects(shortRequest, { code: 'provider_timeout' });
  t.mock.timers.tick(30000);
  const longWasAbortedAt30Seconds = signals[0].aborted;
  assert.equal(signals[1].aborted, true);
  t.mock.timers.tick(90000);
  assert.equal(signals[0].aborted, true);
  await longRejected;
  await shortRejected;
  assert.equal(longWasAbortedAt30Seconds, false);
});

test('timing out while reading JSON is not reported as invalid model output', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let readingBody;
  const bodyStarted = new Promise((resolve) => { readingBody = resolve; });
  const client = createProviderClient({ fetchFn: async (_url, { signal }) => ({
    ok: true,
    json: () => { readingBody(); return waitForAbort(signal); },
  }) });
  const rejected = assert.rejects(client.complete(request), (error) => error.code === 'provider_timeout' && /超时/.test(error.message));
  await bodyStarted;
  t.mock.timers.tick(30000);
  await rejected;
});

test('malformed JSON without a timeout is still invalid model output', async () => {
  const client = createProviderClient({ fetchFn: async () => ({
    ok: true, json: async () => { throw new SyntaxError('invalid JSON'); },
  }) });
  await assert.rejects(client.complete(request), { code: 'provider_invalid_response' });
});

test('network failure is distinct from timeout before and after response headers', async () => {
  for (const readingBody of [false, true]) {
    const fail = async () => { throw new TypeError('network failure with private details'); };
    const client = createProviderClient({ fetchFn: readingBody ? async () => ({ ok: true, json: fail }) : fail });
    await assert.rejects(client.complete(request), (error) => error.code === 'provider_network_error' && error.message === '无法连接模型服务');
  }
});

test('successful requests clear their timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const client = createProviderClient({ fetchFn: async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
  } });
  await client.complete(request);
  t.mock.timers.tick(120000);
  assert.equal(signal.aborted, false);
});
