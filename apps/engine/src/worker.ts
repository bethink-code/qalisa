import { dispatchMessage, logger } from "@qalisa/core";
import { db } from "@qalisa/db";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";
import { SEND_QUEUE, type SendJobData } from "./queue";
import { vault } from "./services";

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<SendJobData, void, string>(
  SEND_QUEUE,
  async (job) => {
    const { tenantId, ...input } = job.data;
    logger.info({ jobId: job.id, messageId: input.messageId }, "processing send job");
    await dispatchMessage(tenantId, input, { db, vault });
  },
  { connection, concurrency: 10 },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, messageId: job.data.messageId }, "send job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, messageId: job?.data.messageId, err }, "send job failed");
});

process.on("SIGTERM", async () => {
  logger.info("[worker] SIGTERM received, draining and shutting down");
  await worker.close();
  await connection.quit();
  logger.info("[worker] shutdown complete");
  process.exit(0);
});

logger.info(`[worker] consuming queue '${SEND_QUEUE}' (concurrency=10)`);
