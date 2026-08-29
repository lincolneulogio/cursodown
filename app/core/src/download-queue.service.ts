import type { DownloadQueueStatus } from "./types";

type QueueJob = {
	courseId: string;
	run: () => void;
};

/**
 * Limits how many course downloads run at the same time.
 * Concurrency is clamped to 1–3 to avoid Udemy 429 responses.
 */
class DownloadQueue {
	#concurrency = 2;
	#pending: QueueJob[] = [];
	#running = new Set<string>();

	constructor(concurrency = 2) {
		this.setConcurrency(concurrency);
	}

	setConcurrency(value: number): number {
		const parsed = Number(value);
		this.#concurrency = Number.isFinite(parsed) ? Math.min(3, Math.max(1, Math.floor(parsed))) : 2;
		this.#pump();
		return this.#concurrency;
	}

	get concurrency(): number {
		return this.#concurrency;
	}

	get runningCount(): number {
		return this.#running.size;
	}

	get pendingCount(): number {
		return this.#pending.length;
	}

	isActive(courseId: string | number): boolean {
		const id = String(courseId);
		return this.#running.has(id) || this.#pending.some((job) => job.courseId === id);
	}

	isWaiting(courseId: string | number): boolean {
		const id = String(courseId);
		return this.#pending.some((job) => job.courseId === id);
	}

	isRunning(courseId: string | number): boolean {
		return this.#running.has(String(courseId));
	}

	/**
	 * @param run starts the download; must call complete() when finished
	 */
	enqueue(courseId: string | number, run: () => void): DownloadQueueStatus {
		const id = String(courseId);
		if (this.isActive(id)) {
			return "duplicate";
		}

		this.#pending.push({ courseId: id, run });
		this.#pump();
		return this.#running.has(id) ? "started" : "queued";
	}

	complete(courseId: string | number): void {
		this.#running.delete(String(courseId));
		this.#pump();
	}

	/**
	 * Drops a course from the queue and from the running set.
	 * The in-progress downloader must still be stopped by the caller.
	 */
	cancel(courseId: string | number): void {
		const id = String(courseId);
		this.#pending = this.#pending.filter((job) => job.courseId !== id);
		this.#running.delete(id);
		this.#pump();
	}

	#pump(): void {
		while (this.#running.size < this.#concurrency && this.#pending.length > 0) {
			const job = this.#pending.shift();
			if (!job) return;
			this.#running.add(job.courseId);
			try {
				job.run();
			} catch (error) {
				this.#running.delete(job.courseId);
				console.error("DownloadQueue job failed to start", error);
			}
		}
	}
}

export = DownloadQueue;
