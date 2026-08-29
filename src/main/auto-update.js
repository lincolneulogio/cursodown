"use strict";

/**
 * Auto-update for the current stable release (v1.0.5).
 * Uses Node http(s) only — Electron 22 has no net.fetch.
 * Detects updates via semver and/or buildId in build-info.json.
 */

const { ipcMain, app } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const STABLE_TAG = "v1.0.5";
const STABLE_VERSION = "1.0.5";
const REPO = "lincolneulogio/cursodown";

/** @typedef {"idle"|"checking"|"available"|"not-available"|"downloading"|"downloaded"|"error"} UpdatePhase */

/** @type {{
 *   phase: UpdatePhase,
 *   currentVersion: string,
 *   availableVersion: string | null,
 *   releaseNotes: string | null,
 *   percent: number,
 *   error: string | null,
 *   packaged: boolean,
 *   buildId: number,
 *   remoteBuildId: number | null
 * }} */
let state = {
	phase: "idle",
	currentVersion: app.getVersion(),
	availableVersion: null,
	releaseNotes: null,
	percent: 0,
	error: null,
	packaged: app.isPackaged,
	buildId: 0,
	remoteBuildId: null,
};

/** @type {(() => import("electron").BrowserWindow | null) | null} */
let getMainWindow = null;
let wired = false;
let checking = false;
/** @type {string | null} */
let pendingInstallerPath = null;
/** @type {string | null} */
let pendingInstallerUrl = null;

function loadLocalBuildInfo() {
	try {
		return require("../../app/build-info.json");
	} catch (_error) {
		return { stableVersion: STABLE_VERSION, buildId: 0, releasedAt: null, gitSha: null };
	}
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 if a>b, -1 if a<b, 0 if equal
 */
function cmpSemver(a, b) {
	const pa = String(a || "0")
		.replace(/^v/i, "")
		.split(".")
		.map((n) => parseInt(n, 10) || 0);
	const pb = String(b || "0")
		.replace(/^v/i, "")
		.split(".")
		.map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < 3; i++) {
		const d = (pa[i] || 0) - (pb[i] || 0);
		if (d > 0) return 1;
		if (d < 0) return -1;
	}
	return 0;
}

function snapshot() {
	const local = loadLocalBuildInfo();
	return {
		...state,
		currentVersion: app.getVersion(),
		packaged: app.isPackaged,
		buildId: Number(local.buildId) || 0,
	};
}

function broadcast(channel, payload) {
	const win = typeof getMainWindow === "function" ? getMainWindow() : null;
	if (win && !win.isDestroyed()) {
		win.webContents.send(channel, payload);
	}
}

function setState(patch) {
	state = { ...state, ...patch };
	broadcast("updates:state", snapshot());
}

function isTransientPublishError(message) {
	return /latest\.ya?ml|build-info\.json|404|Cannot find latest|HttpError:\s*404|ENOTFOUND/i.test(
		String(message || "")
	);
}

function friendlyUpdateError(err) {
	const raw =
		err && typeof err === "object" && "message" in err ? String(err.message) : String(err || "Update error");
	if (/net\.fetch is not a function/i.test(raw)) {
		return "UPDATE_NETWORK";
	}
	if (/latest\.ya?ml|build-info\.json|Cannot find latest|HttpError:\s*404/i.test(raw)) {
		return "UPDATE_PUBLISHING";
	}
	if (/sha512|checksum mismatch/i.test(raw)) {
		return "UPDATE_CHECKSUM";
	}
	if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::|network/i.test(raw)) {
		return "UPDATE_NETWORK";
	}
	const firstLine = raw.split(/\r?\n/)[0].trim();
	return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
}

/**
 * Electron 22 has no net.fetch — use Node http(s) with redirects.
 * @param {string} url
 * @param {number} [redirects]
 * @returns {Promise<{ ok: boolean, status: number, buffer: Buffer }>}
 */
