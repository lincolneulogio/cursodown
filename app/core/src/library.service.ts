import * as fs from "fs";
import * as path from "path";
import IntegrityService = require("./integrity.service");
import type { DownloadHistoryEntry, DownloadedCourseEntry, LibraryItem } from "./types";

/**
 * Builds the local library from download history and folders on disk.
 */
class LibraryService {
	static MEDIA_EXT = new Set([
		".mp4",
		".mkv",
		".webm",
		".mov",
		".m4v",
		".avi",
		".mp3",
		".m4a",
		".wav",
	]);

	static folderHasMedia(folderPath: string, maxDepth = 2): boolean {
		if (!folderPath || !fs.existsSync(folderPath)) return false;
		const walk = (dir: string, depth: number): boolean => {
			if (depth < 0) return false;
			let entries: fs.Dirent[] = [];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return false;
			}
			for (const entry of entries) {
				const full = path.join(dir, entry.name);
				if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (LibraryService.MEDIA_EXT.has(ext)) return true;
				} else if (entry.isDirectory() && depth > 0) {
					if (walk(full, depth - 1)) return true;
				}
			}
			return false;
		};
		return walk(folderPath, maxDepth);
	}

	static readFolderMeta(folderPath: string): {
		image?: string;
		name?: string;
		instructor?: string;
		duration?: string;
		lectureCount?: number;
		id?: string;
	} {
		if (!folderPath || !fs.existsSync(folderPath)) return {};
		const metaPath = path.join(folderPath, "course-meta.json");
		if (!fs.existsSync(metaPath)) return {};
		try {
			const raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
				image?: string;
				name?: string;
				title?: string;
				instructor?: string;
				duration?: string;
				lectureCount?: number | string;
				id?: string | number;
			};
			const lectureCount = Number(raw.lectureCount);
			return {
				id: raw.id != null ? String(raw.id) : undefined,
				image: typeof raw.image === "string" ? raw.image : "",
				name: typeof raw.name === "string" ? raw.name : typeof raw.title === "string" ? raw.title : "",
				instructor: typeof raw.instructor === "string" ? raw.instructor : "",
				duration: typeof raw.duration === "string" ? raw.duration : "",
				lectureCount: Number.isFinite(lectureCount) && lectureCount > 0 ? lectureCount : undefined,
			};
		} catch {
			return {};
		}
	}

	static writeFolderMeta(
		folderPath: string,
		meta: {
			image?: string;
			name?: string;
			title?: string;
			id?: string | number;
			instructor?: string;
			duration?: string;
			lectureCount?: number;
		}
	): void {
		if (!folderPath || !fs.existsSync(folderPath)) return;
		try {
			const existing = LibraryService.readFolderMeta(folderPath);
			const lectureCount =
				meta.lectureCount != null && Number(meta.lectureCount) > 0
					? Number(meta.lectureCount)
					: existing.lectureCount;
			const payload = {
				id: meta.id != null ? String(meta.id) : existing.id,
				name: meta.name || meta.title || existing.name || "",
				title: meta.title || meta.name || existing.name || "",
				image: meta.image || existing.image || "",
				instructor: meta.instructor || existing.instructor || "",
				duration: meta.duration || existing.duration || "",
				lectureCount: lectureCount || undefined,
				updatedAt: new Date().toISOString(),
			};
			fs.writeFileSync(path.join(folderPath, "course-meta.json"), JSON.stringify(payload, null, 2), "utf8");
		} catch (error) {
			console.error("LibraryService.writeFolderMeta", error);
		}
	}

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
			if (entry.image) current.image = entry.image;
			byId.set(id, current);
		});

		if (rootDir && fs.existsSync(rootDir)) {
			try {
				const topDirs = fs
					.readdirSync(rootDir, { withFileTypes: true })
					.filter((dirent) => dirent.isDirectory());

				const addFolderItem = (folderPath: string, displayName: string) => {
					const already = [...byId.values()].find(
						(item) => item.path && path.resolve(item.path) === path.resolve(folderPath)
					);
					if (already) return;

					const folderMeta = LibraryService.readFolderMeta(folderPath);
					const key = `folder:${path.relative(rootDir, folderPath).replace(/[\\/]+/g, "/")}`;
					byId.set(key, {
						id: folderMeta.id || key,
						name: folderMeta.name || displayName,
						path: folderPath,
						completed: true,
						encryptedVideos: 0,
						image: folderMeta.image || "",
						exists: true,
						modifiedAt: 0,
						sizeBytes: 0,
						downloadedAt: null,
						brokenCount: 0,
						okMediaCount: 0,
						instructor: folderMeta.instructor || "",
						duration: folderMeta.duration || "",
						lectureCount: folderMeta.lectureCount,
					});
				};

				topDirs.forEach((dirent) => {
					const folderPath = path.join(rootDir, dirent.name);
					let childDirs: fs.Dirent[] = [];
					try {
						childDirs = fs
							.readdirSync(folderPath, { withFileTypes: true })
							.filter((child) => child.isDirectory());
					} catch {
						childDirs = [];
					}

					// Instructor layout: root/Instructor/Course — index nested courses.
					if (childDirs.length > 0) {
						const hasDirectMedia = LibraryService.folderHasMedia(folderPath);
						if (!hasDirectMedia) {
							childDirs.forEach((child) => {
								addFolderItem(path.join(folderPath, child.name), child.name);
							});
							return;
						}
					}

					addFolderItem(folderPath, dirent.name);
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
				let image = item.image || "";
				let name = item.name;
				let instructor = item.instructor || "";
				let duration = item.duration || "";
				let lectureCount = item.lectureCount;

				if (exists) {
					try {
						modifiedAt = fs.statSync(item.path).mtimeMs || 0;
						if (!downloadedAt && modifiedAt) {
							downloadedAt = new Date(modifiedAt).toISOString();
						}
					} catch {
						modifiedAt = 0;
					}

					const folderMeta = LibraryService.readFolderMeta(item.path);
					if (!image && folderMeta.image) image = folderMeta.image;
					if (folderMeta.name) name = folderMeta.name;
					if (!instructor && folderMeta.instructor) instructor = folderMeta.instructor;
					if (!duration && folderMeta.duration) duration = folderMeta.duration;
					if ((!lectureCount || lectureCount <= 0) && folderMeta.lectureCount) {
						lectureCount = folderMeta.lectureCount;
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
					name,
					image,
					instructor,
					duration,
					lectureCount,
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
