"use strict";

/**
 * Preload Phase 4/5 — contextIsolation + full app API for React renderer.
 * Business services run here (Node). UI only sees window.udeler.
 */

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");

const { version: appVersion, vars: pkgVars } = require("../../package.json");
const { createSettingsStore, getSettingsStore } = require("../../app/helpers/settings-store");
const utils = require("../../app/helpers/utils");
const plannerCore = require("../../app/helpers/planner-core");
const { buildCourseData } = require("../../app/helpers/course-builder");
const UdemyService = require("../../app/core/services/udemy.service");
const DownloadQueue = require("../../app/core/services/download-queue.service");
const DownloadService = require("../../app/core/services/download.service");
const LibraryService = require("../../app/core/services/library.service");
const { exportCourseIndex, structureFromFolder } = require("../../app/helpers/course-export");
const { resolveCoursePath } = require("../../app/helpers/path-template");
const { getVolumeSpace, folderSizeBytes } = require("../../app/helpers/disk-space");
const IntegrityService = require("../../app/core/services/integrity.service");
const selectiveDownload = require("../../app/helpers/selective-download");

const Settings = getSettingsStore();
const localeMeta = require("../../app/locale/meta.json");

/** @type {Record<string, string>} */
let localeJson = {};
/** @type {Record<string, string>} */
let localeEsFallback = {};
/** @type {import('../../app/core/services/udemy.service')|null} */
let udemyService = null;
const downloadQueue = new DownloadQueue(2);
const logs = [];
const MAX_LOGS = 500;
/** @type {Record<string, { encryptedVideos: number, videoCount: number, totalLectures: number, checkedAt: number }>} */
const drmCache = { ...(Settings.drmCache || {}) };
/** @type {Map<string, { startedAt: number, progress: number, speedBps: number, title: string, path?: string }>} */
const liveProgress = new Map();

let drmPersistTimer = null;
function persistDrmCacheSoon() {
	if (drmPersistTimer) return;
	drmPersistTimer = setTimeout(() => {
		drmPersistTimer = null;
		try {
			Settings.drmCache = { ...drmCache };
		} catch (error) {
			console.error("persist drmCache", error);
		}
	}, 400);
}

function getCachedDrm(courseId) {
	return drmCache[String(courseId)] || null;
}

function cacheDrmStatus(courseId, result = {}) {
	const id = String(courseId);
	drmCache[id] = {
		encryptedVideos: Number(result.encryptedVideos) || 0,
		videoCount: Number(result.videoCount) || 0,
		totalLectures: Number(result.totalLectures) || 0,
		checkedAt: Date.now(),
	};
	persistDrmCacheSoon();
	return drmCache[id];
}

function classifyLog(title, detail) {
	const text = `${title || ""} ${typeof detail === "string" ? detail : JSON.stringify(detail || "")}`.toLowerCase();
	if (
		text.includes("error") ||
		text.includes("failed") ||
		text.includes("invalid") ||
		text.includes("exception")
	) {
		return { level: "error", category: "error" };
	}
	if (text.includes("drm") || text.includes("encrypted")) {
		return { level: "warning", category: "drm" };
	}
	if (text.includes("remux") || text.includes("mpeg-ts") || text.includes("saved as .ts")) {
		return { level: "info", category: "remux" };
	}
	if (text.includes("warn")) {
		return { level: "warning", category: "general" };
	}
	return { level: "info", category: "general" };
}

function pathToMediaUrl(filePath) {
	const absolute = path.resolve(String(filePath || ""));
	const encoded = encodeURIComponent(Buffer.from(absolute, "utf8").toString("base64"));
	return `coursedown-media://${encoded}`;
}

