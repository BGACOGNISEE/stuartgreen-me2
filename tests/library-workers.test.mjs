import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

const source = readFileSync(new URL("../functions/api/library.js", import.meta.url), "utf8");
const unavailable = { error: "Library records are temporarily unavailable" };
const records = [{ id: "first", title: "Controlled first record" }, { id: "second", title: "Controlled second record" }];

// Production Pages compatibility settings, independently read on 18 October 2026.
// This is test-only configuration, not a Wrangler/Pages deployment override.
const runtime = { compatibilityDate: "2026-04-13", compatibilityFlags: [] };

async function harness(t, upstream, handler = source, endpoint, outboundService) {
  const calls = [];
  const mf = new Miniflare({
    ...runtime,
    // The actual, unmodified Pages handler is a separate workerd ES module.
    modulesRoot: "/",
    modules: [{
      type: "ESModule", path: "/entry.js", contents: `
      import { onRequestGet } from "./library.js";
      export default {
        async fetch(request, env) {
          if (new URL(request.url).pathname === "/native-request") {
            try {
              new Request("https://fixture.invalid/", { redirect: "error" });
              return Response.json({ accepted: true });
            } catch (error) {
              return Response.json({ name: error.name, message: error.message });
            }
          }
          const logs = [];
          const original = console.error;
          console.error = (...args) => logs.push(args);
          try {
            const response = await onRequestGet({ request, env });
            return Response.json({
              status: response.status,
              headers: Object.fromEntries(response.headers),
              body: await response.json(),
              logs,
            });
          } finally { console.error = original; }
        }
      };`,
    }, { type: "ESModule", path: "/library.js", contents: handler }],
    bindings: endpoint ? { LIBRARY_API_URL: endpoint } : {},
    outboundService: outboundService ?? (async request => {
      calls.push({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers) });
      return upstream(request);
    }),
  });
  t.after(() => mf.dispose());
  return { mf, calls };
}

async function invoke(mf, collection = "writing") {
  const response = await mf.dispatchFetch(`https://www.stuartjgreen.me/api/library?collection=${collection}`, {
    headers: {
      Cookie: "private-cookie",
      Authorization: "Bearer private-token",
      "X-Private-Browser": "private-header",
    },
  });
  return response.json();
}

function assertUnavailable(result, status = 502) {
  assert.equal(result.status, status);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers.location, undefined);
  assert.deepEqual(result.body, unavailable);
}

function assertSuccess(result) {
  assert.equal(result.status, 200, JSON.stringify(result.logs));
  assert.equal(result.headers["cache-control"], "no-store");
  assert.deepEqual(result.body, records);
  assert.deepEqual(result.logs, []);
}

test("native workerd Request rejects redirect:error", async t => {
  const { mf, calls } = await harness(t, () => assert.fail("must not fetch"));
  const result = await (await mf.dispatchFetch("https://site.invalid/native-request")).json();
  assert.equal(result.name, "TypeError");
  assert.match(result.message, /redirect/i);
  assert.equal(calls.length, 0);
});

test("both collections succeed through native fetch, without browser credentials", async t => {
  const { mf, calls } = await harness(t, () => Response.json(records));
  for (const collection of ["writing", "publications"]) {
    assertSuccess(await invoke(mf, collection));
    const call = calls.at(-1);
    assert.equal(call.url, `https://asset-risk-manager.replit.app/api/library?collection=${collection}`);
    assert.equal(call.method, "GET");
    assert.equal(call.headers.accept, "application/json");
    for (const name of ["cookie", "authorization", "x-private-browser"]) {
      assert.equal(call.headers[name], undefined);
    }
  }
  assert.equal(calls.length, 2);
});

test("all redirect statuses fail closed and never contact the destination", async t => {
  let status;
  let destinations = 0;
  const { mf, calls } = await harness(t, request => {
    if (new URL(request.url).host === "redirect.invalid") {
      destinations++;
      return Response.json(records);
    }
    return new Response(null, { status, headers: { Location: "https://redirect.invalid/private-location" } });
  });
  for (status of [300, 301, 302, 303, 304, 305, 306, 307, 308]) {
    const result = await invoke(mf);
    assertUnavailable(result);
    assert.equal(result.logs[0][0], "Library proxy upstream error");
    assert.equal(result.logs[0][1].name, "UpstreamHTTPError");
    assert.equal(result.logs[0][1].status, status);
    assert.equal(typeof result.logs[0][1].message, "string");
  }
  assert.equal(destinations, 0);
  assert.equal(calls.length, 9);
});

