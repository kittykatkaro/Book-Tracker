/**
 * Lightweight in-memory job store for background book imports.
 *
 * Why in-memory instead of BullMQ/Redis: this project doesn't currently
 * provision a Redis instance, and a single-process Express server on
 * Replit doesn't need a distributed queue to get the two things that
 * actually matter here — (1) not blocking the HTTP request/response cycle
 * while hundreds of rows are inserted and enriched, and (2) giving the
 * client something to poll for progress.
 *
 * If this app is later split across multiple server instances, swap this
 * module out for a BullMQ queue backed by Redis — the job shape below
 * (status/progress fields) was kept intentionally simple so that a queue
 * job's `data`/`progress` could mirror it with minimal changes to the
 * route handlers that read/write jobs.
 */

export type ImportJobStatus =
  | "queued"
  | "importing"
  | "enriching"
  | "completed"
  | "failed";

export interface ImportJob {
  id: string;
  userId: string;
  status: ImportJobStatus;
  total: number;
  processed: number; // rows evaluated so far during the DB-insert phase
  imported: number;
  skipped: number;
  enrichTotal: number;
  enrichDone: number;
  message: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, ImportJob>();

// Jobs are cheap (a few hundred bytes each) but shouldn't accumulate
// forever on a long-lived process — sweep finished jobs after an hour.
const JOB_TTL_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

let sweeper: NodeJS.Timeout | null = null;
function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      const isTerminal = job.status === "completed" || job.status === "failed";
      if (isTerminal && job.updatedAt < cutoff) jobs.delete(id);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for this timer.
  sweeper.unref?.();
}

function generateJobId(): string {
  return `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createImportJob(userId: string, total: number): ImportJob {
  ensureSweeper();
  const now = Date.now();
  const job: ImportJob = {
    id: generateJobId(),
    userId,
    status: "queued",
    total,
    processed: 0,
    imported: 0,
    skipped: 0,
    enrichTotal: 0,
    enrichDone: 0,
    message: "Queued…",
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function getImportJob(jobId: string): ImportJob | undefined {
  return jobs.get(jobId);
}

export function updateImportJob(jobId: string, patch: Partial<ImportJob>): void {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

/** Public shape returned to clients — omits internal-only bookkeeping if any is added later. */
export function serializeImportJob(job: ImportJob) {
  return {
    jobId: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    imported: job.imported,
    skipped: job.skipped,
    enriching: { total: job.enrichTotal, done: job.enrichDone },
    message: job.message,
    error: job.error,
  };
}
