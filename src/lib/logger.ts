import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: "komame-household-budget",
  },
});

// スロークエリ監視 (200ms以上で自動警告)
export function logQueryPerformance(
  sql: string,
  params: unknown[],
  durationMs: number,
  schemaName?: string,
  traceId?: string
) {
  const SLOW_QUERY_THRESHOLD_MS = 200;

  const logData = {
    durationMs,
    schema: schemaName || "public",
    sql: sql.replace(/\s+/g, " ").trim(),
    traceId,
  };

  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
    logger.warn(logData, "⚠️ SLOW_QUERY_DETECTED: Query exceeded 200ms");
  } else {
    logger.trace(logData, "DB Query executed");
  }
}
