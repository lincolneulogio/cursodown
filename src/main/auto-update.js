"use strict";

/**
 * Auto-update for a single stable release (v1.0.0).
 * Semver stays 1.0.0; newer installs are detected via buildId in build-info.json.
 */

const { autoUpdater } = require("electron-updater");
const { ipcMain, app, net } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const STABLE_TAG = "v1.0.0";
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
let lastCheckSilent = false;
/** @type {string | null} */
let pendingInstallerPath = null;
/** @type {string | null} */
let pendingInstallerUrl = null;

function loadLocalBuildInfo() {
	try {
		return require("../../app/build-info.json");
	} catch (_error) {
		return { stableVersion: "1.0.0", buildId: 0, releasedAt: null, gitSha: null };
	}
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

async function fetchText(url) {
	const res = await net.fetch(url, { redirect: "follow" });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for ${url}`);
	}
	return res.text();
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

function releaseAssetUrl(fileName) {
	return `https://github.com/${REPO}/releases/download/${STABLE_TAG}/${encodeURIComponent(fileName)}`;
}

async function fetchRemoteBuildInfo() {
	try {
		return await fetchJson(releaseAssetUrl("build-info.json"));
	} catch (_error) {
		// Fallback: latest release asset (when tag was force-moved but CDN lags)
		const api = `https://api.github.com/repos/${REPO}/releases/tags/${STABLE_TAG}`;
		const release = await fetchJson(api);
		const asset = (release.assets || []).find((a) => a.name === "build-info.json");
		if (!asset?.browser_download_url) throw new Error("build-info.json missing on stable release");
		return fetchJson(asset.browser_download_url);
	}
}

function setupAutoUpdaterFallback() {
	// Keep electron-updater configured for feeds that use rising semver if ever requested.
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.allowDowngrade = false;
	autoUpdater.allowPrerelease = false;
}

async function checkForUpdates({ silent = false } = {}) {
	lastCheckSilent = Boolean(silent);
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
		const remote = await fetchRemoteBuildInfo();
		const remoteBuildId = Number(remote.buildId) || 0;

		if (remoteBuildId > localBuildId) {
			checking = false;
			pendingInstallerUrl = null;
			try {
				const yml = await fetchText(releaseAssetUrl("latest.yml"));
				const parsed = parseLatestYml(yml);
				if (parsed.filePath) {
					pendingInstallerUrl = releaseAssetUrl(parsed.filePath);
				}
			} catch (_ymlError) {
				// Windows Setup name is stable for v1.0.0
				pendingInstallerUrl = releaseAssetUrl("CursoDown_Setup-v1.0.0_win-x64.exe");
			}

			setState({
				phase: "available",
				availableVersion: String(remote.stableVersion || app.getVersion()),
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
		const res = await net.fetch(pendingInstallerUrl, { redirect: "follow" });
		if (!res.ok) throw new Error(`HTTP ${res.status} downloading update`);

		const fileName = path.basename(new URL(pendingInstallerUrl).pathname);
		const target = path.join(app.getPath("temp"), fileName);
		setState({ phase: "downloading", percent: 20, error: null });
		const buffer = Buffer.from(await res.arrayBuffer());
		setState({ phase: "downloading", percent: 85, error: null });
		fs.writeFileSync(target, buffer);
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

	if (app.isPackaged) {
		setupAutoUpdaterFallback();
	}

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