function httpGet(url, redirects = 0) {
	return new Promise((resolve, reject) => {
		let parsed;
		try {
			parsed = new URL(url);
		} catch (error) {
			reject(error);
			return;
		}
		const lib = parsed.protocol === "http:" ? http : https;
		const req = lib.get(
			url,
			{
				headers: {
					"User-Agent": "CursoDown-Updater",
					Accept: "*/*",
				},
			},
			(res) => {
				const status = res.statusCode || 0;
				const location = res.headers.location;
				if (location && [301, 302, 303, 307, 308].includes(status)) {
					if (redirects >= 10) {
						res.resume();
						reject(new Error("Too many redirects"));
						return;
					}
					const next = new URL(location, url).toString();
					res.resume();
					resolve(httpGet(next, redirects + 1));
					return;
				}
				/** @type {Buffer[]} */
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("end", () => {
					resolve({
						ok: status >= 200 && status < 300,
						status,
						buffer: Buffer.concat(chunks),
					});
				});
			}
		);
		req.on("error", reject);
	});
}

async function fetchText(url) {
	const res = await httpGet(url);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for ${url}`);
	}
	return res.buffer.toString("utf8");
}

async function fetchJson(url) {
	const text = await fetchText(url);
	return JSON.parse(text);
}

function parseLatestYml(yml) {
	const version = (yml.match(/^version:\s*(.+)$/m) || [])[1]?.trim() || "1.0.0";
	const filePath = (yml.match(/^path:\s*(.+)$/m) || [])[1]?.trim() || "";
	const sha512 = (yml.match(/^sha512:\s*(.+)$/m) || [])[1]?.trim() || "";
	const releaseDate = (yml.match(/^releaseDate:\s*(.+)$/m) || [])[1]?.trim() || null;
	return { version, filePath, sha512, releaseDate };
}

function releaseAssetUrl(fileName, tag = STABLE_TAG) {
	return `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
}

async function fetchRemoteBuildInfo() {
	// Always prefer GitHub "Latest" so installs built with an older STABLE_TAG
	// (e.g. v1.0.4) still discover newer releases (v1.0.5+).
	const latestApi = `https://api.github.com/repos/${REPO}/releases/latest`;
	try {
		const release = await fetchJson(latestApi);
		const tag = String(release.tag_name || STABLE_TAG);
		const asset = (release.assets || []).find((a) => a && a.name === "build-info.json");
		if (asset?.browser_download_url) {
			const info = await fetchJson(asset.browser_download_url);
			return { ...info, _tag: tag };
		}
		const info = await fetchJson(releaseAssetUrl("build-info.json", tag));
		return { ...info, _tag: tag };
	} catch (latestError) {
		try {
			const info = await fetchJson(releaseAssetUrl("build-info.json", STABLE_TAG));
			return { ...info, _tag: STABLE_TAG };
		} catch (_stableError) {
			throw latestError;
		}
	}
}

function defaultInstallerName() {
	if (process.platform === "darwin") {
		return process.arch === "arm64"
			? `CursoDown_Setup-v${STABLE_VERSION}_mac-arm64.dmg`
			: `CursoDown_Setup-v${STABLE_VERSION}_mac-x64.dmg`;
	}
	if (process.platform === "linux") {
		return `CursoDown_Setup-v${STABLE_VERSION}_linux-x86_64.AppImage`;
	}
	return `CursoDown_Setup-v${STABLE_VERSION}_win-x64.exe`;
}

