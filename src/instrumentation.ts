export async function register() {
  // Background jobs (expiry sweep, reminders, outbox, broadcasts, retention…)
  // run in the Node.js server process. Set PLATFORM_JOBS=off to disable.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/platform/jobs");
    startScheduler();
  }
}
