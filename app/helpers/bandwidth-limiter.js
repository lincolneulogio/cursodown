"use strict";

/**
 * Simple token-bucket bandwidth limiter (bytes per second).
 */

class BandwidthLimiter {
	/**
	 * @param {number} kbps - 0 or negative = unlimited
	 */
	constructor(kbps = 0) {
		const parsed = Number(kbps);
		this.bytesPerSec = Number.isFinite(parsed) && parsed > 0 ? parsed * 1024 : 0;
		this.tokens = this.bytesPerSec;
		this.lastRefill = Date.now();
	}

	get enabled() {
		return this.bytesPerSec > 0;
	}

	/**
	 * Suggested parallel connections when throttling.
	 * @returns {number}
	 */
	suggestedThreads() {
		if (!this.enabled) return 10;
		if (this.bytesPerSec < 256 * 1024) return 1;
		if (this.bytesPerSec < 1024 * 1024) return 2;
		return 4;
	}

	/**
	 * Suggested HLS chunk parallelism.
	 * @returns {number}
	 */
	suggestedParallel() {
		if (!this.enabled) return 12;
		if (this.bytesPerSec < 256 * 1024) return 2;
		if (this.bytesPerSec < 1024 * 1024) return 4;
		return 6;
	}

	#refill() {
		if (!this.enabled) return;
		const now = Date.now();
		const elapsed = (now - this.lastRefill) / 1000;
		if (elapsed <= 0) return;
		this.tokens = Math.min(this.bytesPerSec * 2, this.tokens + elapsed * this.bytesPerSec);
		this.lastRefill = now;
	}

	/**
	 * Blocks until `bytes` can be consumed under the rate limit.
	 * @param {number} bytes
	 * @returns {Promise<void>}
	 */
	async wait(bytes) {
		if (!this.enabled) return;
		const amount = Math.max(0, Number(bytes) || 0);
		if (amount === 0) return;

		for (;;) {
			this.#refill();
			if (this.tokens >= amount) {
				this.tokens -= amount;
				return;
			}
			const deficit = amount - this.tokens;
			const delayMs = Math.ceil((deficit / this.bytesPerSec) * 1000);
			await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(delayMs, 20), 5000)));
		}
	}
}

module.exports = BandwidthLimiter;
