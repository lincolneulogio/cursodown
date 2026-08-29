"use strict";

/**
 * Lightweight JSON settings store (preload-safe).
 * Replaces electron-settings / avoids electron-store renderer IPC.
 */

const path = require("path");
const fs = require("fs");
const { homedir } = require("os");

const DownloadType = Object.freeze({
	Both: 0,
	OnlyLectures: 1,
	OnlyAttachments: 2,
});

const DownloadDefaultOptions = Object.freeze({
	checkNewVersion: true,
	defaultSubtitle: undefined,
	path: path.join(homedir(), "Downloads", "CursoDown"),
	autoStartDownload: false,
	continueDonwloadingEncrypted: false,
	enableDownloadStartEnd: false,
	downloadStart: 0,
	downloadEnd: 0,
	type: DownloadType.Both,
	skipSubtitles: false,
	autoRetry: false,
	videoQuality: "Auto",
	seqZeroLeft: false,
	maxConcurrentDownloads: 2,
	skipExistingFiles: true,
});

function getByPath(obj, keyPath) {
	if (!keyPath.includes(".")) return obj[keyPath];
	return keyPath.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj, keyPath, value) {
	if (!keyPath.includes(".")) {
		obj[keyPath] = value;
		return;
	}
	const parts = keyPath.split(".");
	let cursor = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i];
		if (typeof cursor[key] !== "object" || cursor[key] === null) {
			cursor[key] = {};
		}
		cursor = cursor[key];
	}
	cursor[parts[parts.length - 1]] = value;
}

class JsonFileStore {
	constructor(filePath, defaults = {}) {
		this.filePath = filePath;
		this.defaults = defaults;
		this.data = { ...defaults };
		this.#load();
	}

	#load() {
		try {
			if (fs.existsSync(this.filePath)) {
				const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
				this.data = { ...this.defaults, ...parsed };
				if (parsed.download) {
					this.data.download = { ...this.defaults.download, ...parsed.download };
				}
			} else {
				this.#persist();
			}
		} catch (error) {
			console.error("JsonFileStore load", error);
			this.data = { ...this.defaults };
		}
	}

	#persist() {
		try {
			fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
			fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
		} catch (error) {
			console.error("JsonFileStore persist", error);
		}
	}

	get(keyPath, defaultValue) {
		const value = getByPath(this.data, keyPath);
		return value === undefined ? defaultValue : value;
	}

	set(keyPath, value) {
		setByPath(this.data, keyPath, value);
		this.#persist();
	}
}

function createSettingsStore() {
	const userDataPath = process.env.USER_DATA_PATH || path.join(homedir(), ".cursodown");
	const store = new JsonFileStore(path.join(userDataPath, "Settings.json"), {
		language: "Español",
		theme: "dark",
		subdomain: "www",
		access_token: null,
		client_id: null,
		subscriber: false,
		session_user: null,
		download: { ...DownloadDefaultOptions },
		downloadedHistory: [],
		downloadedCourses: [],
	});

	function ensureDefaults() {
		if (!store.get("language") || store.get("language") === "English") {
			store.set("language", "Español");
		}
		const download = store.get("download") || {};
		Object.keys(DownloadDefaultOptions).forEach((key) => {
			if (download[key] === undefined) {
				download[key] = DownloadDefaultOptions[key];
			}
		});
		store.set("download", download);
		if (!store.get("theme")) {
			store.set("theme", "dark");
		}
	}

	ensureDefaults();

	return {
		DownloadType,
		DownloadDefaultOptions,
		get: (keyPath, defaultValue) => store.get(keyPath, defaultValue),
		set: (keyPath, value) => store.set(keyPath, value),
		get language() {
			return store.get("language") || "Español";
		},
		set language(value) {
			store.set("language", value || "Español");
		},
		get subDomain() {
			return store.get("subdomain", "www");
		},
		set subDomain(value) {
			store.set("subdomain", value || "www");
		},
		get accessToken() {
			return store.get("access_token");
		},
		set accessToken(value) {
			store.set("access_token", value || null);
			if (!value) {
				store.set("client_id", null);
				store.set("session_user", null);
			}
		},
		get clientId() {
			return store.get("client_id");
		},
		set clientId(value) {
			store.set("client_id", value || null);
		},
		get subscriber() {
			return Boolean(store.get("subscriber"));
		},
		set subscriber(value) {
			store.set("subscriber", Boolean(value));
		},
		get theme() {
			return store.get("theme", "dark") === "light" ? "light" : "dark";
		},
		set theme(value) {
			store.set("theme", value === "light" ? "light" : "dark");
		},
		get sessionUser() {
			return store.get("session_user", null);
		},
		set sessionUser(value) {
			store.set("session_user", value || null);
		},
		get download() {
			return store.get("download");
		},
		set download(value) {
			store.set("download", value);
		},
		get downloadHistory() {
			return store.get("downloadedHistory", []);
		},
		set downloadHistory(value) {
			store.set("downloadedHistory", value || []);
		},
		get downloadedCourses() {
			return store.get("downloadedCourses", []);
		},
		set downloadedCourses(value) {
			store.set("downloadedCourses", value || []);
		},
		downloadDirectory(courseName = "") {
			const downloadDir = store.get("download.path") || DownloadDefaultOptions.path;
			return path.join(downloadDir, courseName || "");
		},
		getSnapshot() {
			return {
				language: this.language,
				theme: this.theme,
				subDomain: this.subDomain,
				accessToken: this.accessToken,
				clientId: this.clientId,
				subscriber: this.subscriber,
				sessionUser: this.sessionUser,
				download: { ...(this.download || {}) },
				downloadHistory: this.downloadHistory,
				downloadedCourses: this.downloadedCourses,
				downloadPath: this.downloadDirectory(),
			};
		},
	};
}

/** @type {ReturnType<typeof createSettingsStore>|null} */
let singleton = null;

function getSettingsStore() {
	if (!singleton) {
		singleton = createSettingsStore();
	}
	return singleton;
}

module.exports = { createSettingsStore, getSettingsStore, DownloadType, DownloadDefaultOptions };
