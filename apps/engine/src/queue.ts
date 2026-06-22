import type { DispatchInput } from "@qalisa/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const SEND_QUEUE = "messages:send";

export type SendJobData = DispatchInput & { tenantId: string };

// One shared connection for the Queue (publisher side).
// maxRetriesPerRequest: null is required by BullMQ.
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const sendQueue = new Queue<SendJobData, void, string>(SEND_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
