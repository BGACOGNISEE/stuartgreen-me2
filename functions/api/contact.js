// Same-origin Cloudflare Pages endpoint. Never expose the upstream address or
// shared proxy credential in browser code. No form data is stored or logged here.
export async function onRequestPost({ request, env }) {
  const fail = (status) => Response.json({
    error: "Your enquiry could not be sent. Please try again or use the direct email address below."
  }, { status, headers: { "Cache-Control": "no-store" } });
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin ||
      !request.headers.get("Content-Type")?.startsWith("application/json")) return fail(403);
  if (!env.CONTACT_API_URL || !env.CONTACT_PROXY_SECRET) return fail(503);
  let endpoint;
  try {
    endpoint = new URL(env.CONTACT_API_URL);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
        endpoint.pathname !== "/api/contact" || endpoint.search || endpoint.hash) return fail(503);
  } catch { return fail(503); }
  // Stream with a hard bound even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) return fail(400);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return fail(413); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const response = await fetch(endpoint.href, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Contact-Proxy": env.CONTACT_PROXY_SECRET,
        "X-Contact-Client-IP": request.headers.get("CF-Connecting-IP") || "",
      },
      body,
    });
    const result = await response.json();
    if (response.status === 202 && result.accepted === true) {
      return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return fail([400, 403, 413, 429, 502, 503, 504].includes(response.status) ? response.status : 502);
  } catch { return fail(502); }
}