async function checkForUpdates({ silent = false } = {}) {
	if (!app.isPackaged) {
		setState({
			phase: "not-available",
			error: silent ? null : "Updates only run in the packaged app",
		});
		return snapshot();
	}
	if (checking) return snapshot();
	checking = true;
	setState({ phase: "checking", error: null });

	try {
		const local = loadLocalBuildInfo();
		const localBuildId = Number(local.buildId) || 0;
		const localVersion = app.getVersion();
		const remote = await fetchRemoteBuildInfo();
		const remoteBuildId = Number(remote.buildId) || 0;
		const remoteTag = String(remote._tag || STABLE_TAG);
		const remoteVersion = String(
			remote.stableVersion || String(remoteTag).replace(/^v/i, "") || STABLE_VERSION
		);

		const newerSemver = cmpSemver(remoteVersion, localVersion) > 0;
		const newerBuild = remoteBuildId > localBuildId;

		if (newerSemver || newerBuild) {
			checking = false;
			pendingInstallerUrl = null;
			try {
				const yml = await fetchText(releaseAssetUrl("latest.yml", remoteTag));
				const parsed = parseLatestYml(yml);
				if (parsed.filePath) {
					pendingInstallerUrl = releaseAssetUrl(parsed.filePath, remoteTag);
				}
			} catch (_ymlError) {
				pendingInstallerUrl = releaseAssetUrl(defaultInstallerName(), remoteTag);
			}

			setState({
				phase: "available",
				availableVersion: remoteVersion,
				remoteBuildId,
				buildId: localBuildId,
				releaseNotes: remote.releasedAt ? `build ${remoteBuildId}` : null,
				error: null,
			});
			return snapshot();
		}

		checking = false;
		setState({
			phase: "not-available",
			availableVersion: null,
			remoteBuildId,
			percent: 0,
			error: null,
		});
		return snapshot();
	} catch (err) {
		checking = false;
		const raw = err && err.message ? err.message : String(err);
		if (silent && isTransientPublishError(raw)) {
			setState({ phase: "idle", error: null });
		} else {
			setState({ phase: "error", error: friendlyUpdateError(err) });
		}
		return snapshot();
	}
}

async function downloadUpdate() {
	if (!app.isPackaged) {
		setState({ phase: "error", error: "Updates only run in the packaged app" });
		return snapshot();
	}
	if (!pendingInstallerUrl) {
		setState({ phase: "error", error: "UPDATE_PUBLISHING" });
		return snapshot();
	}

	try {
		setState({ phase: "downloading", percent: 5, error: null });
		const res = await httpGet(pendingInstallerUrl);
		if (!res.ok) throw new Error(`HTTP ${res.status} downloading update`);

		const fileName = path.basename(new URL(pendingInstallerUrl).pathname);
		const target = path.join(app.getPath("temp"), fileName);
		setState({ phase: "downloading", percent: 85, error: null });
		fs.writeFileSync(target, res.buffer);
		pendingInstallerPath = target;
		setState({ phase: "downloaded", percent: 100, error: null });
	} catch (err) {
		setState({ phase: "error", error: friendlyUpdateError(err) });
	}
	return snapshot();
}

function installUpdate() {
	if (!app.isPackaged || state.phase !== "downloaded" || !pendingInstallerPath) {
		return { ok: false, reason: state.phase };
	}
	const installer = pendingInstallerPath;
	if (!fs.existsSync(installer)) {
		return { ok: false, reason: "missing-installer" };
	}

	setImmediate(() => {
		try {
			const child = spawn(installer, [], {
				detached: true,
				stdio: "ignore",
				shell: process.platform === "win32",
			});
			child.unref();
		} catch (error) {
			console.error("installUpdate spawn", error);
		}
		app.quit();
	});
	return { ok: true };
}

/**
 * @param {{ getMainWindow: () => import("electron").BrowserWindow | null }} options
 */
function registerAutoUpdate(options) {
	getMainWindow = options.getMainWindow;
	if (wired) return;
	wired = true;

	const local = loadLocalBuildInfo();
	state.buildId = Number(local.buildId) || 0;

	ipcMain.handle("updates:get-status", () => snapshot());
	ipcMain.handle("updates:check", async (_event, payload = {}) => {
		return checkForUpdates({ silent: Boolean(payload.silent) });
	});
	ipcMain.handle("updates:download", async () => downloadUpdate());
	ipcMain.handle("updates:install", () => installUpdate());
}

module.exports = {
	registerAutoUpdate,
	checkForUpdates,
	downloadUpdate,
	installUpdate,
	getUpdateStatus: snapshot,
	STABLE_TAG,
};
