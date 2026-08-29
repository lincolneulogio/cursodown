import * as fs from "fs";
import * as path from "path";
import type { IntegrityFileResult, IntegrityReport } from "./types";

const MEDIA_EXT = new Set([".mp4", ".ts", ".mkv", ".webm", ".m4a", ".mp3"]);

type DetectFn = (filePath: string) => string;
type ValidFn = (filePath: string) => boolean;

function loadMediaHelpers(): { detectContainer: DetectFn; isValidMediaFile: ValidFn } {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const media = require("../../helpers/media-finalize") as {
		detectContainer: DetectFn;
		isValidMediaFile: ValidFn;
	};
	return media;
}

/**
 * Scans a course folder for media integrity (empty / HTML / playlist misnamed as video).
 */
class IntegrityService {
	static walkMediaFiles(rootDir: string): string[] {
		if (!rootDir || !fs.existsSync(rootDir)) {
			return [];
		}

		const results: string[] = [];
		const stack = [rootDir];

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(current, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				const full = path.join(current, entry.name);
				if (entry.isDirectory()) {
					if (entry.name === "subs" || entry.name === "node_modules") continue;
					stack.push(full);
					continue;
				}
				if (!entry.isFile()) continue;
				const ext = path.extname(entry.name).toLowerCase();
				if (MEDIA_EXT.has(ext) || entry.name.toLowerCase().endsWith(".mp4.mtd")) {
					if (entry.name.toLowerCase().endsWith(".mtd")) continue;
					results.push(full);
				}
			}
		}

		return results;
	}

	static folderSizeBytes(rootDir: string): number {
		if (!rootDir || !fs.existsSync(rootDir)) {
			return 0;
		}
		let total = 0;
		const stack = [rootDir];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(current, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				const full = path.join(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(full);
					continue;
				}
				if (!entry.isFile()) continue;
				try {
					total += fs.statSync(full).size;
				} catch {
					/* ignore */
				}
			}
		}
		return total;
	}

	static inspectFile(filePath: string): IntegrityFileResult {
		const { detectContainer, isValidMediaFile } = loadMediaHelpers();
		const relativePath = path.basename(filePath);
		try {
			const stat = fs.statSync(filePath);
			if (stat.size === 0) {
				return {
					relativePath,
					absolutePath: filePath,
					sizeBytes: 0,
					ok: false,
					reason: "empty",
				};
			}
			const container = detectContainer(filePath);
			const ok = isValidMediaFile(filePath);
			return {
				relativePath,
				absolutePath: filePath,
				sizeBytes: stat.size,
				ok,
				reason: ok ? undefined : container || "invalid",
			};
		} catch (error) {
			return {
				relativePath,
				absolutePath: filePath,
				sizeBytes: 0,
				ok: false,
				reason: error instanceof Error ? error.message : "unreadable",
			};
		}
	}

	static verifyFolder(rootDir: string): IntegrityReport {
		const absolute = rootDir ? path.resolve(rootDir) : "";
		const mediaFiles = IntegrityService.walkMediaFiles(absolute);
		const files = mediaFiles.map((file) => {
			const result = IntegrityService.inspectFile(file);
			return {
				...result,
				relativePath: path.relative(absolute, file).split(path.sep).join("/"),
			};
		});

		const ok = files.filter((f) => f.ok).length;
		const broken = files.filter((f) => !f.ok).length;
		const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

		return {
			path: absolute,
			ok,
			broken,
			totalSizeBytes,
			files,
		};
	}

	/**
	 * Deletes broken media so a later download with skipExisting can recreate them.
	 */
	static removeBroken(rootDir: string): { removed: number; report: IntegrityReport } {
		const report = IntegrityService.verifyFolder(rootDir);
		let removed = 0;
		for (const file of report.files) {
			if (file.ok) continue;
			try {
				fs.unlinkSync(file.absolutePath);
				removed += 1;
				const mtd = `${file.absolutePath}.mtd`;
				if (fs.existsSync(mtd)) fs.unlinkSync(mtd);
			} catch {
				/* ignore */
			}
		}
		return { removed, report: IntegrityService.verifyFolder(rootDir) };
	}

	static quickBrokenCount(rootDir: string): { brokenCount: number; okMediaCount: number; sizeBytes: number } {
		if (!rootDir || !fs.existsSync(rootDir)) {
			return { brokenCount: 0, okMediaCount: 0, sizeBytes: 0 };
		}
		const { isValidMediaFile } = loadMediaHelpers();
		const mediaFiles = IntegrityService.walkMediaFiles(rootDir);
		let brokenCount = 0;
		let okMediaCount = 0;
		let sizeBytes = 0;
		for (const file of mediaFiles) {
			try {
				const size = fs.statSync(file).size;
				sizeBytes += size;
				if (size === 0 || !isValidMediaFile(file)) brokenCount += 1;
				else okMediaCount += 1;
			} catch {
				brokenCount += 1;
			}
		}
		return { brokenCount, okMediaCount, sizeBytes };
	}
}

export = IntegrityService;
