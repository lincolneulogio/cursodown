"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _DownloadQueue_instances, _DownloadQueue_concurrency, _DownloadQueue_pending, _DownloadQueue_running, _DownloadQueue_pump;
/**
 * Limits how many course downloads run at the same time.
 * Concurrency is clamped to 1–3 to avoid Udemy 429 responses.
 */
class DownloadQueue {
    constructor(concurrency = 2) {
        _DownloadQueue_instances.add(this);
        _DownloadQueue_concurrency.set(this, 2);
        _DownloadQueue_pending.set(this, []);
        _DownloadQueue_running.set(this, new Set());
        this.setConcurrency(concurrency);
    }
    setConcurrency(value) {
        const parsed = Number(value);
        __classPrivateFieldSet(this, _DownloadQueue_concurrency, Number.isFinite(parsed) ? Math.min(3, Math.max(1, Math.floor(parsed))) : 2, "f");
        __classPrivateFieldGet(this, _DownloadQueue_instances, "m", _DownloadQueue_pump).call(this);
        return __classPrivateFieldGet(this, _DownloadQueue_concurrency, "f");
    }
    get concurrency() {
        return __classPrivateFieldGet(this, _DownloadQueue_concurrency, "f");
    }
    get runningCount() {
        return __classPrivateFieldGet(this, _DownloadQueue_running, "f").size;
    }
    get pendingCount() {
        return __classPrivateFieldGet(this, _DownloadQueue_pending, "f").length;
    }
    isActive(courseId) {
        const id = String(courseId);
        return __classPrivateFieldGet(this, _DownloadQueue_running, "f").has(id) || __classPrivateFieldGet(this, _DownloadQueue_pending, "f").some((job) => job.courseId === id);
    }
    isWaiting(courseId) {
        const id = String(courseId);
        return __classPrivateFieldGet(this, _DownloadQueue_pending, "f").some((job) => job.courseId === id);
    }
    isRunning(courseId) {
        return __classPrivateFieldGet(this, _DownloadQueue_running, "f").has(String(courseId));
    }
    /**
     * @param run starts the download; must call complete() when finished
     */
    enqueue(courseId, run) {
        const id = String(courseId);
        if (this.isActive(id)) {
            return "duplicate";
        }
        __classPrivateFieldGet(this, _DownloadQueue_pending, "f").push({ courseId: id, run });
        __classPrivateFieldGet(this, _DownloadQueue_instances, "m", _DownloadQueue_pump).call(this);
        return __classPrivateFieldGet(this, _DownloadQueue_running, "f").has(id) ? "started" : "queued";
    }
    complete(courseId) {
        __classPrivateFieldGet(this, _DownloadQueue_running, "f").delete(String(courseId));
        __classPrivateFieldGet(this, _DownloadQueue_instances, "m", _DownloadQueue_pump).call(this);
    }
    /**
     * Drops a course from the queue and from the running set.
     * The in-progress downloader must still be stopped by the caller.
     */
    cancel(courseId) {
        const id = String(courseId);
        __classPrivateFieldSet(this, _DownloadQueue_pending, __classPrivateFieldGet(this, _DownloadQueue_pending, "f").filter((job) => job.courseId !== id), "f");
        __classPrivateFieldGet(this, _DownloadQueue_running, "f").delete(id);
        __classPrivateFieldGet(this, _DownloadQueue_instances, "m", _DownloadQueue_pump).call(this);
    }
}
_DownloadQueue_concurrency = new WeakMap(), _DownloadQueue_pending = new WeakMap(), _DownloadQueue_running = new WeakMap(), _DownloadQueue_instances = new WeakSet(), _DownloadQueue_pump = function _DownloadQueue_pump() {
    while (__classPrivateFieldGet(this, _DownloadQueue_running, "f").size < __classPrivateFieldGet(this, _DownloadQueue_concurrency, "f") && __classPrivateFieldGet(this, _DownloadQueue_pending, "f").length > 0) {
        const job = __classPrivateFieldGet(this, _DownloadQueue_pending, "f").shift();
        if (!job)
            return;
        __classPrivateFieldGet(this, _DownloadQueue_running, "f").add(job.courseId);
        try {
            job.run();
        }
        catch (error) {
            __classPrivateFieldGet(this, _DownloadQueue_running, "f").delete(job.courseId);
            console.error("DownloadQueue job failed to start", error);
        }
    }
};
module.exports = DownloadQueue;
//# sourceMappingURL=download-queue.service.js.map