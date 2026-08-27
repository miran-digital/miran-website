export function rejectCrossSiteMutation(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site") {
    return Response.json({ error: "درخواست بین‌سایتی مجاز نیست." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403 });
  }
  return null;
}
