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
  let upstreamStatus = null;
  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      // Workers does not support "error"; manual redirects fail the !ok check below.
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    upstreamStatus = upstream.status;
    if (!upstream.ok) {
      console.error("Library proxy upstream error", {
        name: "UpstreamHTTPError", message: upstream.statusText, status: upstreamStatus,
      });
      return fail(502);
    }
    const records = await upstream.json();
    if (!Array.isArray(records)) return fail(502);
    return Response.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Library proxy request failed", {
      name: error?.name, message: error?.message, status: upstreamStatus,
    });
    return fail(502);
  }
}
