import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const DownloadQueue = require("../app/core/services/download-queue.service");
const M3U8Service = require("../app/core/services/m3u8.service");
const plannerCore = require("../app/helpers/planner-core");

describe("DownloadQueue", () => {
	it("starts within concurrency and queues the rest", () => {
		const q = new DownloadQueue(1);
		const started = [];
		const a = q.enqueue("1", () => started.push("1"));
		const b = q.enqueue("2", () => started.push("2"));
		expect(a).toBe("started");
		expect(b).toBe("queued");
		expect(started).toEqual(["1"]);
		expect(q.pendingCount).toBe(1);
		q.complete("1");
		expect(started).toEqual(["1", "2"]);
	});

	it("rejects duplicates", () => {
		const q = new DownloadQueue(2);
		expect(q.enqueue("x", () => {})).toBe("started");
		expect(q.enqueue("x", () => {})).toBe("duplicate");
	});
});

describe("M3U8Service", () => {
	it("validates URLs in constructor", () => {
		expect(() => new M3U8Service("not-a-url")).toThrow();
		expect(() => new M3U8Service("https://cdn.example.com/master.m3u8")).not.toThrow();
	});
});

describe("planner-core", () => {
	const sample = {
		name: "Demo",
		chapters: [
			{
				name: "Ch1",
				lectures: [
					{ name: "L1", type: "video", isEncrypted: false },
					{ name: "L2", type: "video", isEncrypted: true },
				],
			},
		],
	};

	it("computes DRM stats", () => {
		const s = plannerCore.stats(sample);
		expect(s.total).toBe(2);
		expect(s.encrypted).toBe(1);
		expect(s.percent).toBe(50);
	});

	it("filters selected lectures", () => {
		const filtered = plannerCore.filterCourse(sample, ["0:0"]);
		expect(filtered.totalLectures).toBe(1);
		expect(filtered.chapters[0].lectures).toHaveLength(1);
		expect(filtered.chapters[0].lectures[0].name).toBe("L1");
	});
});
