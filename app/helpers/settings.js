/**
 * @typedef {Enumerator} DownloadTypeSetting
 * @property {number} Both
 * @property {number} OnlyLectures
 * @property {number} OnlyAttachments
 */

/**
 * @typedef {Object} DownloadSetting
 * @property {boolean} checkNewVersion
 * @property {string} defaultSubtitle
 * @property {string} path
 * @property {boolean} autoStartDownload
 * @property {boolean} continueDonwloadingEncrypted
 * @property {boolean} enableDownloadStartEnd
 * @property {number} downloadStart
 * @property {boolean} downloadEnd
 * @property {string} videoQuality
 * @property {DownloadTypeSetting} type
 * @property {boolean} skipSubtitles
 * @property {boolean} seqZeroLeft
 * @property {boolean} autoRetry
 * @property {boolean} skipExistingFiles
 * @property {number} maxConcurrentDownloads
 */

/**
 * @typedef {Object} DownloadHistory
 * @property {number} id
 * @property {boolean} completed
 * @property {string} date
 * @property {number} encryptedVideos
 * @property {string} selectedSubtitle
 * @property {string} pathDownloaded
 */

/**
 * @typedef {Object} DownloadedCourses
 * @property {number} id
 * @property {string} url
 * @property {string} title
 * @property {string} image
 * @property {number} individualProgress
 * @property {number} combinedProgress
 * @property {boolean} completed
 * @property {string} progressStatus
 * @property {number} encryptedVideos
 * @property {string} selectedSubtitle
 * @property {string} pathDownloaded
 */

const Settings = (() => {
	"use strict";

	const settings = require("electron-settings");
	const path = require("path");
	const { homedir } = require("os");

	const userDataPath =
		(typeof window !== "undefined" && window.udeler && window.udeler.env.userDataPath) ||
		process.env.USER_DATA_PATH ||
		path.join(homedir(), ".cursodown");
	settings.setPath(path.join(userDataPath, "Settings"));

	/** @type {DownloadTypeSetting} */
	const DownloadType = Object.freeze({
		Both: 0,
		OnlyLectures: 1,
		OnlyAttachments: 2,
	});

	/** @type {DownloadSetting} */
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

	let _language = null;
	let _prettify = false;

	/**
	 * Ensures all default keys are set in the settings
	 * @internal
	 * @returns {void}
	 */
	function ensureDefaultKeys() {
		if (!settings.get("language") || settings.get("language") === "English") {
			settings.set("language", "Español");
		}

		if (!settings.get("download")) {
			settings.set("download", DownloadDefaultOptions);
		} else {
			Object.keys(DownloadDefaultOptions).forEach((key) => {
				if (settings.get(`download.${key}`) === undefined) {
					settings.set(`download.${key}`, DownloadDefaultOptions[key]);
				}
			});
		}

		if (!settings.get("theme")) {
			settings.set("theme", "dark");
		}
	}

	/**
	 * Get navigator default language and set in settings "language"
	 *
	 * @returns defined language
	 */
	function getLanguage() {
		try {
			let language = settings.get("language");

			if (!language) {
				const navigatorLang = navigator.language.substring(0, 2);
				const meta = require("../locale/meta.json");

				language = Object.keys(meta).find((key) => meta[key] === (navigatorLang === "pt" ? "pt_BR.json" : navigatorLang === "en" ? "es.json" : `${navigatorLang}.json`));

				if (!language) {
					language = "Español";
				}

				if (language) {
					settings.set("language", language, { prettify: _prettify });
				}
			}

			return language || "Español";
		} catch (error) {
			console.error("Error_Settings getLanguage(): " + error);
			return "Español";
		}
	}

	/**
	 * Get the download directory for a given course
	 * @param {string} courseName - The name of the course
	 * @returns {string} - The download directory path
	 */
	function downloadDirectory(courseName = "") {
		const download_dir = settings.get("download.path") || DownloadDefaultOptions.path;
		return path.join(download_dir, courseName);
	}

	// Initialize settings
	(function init() {
		console.log("Initialize settings");
		_prettify = process.env.PRETTIFY_SETTINGS || false;
		ensureDefaultKeys();
	})();

	return {
		DownloadType,
		DownloadDefaultOptions,
		/** @param {String, Object} */
		get: (keyPath, defaultValue = undefined) => settings.get(keyPath, defaultValue),
		/** @param {String, Object} */
		set: (keyPath, value) => settings.set(keyPath, value, { prettify: _prettify }),
		/** @type {string} */
		get language() {
			if (!_language) {
				_language = getLanguage();
			}
			return _language;
		},
		/** @type {string} */
		set language(value) {
			this.set("language", value || null);
			_language = value;
		},
		/** @type {string} */
		get subDomain() {
			return this.get("subdomain", "www");
		},
		/** @type {string} */
		set subDomain(value) {
			this.set("subdomain", value);
		},
		/** @type {string} */
		get accessToken() {
			return this.get("access_token");
		},
		/** @type {string} */
		set accessToken(value) {
			this.set("access_token", value || null);
			if (!value) {
				this.set("client_id", null);
				this.set("session_user", null);
			}
		},
		/** @type {string} */
		get clientId() {
			return this.get("client_id");
		},
		/** @type {string} */
		set clientId(value) {
			this.set("client_id", value || null);
		},
		/** @type {boolean} */
		get subscriber() {
			return Boolean(this.get("subscriber"));
		},
		/** @type {boolean} */
		set subscriber(value) {
			this.set("subscriber", value);
		},
		/** @type {"dark"|"light"} */
		get theme() {
			return this.get("theme", "dark") === "light" ? "light" : "dark";
		},
		/** @type {"dark"|"light"} */
		set theme(value) {
			this.set("theme", value === "light" ? "light" : "dark");
		},
		/** @type {{id?: string, name?: string, email?: string, image?: string}|null} */
		get sessionUser() {
			return this.get("session_user", null);
		},
		/** @type {{id?: string, name?: string, email?: string, image?: string}|null} */
		set sessionUser(value) {
			this.set("session_user", value || null);
		},
		/** @type {DownloadSetting} */
		get download() {
			return this.get("download");
		},
		/** @type {DownloadSetting} */
		set download(value) {
			this.set("download", value);
		},
		/** @type {Array<DownloadHistory>} */
		get downloadHistory() {
			return this.get("downloadedHistory", []);
		},
		/** @type {Array<DownloadHistory>} */
		set downloadHistory(value) {
			this.set("downloadedHistory", value);
		},
		/** @type {Array<DownloadedCourses>} */
		get downloadedCourses() {
			return this.get("downloadedCourses");
		},
		/** @type {Array<DownloadedCourses>} */
		set downloadedCourses(value) {
			this.set("downloadedCourses", value);
		},
		/** @param {String} */
		downloadDirectory: (courseName) => downloadDirectory(courseName),
	};
})();

module.exports = Settings;