test("HTTP failures and malformed responses return generic no-store errors with diagnostics", async t => {
  let response;
  const { mf } = await harness(t, () => response());
  for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504]) {
    response = () => new Response("private upstream body", { status, statusText: "Controlled failure" });
    const result = await invoke(mf);
    assertUnavailable(result);
    assert.deepEqual(result.logs, [["Library proxy upstream error", {
      name: "UpstreamHTTPError", message: "Controlled failure", status,
    }]]);
    assert.doesNotMatch(JSON.stringify(result.logs), /private|cookie|authorization/i);
  }
  response = () => new Response("private malformed json");
  const malformed = await invoke(mf);
  assertUnavailable(malformed);
  assert.equal(malformed.logs[0][0], "Library proxy request failed");
  assert.equal(malformed.logs[0][1].name, "SyntaxError");
  assert.equal(malformed.logs[0][1].status, 200);
  response = () => Response.json({ private: "not an array" });
  assertUnavailable(await invoke(mf));
  response = () => new Response(null, { status: 204 });
  assertUnavailable(await invoke(mf));
});

test("validation rejects bad collections and endpoints before any native fetch", async t => {
  const { mf, calls } = await harness(t, () => assert.fail("must not fetch"));
  assertUnavailable(await invoke(mf, "invalid"), 400);
  assert.equal(calls.length, 0);
  for (const endpoint of [
    "http://fixture.invalid/api/library",
    "https://user:password@fixture.invalid/api/library",
    "https://fixture.invalid/other",
    "https://fixture.invalid/api/library?private=1",
    "https://fixture.invalid/api/library#private",
    "https://www.stuartjgreen.me/api/library",
    "not a URL",
  ]) {
    const invalid = await harness(t, () => assert.fail("must not fetch"), source, endpoint);
    assertUnavailable(await invoke(invalid.mf), 503);
    assert.equal(invalid.calls.length, 0);
  }
});

test("native fetch transport failure preserves generic output and error diagnostics", async t => {
  // An IP-literal fixture outside the socket allowlist cannot reach the network.
  // Use an allowlist: workerd's network ACL does not support deny: ["public"].
  const { mf, calls } = await harness(t, null, source, "https://127.0.0.2/api/library", {
    network: { allow: ["127.0.0.1/32"], tlsOptions: { trustBrowserCas: true } },
  });
  const result = await invoke(mf);
  assertUnavailable(result);
  assert.equal(calls.length, 0);
  assert.equal(result.logs[0][0], "Library proxy request failed");
  assert.equal(typeof result.logs[0][1].name, "string");
  assert.equal(typeof result.logs[0][1].message, "string");
  assert.equal(result.logs[0][1].status, null);
});

test("the real 10-second AbortSignal timeout fails closed in workerd", { timeout: 20000 }, async t => {
  const { mf, calls } = await harness(t, async () => {
    await new Promise(resolve => setTimeout(resolve, 11000));
    return Response.json(records);
  });
  const start = performance.now();
  const result = await invoke(mf);
  assertUnavailable(result);
  assert.ok(performance.now() - start >= 9500, "must exercise the real timeout, not an injected exception");
  assert.equal(calls.length, 1);
  assert.equal(result.logs[0][0], "Library proxy request failed");
  assert.equal(result.logs[0][1].name, "TimeoutError");
  assert.equal(result.logs[0][1].status, null);
});

test("isolated redirect:error mutation fails the SAME success assertion before upstream I/O", async t => {
  assert.equal(source.split('redirect: "manual"').length, 2, "mutation must change exactly one option");
  const mutant = source.replace('redirect: "manual"', 'redirect: "error"');
  const { mf, calls } = await harness(t, () => Response.json(records), mutant);
  for (const collection of ["writing", "publications"]) {
    const result = await invoke(mf, collection);
    assert.throws(() => assertSuccess(result), { code: "ERR_ASSERTION" });
    assertUnavailable(result);
    assert.equal(result.logs[0][1].name, "TypeError");
    assert.match(result.logs[0][1].message, /redirect/i);
    assert.equal(result.logs[0][1].status, null);
  }
  assert.equal(calls.length, 0);
});
