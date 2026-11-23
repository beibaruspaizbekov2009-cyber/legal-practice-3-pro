const DEFAULT_MODEL = "gemini-3.8-flash";

export async function onRequestGet({ env }) {
  return Response.json({
    ok: true,
    configured: Boolean(env.GEMINI_API_KEY),
    provider: "Gemini API",
    model: env.GEMINI_MODEL || DEFAULT_MODEL
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
