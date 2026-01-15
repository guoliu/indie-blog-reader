/**
 * Generic worker pool for parallel job execution with controlled concurrency
 *
 * Features:
 * - Configurable concurrency limit
 * - Progress tracking with callbacks
 * - Error isolation (one job failure doesn't stop others)
 * - Cancellation support
 * - Results returned in original order
 */

export const DEFAULT_CONCURRENCY = 4;

export interface WorkerPoolConfig<TJob, TResult> {
  /** Maximum concurrent jobs */
  concurrency?: number;
  /** Worker function that processes a single job */
  worker: (job: TJob) => Promise<TResult>;
  /** Progress callback */
  onProgress?: (progress: ProgressInfo) => void;
}

export interface ProgressInfo {
  /** Number of jobs completed (success + failure) */
  completed: number;
  /** Total number of jobs */
  total: number;
  /** Number of successful jobs */
  succeeded: number;
  /** Number of failed jobs */
  failed: number;
}

export interface JobResult<TJob, TResult> {
  /** The result if job succeeded */
  result?: TResult;
  /** Error message if job failed */
  error?: string;
  /** The original job (included on error) */
  job?: TJob;
}

export class WorkerPool<TJob, TResult> {
  private concurrency: number;
  private worker: (job: TJob) => Promise<TResult>;
  private onProgress?: (progress: ProgressInfo) => void;
  private cancelled = false;

  constructor(config: WorkerPoolConfig<TJob, TResult>) {
    this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
    this.worker = config.worker;
    this.onProgress = config.onProgress;
  }

  /**
   * Run all jobs and return results in original order
   */
  async run(jobs: TJob[]): Promise<Array<TResult & { error?: string; job?: TJob }>> {
    // Reset cancellation state for new run
    this.cancelled = false;

    if (jobs.length === 0) {
      return [];
    }

    const results: Array<TResult & { error?: string; job?: TJob }> = new Array(
      jobs.length
    );
    let nextIndex = 0;
    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    const processNext = async (): Promise<void> => {
      while (!this.cancelled && nextIndex < jobs.length) {
        const index = nextIndex++;
        const job = jobs[index];

        try {
          const result = await this.worker(job);
          results[index] = result as TResult & { error?: string; job?: TJob };
          succeeded++;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          results[index] = {
            error: errorMessage,
            job,
          } as TResult & { error?: string; job?: TJob };
          failed++;
        }

        completed++;
        this.onProgress?.({
          completed,
          total: jobs.length,
          succeeded,
          failed,
        });
      }
    };

    // Start concurrent workers
    const workers = Array.from(
      { length: Math.min(this.concurrency, jobs.length) },
      () => processNext()
    );

    await Promise.all(workers);

    // Return only completed results if cancelled
    if (this.cancelled) {
      return results.slice(0, completed).filter((r) => r !== undefined);
    }

    return results;
  }

  /**
   * Cancel the current run
   */
  cancel(): void {
    this.cancelled = true;
  }
}
