import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

/**
 * Tests for worker pool parallel crawling
 *
 * The worker pool distributes crawl jobs across multiple workers
 * with controlled concurrency per worker.
 */
describe("WorkerPool", () => {
  describe("basic execution", () => {
    test("executes jobs in parallel up to concurrency limit", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const executionOrder: number[] = [];
      const pool = new WorkerPool({
        concurrency: 2,
        worker: async (job: { id: number }) => {
          executionOrder.push(job.id);
          await new Promise((r) => setTimeout(r, 50));
          return { id: job.id, done: true };
        },
      });

      const jobs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      const results = await pool.run(jobs);

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.done)).toBe(true);
    });

    test("respects concurrency limit", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      let concurrent = 0;
      let maxConcurrent = 0;

      const pool = new WorkerPool({
        concurrency: 3,
        worker: async (job: { id: number }) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((r) => setTimeout(r, 50));
          concurrent--;
          return { id: job.id };
        },
      });

      const jobs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      await pool.run(jobs);

      expect(maxConcurrent).toBe(3);
    });

    test("returns results in original order", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const pool = new WorkerPool({
        concurrency: 4,
        worker: async (job: { id: number }) => {
          // Random delay to simulate varying response times
          await new Promise((r) => setTimeout(r, Math.random() * 50));
          return { id: job.id, doubled: job.id * 2 };
        },
      });

      const jobs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
      const results = await pool.run(jobs);

      expect(results.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
      expect(results.map((r) => r.doubled)).toEqual([2, 4, 6, 8, 10]);
    });

    test("handles empty job list", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const pool = new WorkerPool({
        concurrency: 2,
        worker: async (job: unknown) => job,
      });

      const results = await pool.run([]);

      expect(results).toEqual([]);
    });
  });

  describe("error handling", () => {
    test("captures errors without stopping other jobs", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const pool = new WorkerPool({
        concurrency: 2,
        worker: async (job: { id: number; shouldFail?: boolean }) => {
          if (job.shouldFail) {
            throw new Error(`Job ${job.id} failed`);
          }
          return { id: job.id, success: true };
        },
      });

      const jobs = [
        { id: 1 },
        { id: 2, shouldFail: true },
        { id: 3 },
        { id: 4, shouldFail: true },
        { id: 5 },
      ];

      const results = await pool.run(jobs);

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({ id: 1, success: true });
      expect(results[1].error).toContain("Job 2 failed");
      expect(results[2]).toEqual({ id: 3, success: true });
      expect(results[3].error).toContain("Job 4 failed");
      expect(results[4]).toEqual({ id: 5, success: true });
    });

    test("includes job in error result", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const pool = new WorkerPool({
        concurrency: 1,
        worker: async (job: { url: string }) => {
          throw new Error("Network error");
        },
      });

      const jobs = [{ url: "https://example.com" }];
      const results = await pool.run(jobs);

      expect(results[0].error).toBe("Network error");
      expect(results[0].job).toEqual({ url: "https://example.com" });
    });
  });

  describe("progress tracking", () => {
    test("emits progress events", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const progressEvents: Array<{
        completed: number;
        total: number;
        succeeded: number;
        failed: number;
      }> = [];

      const pool = new WorkerPool({
        concurrency: 2,
        worker: async (job: { id: number }) => {
          await new Promise((r) => setTimeout(r, 10));
          return { id: job.id };
        },
        onProgress: (progress) => {
          progressEvents.push({ ...progress });
        },
      });

      const jobs = [{ id: 1 }, { id: 2 }, { id: 3 }];
      await pool.run(jobs);

      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      expect(progressEvents[progressEvents.length - 1]).toEqual({
        completed: 3,
        total: 3,
        succeeded: 3,
        failed: 0,
      });
    });

    test("tracks failed jobs in progress", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      let finalProgress: { succeeded: number; failed: number } | null = null;

      const pool = new WorkerPool({
        concurrency: 1,
        worker: async (job: { id: number }) => {
          if (job.id === 2) throw new Error("fail");
          return { id: job.id };
        },
        onProgress: (progress) => {
          finalProgress = { succeeded: progress.succeeded, failed: progress.failed };
        },
      });

      await pool.run([{ id: 1 }, { id: 2 }, { id: 3 }]);

      expect(finalProgress).toEqual({ succeeded: 2, failed: 1 });
    });
  });

  describe("cancellation", () => {
    test("can be cancelled mid-execution", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      let completedJobs = 0;

      const pool = new WorkerPool({
        concurrency: 1,
        worker: async (job: { id: number }) => {
          await new Promise((r) => setTimeout(r, 50));
          completedJobs++;
          return { id: job.id };
        },
      });

      const jobs = Array.from({ length: 10 }, (_, i) => ({ id: i }));

      // Start execution and cancel after short delay
      const promise = pool.run(jobs);
      setTimeout(() => pool.cancel(), 100);

      const results = await promise;

      // Should have completed some but not all
      expect(completedJobs).toBeLessThan(10);
      expect(completedJobs).toBeGreaterThan(0);
      expect(results.length).toBe(completedJobs);
    });

    test("cancel is idempotent", async () => {
      const { WorkerPool } = await import("../../src/indexer/worker-pool");

      const pool = new WorkerPool({
        concurrency: 1,
        worker: async (job: { id: number }) => ({ id: job.id }),
      });

      // Cancel multiple times should not throw
      pool.cancel();
      pool.cancel();
      pool.cancel();

      // Should still be able to run after cancels
      const results = await pool.run([{ id: 1 }]);
      expect(results).toHaveLength(1);
    });
  });

  describe("configuration", () => {
    test("defaults to concurrency of 4", async () => {
      const { WorkerPool, DEFAULT_CONCURRENCY } = await import(
        "../../src/indexer/worker-pool"
      );

      expect(DEFAULT_CONCURRENCY).toBe(4);
    });
  });
});