function listPlayableMedia(folderPath) {
	if (!folderPath || !fs.existsSync(folderPath)) return [];
	const files = IntegrityService.walkMediaFiles(folderPath);
	return files
		.map((absolutePath) => {
			let sizeBytes = 0;
			try {
				sizeBytes = fs.statSync(absolutePath).size;
			} catch {
				sizeBytes = 0;
			}
			return {
				path: absolutePath,
				name: path.relative(folderPath, absolutePath).split(path.sep).join("/"),
				url: pathToMediaUrl(absolutePath),
				sizeBytes,
				ok: sizeBytes > 0 && IntegrityService.inspectFile(absolutePath).ok,
			};
		})
		.filter((item) => item.ok)
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function loadEsFallback() {
	try {
		localeEsFallback = JSON.parse(
			fs.readFileSync(path.join(__dirname, "../../app/locale/es.json"), "utf8")
		);
	} catch (_e) {
		localeEsFallback = {};
	}
}

function loadLocale(language) {
	try {
		const file = language === "English" ? "es.json" : localeMeta[language] || "es.json";
		const fullPath = path.join(__dirname, "../../app/locale", file);
		localeJson = JSON.parse(fs.readFileSync(fullPath, "utf8"));
	} catch (error) {
		console.error("loadLocale", error);
		localeJson = { ...localeEsFallback };
	}
}

function translate(text) {
	const value = localeJson[text];
	if (typeof value === "string" && value.trim() !== "") {
		return value;
	}
	const fallback = localeEsFallback[text];
	if (typeof fallback === "string" && fallback.trim() !== "") {
		return fallback;
	}
	return text;
}

loadEsFallback();
loadLocale(Settings.language);

function ensureUdemyService() {
	const sub = Settings.subDomain || "www";
	const expectedBase = `https://${sub}.udemy.com`;
	if (!udemyService || udemyService.urlBase !== expectedBase) {
		udemyService = new UdemyService(sub, 40000);
	}
	if (Settings.accessToken) {
		udemyService.setAuth(Settings.accessToken, Settings.clientId);
	}
	return udemyService;
}

const downloadService = new DownloadService({
	settings: Settings,
	utils,
	translate,
	httpTimeout: 40000,
	captureException: () => {},
});

/** @type {Set<Function>} */
const downloadEventHandlers = new Set();

function emitDownloadEvent(event, payload) {
	downloadEventHandlers.forEach((handler) => {
		try {
			handler(event, payload);
		} catch (error) {
			console.error("download event handler", error);
		}
	});
}

function upsertPendingDownload(item) {
	const id = String(item.courseId);
	const list = (Settings.pendingDownloads || []).filter((entry) => String(entry.courseId) !== id);
	list.push({
		courseId: id,
		courseData: item.courseData,
		subtitle: item.subtitle || "",
		enqueuedAt: item.enqueuedAt || Date.now(),
		title: item.title || item.courseData?.name || id,
		image: item.image || "",
		url: item.url || "",
	});
	Settings.pendingDownloads = list;
}

function removePendingDownload(courseId) {
	const id = String(courseId);
	Settings.pendingDownloads = (Settings.pendingDownloads || []).filter(
		(entry) => String(entry.courseId) !== id
	);
}

function recordDownloadHistory(payload = {}) {
	const id = String(payload.courseId || "");
	if (!id) return;
	const pathDownloaded = payload.pathDownloaded || payload.pathCourse || "";
	let sizeBytes = 0;
	try {
		if (pathDownloaded && fs.existsSync(pathDownloaded)) {
			sizeBytes = IntegrityService.folderSizeBytes(pathDownloaded);
		}
	} catch (_error) {}

	const entry = {
		id,
		name: payload.courseName || payload.title || id,
		completed: payload.completed !== false,
		encryptedVideos: Number(payload.encryptedVideos) || 0,
		pathDownloaded,
		date: new Date().toISOString(),
		sizeBytes,
	};

	const history = (Settings.downloadHistory || []).filter((item) => String(item.id) !== id);
	history.unshift(entry);
	Settings.downloadHistory = history.slice(0, 200);

	const courses = Settings.downloadedCourses || [];
	const mapped = courses.map((c) => ({ ...c }));
	const idx = mapped.findIndex((c) => String(c.id) === id);
	const nextCourse = {
		...(idx >= 0 ? mapped[idx] : { id }),
		id: idx >= 0 ? mapped[idx].id : id,
		title: entry.name,
		name: entry.name,
		completed: entry.completed,
		encryptedVideos: entry.encryptedVideos,
		pathDownloaded: entry.pathDownloaded,
		individualProgress: entry.completed ? 100 : undefined,
		combinedProgress: entry.completed ? 100 : undefined,
		progressStatus: entry.completed ? "Completed" : "Incomplete",
		image: payload.image || (idx >= 0 ? mapped[idx].image : ""),
		url: payload.url || (idx >= 0 ? mapped[idx].url : ""),
	};
	Settings.downloadedCourses = [nextCourse, ...mapped.filter((c) => String(c.id) !== id)];
}

function showToast(title, body) {
	if (Settings.notificationsEnabled === false) return;
	ipcRenderer
		.invoke("show-notification", {
			title: String(title || "CursoDown"),
			body: String(body || ""),
		})
		.catch((error) => appendLog("notification", error && error.message));
}

function sanitizeCourseName(name) {
	try {
		const sanitize = require("sanitize-filename");
		return sanitize(String(name || "course"));
	} catch (_error) {
		return String(name || "course").replace(/[<>:"/\\|?*]/g, "_");
	}
}

/** Avoid double-resume on hot reload */
let queueRestored = false;

function restorePersistentQueue() {
	if (queueRestored) return { restored: 0 };
	queueRestored = true;
	if (Settings.download?.autoStartDownload === false) {
		appendLog("Queue restore skipped", "autoStartDownload is off");
		return { restored: 0 };
	}
	const pending = Settings.pendingDownloads || [];
	if (!pending.length) return { restored: 0 };

	downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
	let restored = 0;
	for (const item of pending) {
		if (!item || !item.courseId || !item.courseData) continue;
		const id = String(item.courseId);
		if (downloadQueue.isActive(id)) continue;
		const status = downloadQueue.enqueue(id, () => {
			downloadService.start(id, item.courseData, item.subtitle || "");
		});
		if (status !== "duplicate") restored += 1;
	}
	appendLog("Queue restored", `${restored} course(s)`);
	return { restored };
}

[
	"path",
	"progress:combined",
	"progress:individual",
	"speed",
	"quality",
	"pause-state",
	"drm",
	"log",
	"encrypted-stop",
	"complete",
	"notify",
	"error",
].forEach((eventName) => {
	downloadService.on(eventName, (payload) => {
		if (eventName === "log") {
			appendLog(payload.title, payload.detail);
		}
		if (eventName === "path") {
			const current = liveProgress.get(String(payload.courseId)) || {
				startedAt: Date.now(),
				progress: 0,
				speedBps: 0,
				title: payload.courseName || String(payload.courseId),
			};
			current.path = payload.downloadPath || current.path;
			current.title = payload.courseName || current.title;
			liveProgress.set(String(payload.courseId), current);
		}
		if (eventName === "progress:combined") {
			const id = String(payload.courseId);
			const current = liveProgress.get(id) || {
				startedAt: Date.now(),
				progress: 0,
				speedBps: 0,
				title: payload.courseName || id,
			};
			if (payload.action === "reset") {
				current.startedAt = Date.now();
				current.progress = 0;
				current.total = typeof payload.total === "number" ? payload.total : current.total;
				current.done = 0;
			} else if (payload.action === "increment") {
				const total = current.total || 1;
				current.done = Math.min(total, (current.done || 0) + 1);
				current.progress = Math.round((current.done / total) * 100);
			} else if (typeof payload.percent === "number") {
				current.progress = payload.percent;
			}
			liveProgress.set(id, current);
		}
		if (eventName === "speed") {
			const id = String(payload.courseId);
			const current = liveProgress.get(id) || {
				startedAt: Date.now(),
				progress: 0,
				speedBps: 0,
				title: payload.courseName || id,
			};
			const value = Number(payload.value) || 0;
			const unit = String(payload.unit || "B/s").toLowerCase();
			let bps = value;
			if (unit.startsWith("kb")) bps = value * 1024;
			else if (unit.startsWith("mb")) bps = value * 1024 * 1024;
			else if (unit.startsWith("gb")) bps = value * 1024 * 1024 * 1024;
			current.speedBps = bps;
			liveProgress.set(id, current);
		}
		if (eventName === "complete" || eventName === "encrypted-stop" || eventName === "error") {
			downloadQueue.complete(payload.courseId);
			removePendingDownload(payload.courseId);
			liveProgress.delete(String(payload.courseId));
		}
		if (eventName === "complete") {
			recordDownloadHistory({
				courseId: payload.courseId,
				courseName: payload.courseName,
				pathDownloaded: payload.pathCourse || payload.downloadPath,
				completed: true,
				encryptedVideos: payload.encryptedVideos,
			});
		}
		if (eventName === "notify") {
			showToast(
				payload.courseName || translate("Completed"),
				translate("Course download finished")
			);
		}
		if (eventName === "error" || eventName === "encrypted-stop") {
			const name = payload.courseName || String(payload.courseId || "");
			showToast(
				translate("Download Failed"),
				name
					? `${name}: ${payload.error?.message || translate("Download Failed")}`
					: translate("Download Failed")
			);
		}
		emitDownloadEvent(eventName, payload);
	});
});

function appendLog(title, detail, meta = {}) {
	const classified = classifyLog(title, detail);
	const entry = {
		title: String(title || ""),
		detail: detail == null ? "" : typeof detail === "string" ? detail : JSON.stringify(detail, null, 2),
		at: new Date().toISOString(),
		level: meta.level || classified.level,
		category: meta.category || classified.category,
	};
	logs.unshift(entry);
	if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
	return entry;
}

function getDashboardSnapshot() {
	const downloadRoot = Settings.downloadDirectory();
	const volume = getVolumeSpace(downloadRoot);
	const libraryUsed = folderSizeBytes(downloadRoot);
	const libraryItems = LibraryService.list(downloadRoot, Settings.downloadHistory, Settings.downloadedCourses || [], {
		scanIntegrity: false,
	});

	const active = [...liveProgress.entries()].map(([courseId, state]) => {
		const progress = Math.max(0, Math.min(100, Number(state.progress) || 0));
		const elapsedSec = Math.max(1, (Date.now() - (state.startedAt || Date.now())) / 1000);
		let etaSeconds = null;
		if (progress > 1 && progress < 100) {
			const rate = progress / elapsedSec;
			etaSeconds = Math.round((100 - progress) / Math.max(rate, 0.0001));
		}
		return {
			courseId,
			title: state.title || courseId,
			progress,
			speedBps: state.speedBps || 0,
			etaSeconds,
			path: state.path || "",
			active: true,
		};
	});

	const courses = libraryItems.map((item) => {
		const live = liveProgress.get(String(item.id));
		const progress = live
			? live.progress
			: item.completed
				? 100
				: item.okMediaCount > 0
					? Math.min(99, Math.round((item.okMediaCount / Math.max(item.okMediaCount + item.brokenCount, 1)) * 100))
					: 0;
		return {
			id: item.id,
			name: item.name,
			path: item.path,
			progress,
			sizeBytes: item.sizeBytes || 0,
			completed: item.completed,
			exists: item.exists,
			brokenCount: item.brokenCount || 0,
		};
	});

	return {
		downloadPath: downloadRoot,
		disk: volume
			? {
					freeBytes: volume.freeBytes,
					totalBytes: volume.totalBytes,
					usedBytes: volume.usedBytes,
					libraryBytes: libraryUsed,
			  }
			: {
					freeBytes: 0,
					totalBytes: 0,
					usedBytes: 0,
					libraryBytes: libraryUsed,
			  },
		queue: {
			running: downloadQueue.runningCount,
			pending: downloadQueue.pendingCount,
			concurrency: downloadQueue.concurrency,
		},
		active,
		courses,
	};
}

function mapUser(user) {
	if (!user) return null;
	return {
		id: user.id,
		name: user.display_name || user.title || user.name || "",
		email: user.email || "",
		image: user.image_50x50 || user.image_100x100 || "",
	};
}

function parseToken(raw) {
	return utils.parseUdemyCredentials(raw);
}

const udelerApi = {
	versions: {
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
	},
	env: {
		debugMode: Boolean(process.env.DEBUG_MODE),
		isPackage: Boolean(process.env.IS_PACKAGE),
		sentryDsn: process.env.SENTRY_DSN || "",
		userDataPath: process.env.USER_DATA_PATH || "",
		appVersion,
		urlHelp: pkgVars.urlHelp,
	},
	shell: {
		openExternal: (url) => ipcRenderer.invoke("shell-open-external", String(url || "")),
		openPath: (target) => ipcRenderer.invoke("shell-open-path", String(target || "")),
	},
	dialog: {
		selectDirectory: () => ipcRenderer.invoke("select-directory"),
		showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options || {}),
		showErrorBox: (title, message) => ipcRenderer.send("show-error-box", { title, message }),
	},
	auth: {
		openUdemyLogin: async (payload = {}) => {
			const subdomain = String(payload.subdomain || Settings.subDomain || "www").trim() || "www";
			Settings.subDomain = subdomain;
			const session = await ipcRenderer.invoke("open-udemy-login", { subdomain });
			if (!session || !session.accessToken) return null;
			const parsed = parseToken(session.accessToken);
			Settings.accessToken = parsed.accessToken;
			Settings.clientId = parsed.clientId || session.clientId || null;
			Settings.subDomain = session.subDomain || subdomain;
			const check = await udelerApi.auth.checkSession();
			return check.ok
				? {
						accessToken: Settings.accessToken,
						clientId: Settings.clientId,
						subDomain: Settings.subDomain,
				  }
				: null;
		},
		loginWithToken: async (token, subdomain) => {
			const parsed = parseToken(token);
			if (!parsed.accessToken) return null;
			Settings.accessToken = parsed.accessToken;
			Settings.clientId = parsed.clientId;
			Settings.subDomain = subdomain || "www";
			const check = await udelerApi.auth.checkSession();
			return check.user;
		},
		logout: () => {
			Settings.accessToken = null;
			Settings.sessionUser = null;
			udemyService = null;
		},
		checkSession: async () => {
			try {
				if (!Settings.accessToken) {
					return { ok: false, user: null, error: "no-token" };
				}
				const service = ensureUdemyService();
				const profile = await service.fetchProfile(Settings.accessToken, 40000, Settings.clientId);
				const rawUser = profile?.header?.user ?? null;
				const header = profile?.header;
				const isLoggedIn =
					Boolean(header?.isLoggedIn) || Boolean(rawUser && (rawUser.id || rawUser.email));
				if (!isLoggedIn || !rawUser) {
					return { ok: false, user: null, error: "no-user" };
				}
				const user = mapUser(rawUser);
				Settings.sessionUser = user;
				return { ok: true, user };
			} catch (error) {
				const status = error && error.response ? error.response.status : 0;
				const message =
					status === 403
						? "Sesión rechazada (403). Vuelve a iniciar sesión o revisa el access token."
						: error && error.message
							? error.message
							: String(error);
				appendLog("checkSession", message);
				if (status === 401 || status === 403) {
					Settings.accessToken = null;
					Settings.sessionUser = null;
				}
				return { ok: false, user: null, error: message };
			}
		},
	},
	settings: {
		getSnapshot: () => Settings.getSnapshot(),
		save: (partial = {}) => {
			if (partial.language != null) {
				Settings.language = partial.language;
				loadLocale(Settings.language);
			}
			if (partial.theme != null) Settings.theme = partial.theme;
			if (partial.subDomain != null) Settings.subDomain = partial.subDomain;
			if (partial.subscriber != null) Settings.subscriber = partial.subscriber;
			if (partial.download && typeof partial.download === "object") {
				Settings.download = { ...Settings.download, ...partial.download };
				downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
			}
			if (partial.downloadedCourses != null) {
				Settings.downloadedCourses = partial.downloadedCourses;
			}
			if (partial.downloadHistory != null) {
				Settings.downloadHistory = partial.downloadHistory;
			}
			if (partial.pendingDownloads != null) {
				Settings.pendingDownloads = partial.pendingDownloads;
			}
			if (partial.notificationsEnabled != null) {
				Settings.notificationsEnabled = partial.notificationsEnabled;
			}
			if (partial.uiDensity != null) {
				Settings.uiDensity = partial.uiDensity;
			}
			return Settings.getSnapshot();
		},
		setTheme: (theme) => {
			Settings.theme = theme;
		},
		setDensity: (density) => {
			Settings.uiDensity = density;
		},
	},
	i18n: {
		translate: (key) => translate(key),
		getLanguage: () => Settings.language,
		getLanguages: () => Object.keys(localeMeta),
	},
	courses: {
		fetch: async (pageSize = 25) => {
			const service = ensureUdemyService();
			if (!Settings.accessToken) {
				throw new Error("No hay sesión. Inicia sesión de nuevo.");
			}
			try {
				return await service.fetchCourses(pageSize, Settings.subscriber);
			} catch (error) {
				const status = error && error.response ? error.response.status : 0;
				if (status === 403) {
					throw new Error("Sesión rechazada (403). Vuelve a iniciar sesión.");
				}
				throw error;
			}
		},
		search: async (keyword, pageSize = 25) => {
			const service = ensureUdemyService();
			try {
				return await service.fetchSearchCourses(keyword, pageSize, Settings.subscriber);
			} catch (error) {
				const status = error && error.response ? error.response.status : 0;
				if (status === 403) {
					throw new Error("Sesión rechazada (403). Vuelve a iniciar sesión.");
				}
				throw error;
			}
		},
		loadMore: async (url) => {
			const service = ensureUdemyService();
			return service.fetchLoadMore(url);
		},
		fetchContent: async (courseId, meta = {}) => {
			const service = ensureUdemyService();
			const response = await service.fetchCourseContent(courseId, "all");
			if (!response) {
				return null;
			}
			const courseName =
				(typeof meta.name === "string" && meta.name.trim()) ||
				(typeof meta.title === "string" && meta.title.trim()) ||
				String(courseId);
			const courseUrl = typeof meta.url === "string" ? meta.url : "";
			const built = buildCourseData({
				courseId,
				courseName,
				courseUrl,
				response,
				settings: Settings,
				instructor: typeof meta.instructor === "string" ? meta.instructor : "",
				onLog: (title, ...details) => appendLog(title, details.join(" | ")),
			});
			if (built) {
				cacheDrmStatus(courseId, {
					encryptedVideos: Number(built.encryptedVideos) || 0,
					videoCount: Number(built.videoCount) || 0,
					totalLectures: Number(built.totalLectures) || 0,
				});
			}
			return built;
		},
		scanDrm: async (courseId) => {
			const service = ensureUdemyService();
			const result = await service.scanCourseDrm(courseId);
			return cacheDrmStatus(courseId, result);
		},
		getDrmCache: () => ({ ...drmCache }),
		clearDrmCache: () => {
			for (const key of Object.keys(drmCache)) {
				delete drmCache[key];
			}
			Settings.drmCache = {};
		},
	},
	downloads: {
		enqueue: (courseId, courseData, subtitle = "", meta = {}) => {
			downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
			const id = String(courseId);
			const payload = {
				...courseData,
				instructor:
					courseData?.instructor ||
					meta.instructor ||
					"",
			};
			upsertPendingDownload({
				courseId: id,
				courseData: payload,
				subtitle,
				enqueuedAt: Date.now(),
				title: meta.title || payload?.name || id,
				image: meta.image || "",
				url: meta.url || "",
			});
			return downloadQueue.enqueue(id, () => {
				downloadService.start(id, payload, subtitle);
			});
		},
		cancel: (courseId) => {
			const id = String(courseId);
			downloadService.cancel(id);
			downloadQueue.cancel(id);
			removePendingDownload(id);
		},
		pause: (courseId) => downloadService.pause(courseId),
		resume: (courseId) => downloadService.resume(courseId),
		getQueueStatus: () => ({
			running: downloadQueue.runningCount,
			pending: downloadQueue.pendingCount,
			concurrency: downloadQueue.concurrency,
		}),
		isQueued: (courseId) => downloadQueue.isWaiting(courseId),
		isDownloading: (courseId) => downloadQueue.isRunning(courseId),
		isActive: (courseId) => downloadQueue.isActive(courseId),
		onEvent: (handler) => {
			downloadEventHandlers.add(handler);
			return () => downloadEventHandlers.delete(handler);
		},
		saveHistory: () => {
			Settings.pendingDownloads = Settings.pendingDownloads || [];
		},
		getDownloadedCourses: () => Settings.downloadedCourses || [],
		getPendingDownloads: () => Settings.pendingDownloads || [],
		restoreQueue: () => restorePersistentQueue(),
		retryBroken: async (courseId, meta = {}) => {
			const id = String(courseId);
			const service = ensureUdemyService();
			const response = await service.fetchCourseContent(id, "all");
			if (!response) throw new Error("Course not found");
			const courseName =
				(typeof meta.name === "string" && meta.name.trim()) ||
				(typeof meta.title === "string" && meta.title.trim()) ||
				id;
			const built = buildCourseData({
				courseId: id,
				courseName,
				courseUrl: typeof meta.url === "string" ? meta.url : "",
				response,
				settings: Settings,
				instructor: typeof meta.instructor === "string" ? meta.instructor : "",
				onLog: (title, ...details) => appendLog(title, details.join(" | ")),
			});
			if (!built) throw new Error("Could not build course data");

			const coursePath =
				meta.path ||
				(Settings.downloadedCourses || []).find((c) => String(c.id) === id)?.pathDownloaded ||
				Settings.downloadDirectory(sanitizeCourseName(built.name));

			IntegrityService.removeBroken(coursePath);
			const keys = selectiveDownload.selectKeysByMode(utils, built, coursePath, "missing");
			if (keys.length === 0) {
				return { status: "noop", count: 0 };
			}
			const filtered = plannerCore.filterCourse(built, keys);
			const status = udelerApi.downloads.enqueue(
				id,
				filtered,
				Settings.download.defaultSubtitle || "",
				{
					title: courseName,
					image: meta.image,
					url: meta.url,
				}
			);
			return { status, count: keys.length };
		},
	},
	library: {
		list: (options = {}) =>
			LibraryService.list(
				Settings.downloadDirectory(),
				Settings.downloadHistory,
				Settings.downloadedCourses || [],
				{ scanIntegrity: options.scanIntegrity !== false }
			),
		remove: (id, folderPath) => {
			const removed = LibraryService.removeFolder(Settings.downloadDirectory(), folderPath);
			const next = LibraryService.forget(
				{ id, path: folderPath },
				Settings.downloadHistory,
				Settings.downloadedCourses
			);
			Settings.downloadHistory = next.history;
			Settings.downloadedCourses = next.downloadedCourses;
			return removed;
		},
		verify: (folderPath) => IntegrityService.verifyFolder(folderPath),
		removeBroken: (folderPath) => IntegrityService.removeBroken(folderPath),
		formatSize: (bytes) => LibraryService.formatSize(bytes),
		exportIndex: (folderPath, courseData = null) => {
			const data =
				courseData && Array.isArray(courseData.chapters)
					? courseData
					: structureFromFolder(folderPath, courseData?.name);
			return exportCourseIndex(data, folderPath);
		},
		resolvePath: (courseName, instructor = "") =>
			resolveCoursePath({
				downloadRoot: Settings.downloadDirectory(),
				courseName,
				instructor,
				layout: Settings.download.folderLayout === "instructor" ? "instructor" : "course",
			}),
	},
	planner: {
		filterCourse: (courseData, selectedKeys) => plannerCore.filterCourse(courseData, selectedKeys),
		stats: (courseData) => plannerCore.stats(courseData),
		selectKeys: (courseData, mode, coursePath = "") =>
			selectiveDownload.selectKeysByMode(utils, courseData, coursePath, mode || "all"),
		analyzeDisk: (courseData, coursePath = "") =>
			selectiveDownload.analyzeCourseOnDisk(utils, courseData, coursePath),
	},
	notify: {
		show: (title, body) => showToast(title, body),
		isEnabled: () => Settings.notificationsEnabled !== false,
		setEnabled: (value) => {
			Settings.notificationsEnabled = value !== false;
		},
	},
	app: {
		quit: () => ipcRenderer.send("quitApp"),
		onSaveDownloads: (callback) => {
			const listener = () => {
				try {
					callback();
				} catch (error) {
					console.error("onSaveDownloads", error);
				}
			};
			ipcRenderer.on("saveDownloads", listener);
			return () => ipcRenderer.removeListener("saveDownloads", listener);
		},
	},
	logs: {
		list: (filter = {}) => {
			let items = logs.slice();
			if (filter.level && filter.level !== "all") {
				items = items.filter((entry) => entry.level === filter.level);
			}
			if (filter.category && filter.category !== "all") {
				items = items.filter((entry) => entry.category === filter.category);
			}
			if (filter.query) {
				const q = String(filter.query).toLowerCase();
				items = items.filter(
					(entry) =>
						entry.title.toLowerCase().includes(q) || String(entry.detail || "").toLowerCase().includes(q)
				);
			}
			return items;
		},
		clear: () => {
			logs.length = 0;
		},
		append: (title, detail, meta) => appendLog(title, detail, meta),
		export: async () => {
			const content = logs
				.map((entry) => {
					return `[${entry.at}] [${entry.level}/${entry.category}] ${entry.title}\n${entry.detail || ""}`.trim();
				})
				.join("\n\n");
			const result = await ipcRenderer.invoke("show-save-dialog", {
				title: "Export logs",
				defaultPath: `cursodown-logs-${new Date().toISOString().slice(0, 10)}.txt`,
				filters: [
					{ name: "Text", extensions: ["txt", "log"] },
					{ name: "All", extensions: ["*"] },
				],
			});
			if (result?.canceled || !result?.filePath) {
				return { ok: false, canceled: true };
			}
			fs.writeFileSync(result.filePath, content || "(empty)", "utf8");
			return { ok: true, path: result.filePath };
		},
	},
	media: {
		toUrl: (filePath) => pathToMediaUrl(filePath),
		listInFolder: (folderPath) => listPlayableMedia(folderPath),
	},
	dashboard: {
		getSnapshot: () => getDashboardSnapshot(),
	},
};

contextBridge.exposeInMainWorld("udeler", udelerApi);
