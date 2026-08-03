import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "./client";

interface Capture {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: string | undefined;
}

/** A fake fetch that records the request and returns a fixed Response. */
function stub(response: Response): { fetch: typeof fetch; calls: Capture[] } {
  const calls: Capture[] = [];
  const fetchFn = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return response;
  };
  return { fetch: fetchFn, calls };
}

test("GET sends auth headers and parses the JSON body", async () => {
  const { fetch, calls } = stub(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  const client = new ApiClient({
    apiUrl: "https://api.test",
    token: "ub_live_abc",
    org: "acme",
    fetchFn: fetch,
  });

  const data = await client.get<{ ok: boolean }>("/profile");
  assert.deepEqual(data, { ok: true });

  const call = calls[0]!;
  assert.equal(call.url, "https://api.test/profile");
  assert.equal(call.method, "GET");
  assert.equal(call.headers.get("x-api-key"), "ub_live_abc");
  assert.equal(call.headers.get("x-org-id"), "acme");
});

test("POST serialises the body and sets Content-Type", async () => {
  const { fetch, calls } = stub(new Response("{}", { status: 201 }));
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn: fetch });

  await client.post("/apps/projects", { name: "demo" });
  const call = calls[0]!;
  assert.equal(call.method, "POST");
  assert.equal(call.headers.get("content-type"), "application/json");
  assert.equal(call.body, JSON.stringify({ name: "demo" }));
});

test("omits X-Org-Id and X-API-Key when not configured", async () => {
  const { fetch, calls } = stub(new Response("{}", { status: 200 }));
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn: fetch });
  await client.get("/health");
  const call = calls[0]!;
  assert.equal(call.headers.has("x-api-key"), false);
  assert.equal(call.headers.has("x-org-id"), false);
});

test("a 204 with no body resolves to undefined", async () => {
  const { fetch } = stub(new Response(null, { status: 204 }));
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn: fetch });
  const data = await client.delete("/apps/projects/p1");
  assert.equal(data, undefined);
});

test("maps the API error envelope onto ApiError", async () => {
  const { fetch } = stub(
    new Response(
      JSON.stringify({
        error: { code: "not_found", message: "No such token" },
      }),
      { status: 404 },
    ),
  );
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn: fetch });
  await assert.rejects(
    () => client.get("/api-tokens/x"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.equal(err.code, "not_found");
      assert.equal(err.message, "No such token");
      return true;
    },
  );
});

test("preserves Fastify's top-level error message", async () => {
  const fetchFn = async () =>
    new Response(
      JSON.stringify({
        message: "Route GET:/spaces not found",
        error: "Not Found",
        statusCode: 404,
      }),
      { status: 404, statusText: "Not Found" },
    );
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn });

  await assert.rejects(client.get("/spaces"), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    assert.equal(err.code, "http_404");
    assert.equal(err.message, "Route GET:/spaces not found");
    return true;
  });
});

test("supports a top-level API code and string error fallback", async () => {
  const coded = new ApiClient({
    apiUrl: "https://api.test",
    fetchFn: async () =>
      new Response(JSON.stringify({ code: "gone", error: "No longer here" }), {
        status: 410,
      }),
  });
  await assert.rejects(coded.get("/old"), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "gone");
    assert.equal(err.message, "No longer here");
    return true;
  });
});

test("a transport failure becomes a network_error ApiError", async () => {
  const fetchFn = async (): Promise<Response> => {
    throw new Error("getaddrinfo ENOTFOUND");
  };
  const client = new ApiClient({
    apiUrl: "https://api.test",
    fetchFn: fetchFn as typeof fetch,
  });
  await assert.rejects(
    () => client.get("/health"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 0);
      assert.equal(err.code, "network_error");
      return true;
    },
  );
});
