import * as fs from "fs";
import * as path from "path";
import IntegrityService = require("./integrity.service");
import type { DownloadHistoryEntry, DownloadedCourseEntry, LibraryItem } from "./types";

/**
 * Builds the local library from download history and folders on disk.
 */
class LibraryService {
	static list(
		rootDir: string,
		history: DownloadHistoryEntry[] = [],
		downloadedCourses: DownloadedCourseEntry[] = [],
		options: { scanIntegrity?: boolean } = {}
	): LibraryItem[] {
		const scanIntegrity = options.scanIntegrity !== false;
		const byId = new Map<string, LibraryItem>();

		(downloadedCourses || []).forEach((course) => {
			if (!course) return;
			const id = String(course.id);
			byId.set(id, {
				id,
				name: course.title || course.name || "Course",
				path: course.pathDownloaded || "",
				completed: Boolean(course.completed),
				encryptedVideos: Number(course.encryptedVideos) || 0,
				image: course.image || "",
				exists: false,
				modifiedAt: 0,
				sizeBytes: 0,
				downloadedAt: null,
				brokenCount: 0,
				okMediaCount: 0,
			});
		});

		(history || []).forEach((entry) => {
			if (!entry) return;
			const id = String(entry.id);
			const current = byId.get(id) || {
				id,
				name: entry.name || "Course",
				path: "",
				completed: false,
				encryptedVideos: 0,
				image: "",
				exists: false,
				modifiedAt: 0,
				sizeBytes: Number(entry.sizeBytes) || 0,
				downloadedAt: entry.date || null,
				brokenCount: 0,
				okMediaCount: 0,
			};
			current.name = entry.name || current.name;
			current.path = entry.pathDownloaded || current.path;
			current.completed = Boolean(entry.completed) || current.completed;
			current.encryptedVideos = Math.max(current.encryptedVideos, Number(entry.encryptedVideos) || 0);
			current.downloadedAt = entry.date || current.downloadedAt;
			if (entry.sizeBytes) current.sizeBytes = Number(entry.sizeBytes) || current.sizeBytes;
			byId.set(id, current);
		});

		if (rootDir && fs.existsSync(rootDir)) {
			try {
				fs.readdirSync(rootDir, { withFileTypes: true })
					.filter((dirent) => dirent.isDirectory())
					.forEach((dirent) => {
						const folderPath = path.join(rootDir, dirent.name);
						const already = [...byId.values()].find((item) => item.path === folderPath);
						if (already) return;

						byId.set(`folder:${dirent.name}`, {
							id: `folder:${dirent.name}`,
							name: dirent.name,
							path: folderPath,
							completed: true,
							encryptedVideos: 0,
							image: "",
							exists: true,
							modifiedAt: 0,
							sizeBytes: 0,
							downloadedAt: null,
							brokenCount: 0,
							okMediaCount: 0,
						});
					});
			} catch (error) {
				console.error("LibraryService.list readdir", error);
			}
		}

		return [...byId.values()]
			.map((item) => {
				const exists = Boolean(item.path && fs.existsSync(item.path));
				let modifiedAt = 0;
				let sizeBytes = item.sizeBytes || 0;
				let brokenCount = 0;
				let okMediaCount = 0;
				let downloadedAt = item.downloadedAt;

				if (exists) {
					try {
						modifiedAt = fs.statSync(item.path).mtimeMs || 0;
						if (!downloadedAt && modifiedAt) {
							downloadedAt = new Date(modifiedAt).toISOString();
						}
					} catch {
						modifiedAt = 0;
					}

					if (scanIntegrity) {
						const quick = IntegrityService.quickBrokenCount(item.path);
						brokenCount = quick.brokenCount;
						okMediaCount = quick.okMediaCount;
						sizeBytes = quick.sizeBytes || IntegrityService.folderSizeBytes(item.path);
					} else {
						sizeBytes = IntegrityService.folderSizeBytes(item.path);
					}
				}

				return {
					...item,
					exists,
					modifiedAt,
					sizeBytes,
					downloadedAt,
					brokenCount,
					okMediaCount,
				};
			})
			.sort((a, b) => b.modifiedAt - a.modifiedAt);
	}

	static removeFolder(rootDir: string, folderPath: string): boolean {
		if (!rootDir || !folderPath) {
			return false;
		}

		const root = path.resolve(rootDir);
		const target = path.resolve(folderPath);
		const relative = path.relative(root, target);

		if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("Path outside library");
		}

		if (!fs.existsSync(target)) {
			return false;
		}

		fs.rmSync(target, { recursive: true, force: true });
		return true;
	}

	static forget(
		item: { id: string; path?: string },
		history: DownloadHistoryEntry[] = [],
		downloadedCourses: DownloadedCourseEntry[] = []
	): { history: DownloadHistoryEntry[]; downloadedCourses: DownloadedCourseEntry[] } {
		const id = String(item?.id || "");
		const folder = item?.path ? path.resolve(item.path) : "";

		const matches = (entry: DownloadHistoryEntry | DownloadedCourseEntry): boolean => {
			if (!entry) return false;
			if (id && String(entry.id) === id) return true;
			if (folder && entry.pathDownloaded && path.resolve(entry.pathDownloaded) === folder) {
				return true;
			}
			return false;
		};

		return {
			history: (history || []).filter((entry) => !matches(entry)),
			downloadedCourses: (downloadedCourses || []).filter((entry) => !matches(entry)),
		};
	}

	static formatSize(bytes: number): string {
		const value = Number(bytes) || 0;
		if (value < 1024) return `${value} B`;
		const units = ["KB", "MB", "GB", "TB"];
		let size = value;
		let unit = -1;
		do {
			size /= 1024;
			unit += 1;
		} while (size >= 1024 && unit < units.length - 1);
		return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
	}
}

export = LibraryService;
