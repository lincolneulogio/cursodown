import type { DownloadQueueStatus } from "./types";
/**
 * Limits how many course downloads run at the same time.
 * Concurrency is clamped to 1–3 to avoid Udemy 429 responses.
 */
declare class DownloadQueue {
    #private;
    constructor(concurrency?: number);
    setConcurrency(value: number): number;
    get concurrency(): number;
    get runningCount(): number;
    get pendingCount(): number;
    isActive(courseId: string | number): boolean;
    isWaiting(courseId: string | number): boolean;
    isRunning(courseId: string | number): boolean;
    /**
     * @param run starts the download; must call complete() when finished
     */
    enqueue(courseId: string | number, run: () => void): DownloadQueueStatus;
    complete(courseId: string | number): void;
    /**
     * Drops a course from the queue and from the running set.
     * The in-progress downloader must still be stopped by the caller.
     */
    cancel(courseId: string | number): void;
}
export = DownloadQueue;
//# sourceMappingURL=download-queue.service.d.ts.map