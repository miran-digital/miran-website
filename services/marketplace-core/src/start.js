async function start() {
  if (process.env.DATABASE_URL) {
    const { startPostgresServer } = await import("../postgres/server.js");
    const runtime = await startPostgresServer();

    async function shutdown(signal) {
      console.log(`marketplace-core received ${signal}; shutting down`);
      try {
        await runtime.close();
        process.exitCode = 0;
      } catch (error) {
        console.error("marketplace-core shutdown failed", {
          name: error?.name,
          code: error?.code,
          message: error?.message,
        });
        process.exitCode = 1;
      }
    }

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw Object.assign(
      new Error("DATABASE_URL is required in production; SQLite fallback is disabled"),
      { code: "DATABASE_NOT_CONFIGURED" },
    );
  }

  await import("./server.js");
}

start().catch((error) => {
  console.error("marketplace-core failed to start", {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  process.exitCode = 1;
});
