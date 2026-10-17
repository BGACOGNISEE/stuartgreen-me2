// Verified Replit deployment; publish the API before releasing the static mirror.
// Optional server-side override supports a future backend move.
export async function onRequestGet({ request, env = {} }) {
  const fail = (status) => Response.json(
    { error: "Library records are temporarily unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  const collection = new URL(request.url).searchParams.get("collection") || "writing";
  if (!["writing", "publications"].includes(collection)) return fail(400);
  let endpoint;
  try {
    endpoint = new URL(env.LIBRARY_API_URL || "https://asset-risk-manager.replit.app/api/library");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        endpoint.pathname !== "/api/library" || endpoint.search || endpoint.hash ||
        endpoint.origin === new URL(request.url).origin) return fail(503);
  } catch { return fail(503); }
  endpoint.searchParams.set("collection", collection);
  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return fail(502);
    const records = await upstream.json();
    if (!Array.isArray(records)) return fail(502);
    return Response.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail(502); }
}
