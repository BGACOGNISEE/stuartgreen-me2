import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/api/library.js", import.meta.url), "utf8");
const { onRequestGet } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const request = (collection = "writing") => new Request(
  `https://www.stuartjgreen.me/api/library?collection=${collection}`,
  { headers: { Cookie: "private=not-forwarded", Authorization: "not-forwarded" } },
);
const unavailable = { error: "Library records are temporarily unavailable" };

async function assertFailure(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Location"), null);
  assert.deepEqual(await response.json(), unavailable);
}

test("both collections use Workers-supported manual redirects and preserve records", async (t) => {
  for (const collection of ["writing", "publications"]) {
    await t.test(collection, async (t) => {
      const records = [{ id: "first", year: 2000 }, { id: "second", year: 2026 }];
      const mock = t.mock.method(globalThis, "fetch", async (url, init) => {
        assert.equal(url.origin, "https://asset-risk-manager.replit.app");
        assert.equal(url.pathname, "/api/library");
        assert.equal(url.searchParams.get("collection"), collection);
        assert.equal(init.redirect, "manual");
        assert.deepEqual(init.headers, { Accept: "application/json" });
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);
        return Response.json(records);
      });
      const response = await onRequestGet({ request: request(collection) });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), records);
      assert.equal(mock.mock.callCount(), 1);
    });
  }
});

test("redirects are never followed or returned to visitors", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const status of [301, 302, 303, 307, 308]) {
    await t.test(String(status), async (t) => {
      const mock = t.mock.method(globalThis, "fetch", async (_url, init) => {
        assert.equal(init.redirect, "manual");
        return new Response(null, {
          status, headers: { Location: "https://example.invalid/do-not-follow" },
        });
      });
      await assertFailure(await onRequestGet({ request: request() }), 502);
      assert.equal(mock.mock.callCount(), 1, "must not retry at the redirect target");
    });
  }
});

test("upstream HTTP errors, invalid JSON, invalid shapes and fetch failures stay fail-closed", async (t) => {
  t.mock.method(console, "error", () => {});
  const cases = [
    ["HTTP 404", () => new Response("private upstream detail", { status: 404 })],
    ["HTTP 500", () => new Response("private upstream detail", { status: 500 })],
    ["invalid JSON", () => new Response("not JSON")],
    ["non-array JSON", () => Response.json({ private: "not public records" })],
    ["network failure", () => { throw new TypeError("network unavailable"); }],
    ["timeout", () => { throw new DOMException("upstream timed out", "TimeoutError"); }],
  ];
  for (const [name, makeResponse] of cases) {
    await t.test(name, async (t) => {
      const mock = t.mock.method(globalThis, "fetch", async () => makeResponse());
      await assertFailure(await onRequestGet({ request: request() }), 502);
      assert.equal(mock.mock.callCount(), 1);
    });
  }
});

test("invalid collections and unsafe upstream overrides are rejected before fetching", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => {
    assert.fail("validation failures must not reach an upstream");
  });
  await assertFailure(await onRequestGet({ request: request("invalid") }), 400);
  for (const url of [
    "http://example.com/api/library",
    "https://user:pass@example.com/api/library",
    "https://example.com/other",
    "https://example.com/api/library?token=private",
    "https://example.com/api/library#fragment",
    "https://www.stuartjgreen.me/api/library",
    "not a URL",
  ]) {
    await assertFailure(await onRequestGet({
      request: request(), env: { LIBRARY_API_URL: url },
    }), 503);
  }
  assert.equal(mock.mock.callCount(), 0);
});
