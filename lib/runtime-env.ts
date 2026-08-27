export async function getRuntimeEnv<Bindings extends object>() {
  const runtime = await import("cloudflare:workers");
  return runtime.env as unknown as Bindings;
}
