/** Simple health check for uptime monitors. */
export async function GET() {
  return Response.json({ ok: true, service: "clinic-booking" });
}
