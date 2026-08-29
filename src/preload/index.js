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
const UdemyService = require("../../app/core/services/udemy.service");
const DownloadQueue = require("../../app/core/services/download-queue.service");
const DownloadService = require("../../app/core/services/download.service");
const LibraryService = require("../../app/core/services/library.service");

const Settings = getSettingsStore();
const localeMeta = require("../../app/locale/meta.json");

/** @type {Record<string, string>} */
let localeJson = {};
/** @type {import('../../app/core/services/udemy.service')|null} */
let udemyService = null;
const downloadQueue = new DownloadQueue(2);
const logs = [];
const MAX_LOGS = 200;

function loadLocale(language) {
	try {
		const file = language === "English" ? "es.json" : localeMeta[language] || "es.json";
		const fullPath = path.join(__dirname, "../../app/locale", file);
		localeJson = JSON.parse(fs.readFileSync(fullPath, "utf8"));
	} catch (error) {
		console.error("loadLocale", error);
		try {
			localeJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../app/locale/es.json"), "utf8"));
		} catch (_e) {
			localeJson = {};
		}
	}
}

function translate(text) {
	return localeJson[text] || text;
}

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
		if (eventName === "complete" || eventName === "encrypted-stop" || eventName === "error") {
			downloadQueue.complete(payload.courseId);
		}
		emitDownloadEvent(eventName, payload);
	});
});

function appendLog(title, detail) {
	const entry = {
		title: String(title || ""),
		detail: detail == null ? "" : typeof detail === "string" ? detail : JSON.stringify(detail, null, 2),
		at: new Date().toISOString(),
	};
	logs.unshift(entry);
	if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
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
		urlDonate: pkgVars.urlDonate,
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
				const user = mapUser(profile);
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
			return Settings.getSnapshot();
		},
		setTheme: (theme) => {
			Settings.theme = theme;
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
		fetchContent: async (courseId) => {
			const service = ensureUdemyService();
			return service.fetchCourseContent(courseId, "all");
		},
	},
	downloads: {
		enqueue: (courseId, courseData, subtitle = "") => {
			downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
			const id = String(courseId);
			return downloadQueue.enqueue(id, () => {
				downloadService.start(id, courseData, subtitle);
			});
		},
		cancel: (courseId) => {
			const id = String(courseId);
			downloadService.cancel(id);
			downloadQueue.cancel(id);
		},
		pause: (courseId) => downloadService.pause(courseId),
		resume: (courseId) => downloadService.resume(courseId),
		getQueueStatus: () => ({
			running: downloadQueue.runningCount,
			pending: downloadQueue.pendingCount,
			concurrency: downloadQueue.concurrency,
		}),
		onEvent: (handler) => {
			downloadEventHandlers.add(handler);
			return () => downloadEventHandlers.delete(handler);
		},
		saveHistory: () => {
			/* history is updated by UI via settings.save downloadedCourses */
		},
		getDownloadedCourses: () => Settings.downloadedCourses || [],
	},
	library: {
		list: () => LibraryService.list(Settings.downloadDirectory(), Settings.downloadHistory, Settings.downloadedCourses || []),
		remove: (id, folderPath) => {
			const removed = LibraryService.removeFolder(Settings.downloadDirectory(), folderPath);
			const next = LibraryService.forget({ id, path: folderPath }, Settings.downloadHistory, Settings.downloadedCourses);
			Settings.downloadHistory = next.history;
			Settings.downloadedCourses = next.downloadedCourses;
			return removed;
		},
	},
	planner: {
		filterCourse: (courseData, selectedKeys) => plannerCore.filterCourse(courseData, selectedKeys),
		stats: (courseData) => plannerCore.stats(courseData),
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
		list: () => logs.slice(),
		clear: () => {
			logs.length = 0;
		},
		append: (title, detail) => appendLog(title, detail),
	},
};

contextBridge.exposeInMainWorld("udeler", udelerApi);
