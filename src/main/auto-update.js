"use strict";

/**
 * Auto-update via electron-updater + GitHub Releases (package.json → build.publish).
 * Only runs when the app is packaged. Dev/unpackaged builds are no-ops.
 */

const { autoUpdater } = require("electron-updater");
const { ipcMain, app } = require("electron");

/** @typedef {"idle"|"checking"|"available"|"not-available"|"downloading"|"downloaded"|"error"} UpdatePhase */

/** @type {{
 *   phase: UpdatePhase,
 *   currentVersion: string,
 *   availableVersion: string | null,
 *   releaseNotes: string | null,
 *   percent: number,
 *   error: string | null,
 *   packaged: boolean
 * }} */
let state = {
	phase: "idle",
	currentVersion: app.getVersion(),
	availableVersion: null,
	releaseNotes: null,
	percent: 0,
	error: null,
	packaged: app.isPackaged,
};

/** @type {(() => import("electron").BrowserWindow | null) | null} */
let getMainWindow = null;
let wired = false;
let checking = false;
let lastCheckSilent = false;

function snapshot() {
	return { ...state, currentVersion: app.getVersion(), packaged: app.isPackaged };
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
	return /latest\.ya?ml|404|Cannot find latest|HttpError:\s*404|not yet uploaded|ENOTFOUND/i.test(
		String(message || "")
	);
}

/**
 * Keep user-facing errors short (no stack / headers dump).
 * Codes UPDATE_* are translated in the renderer.
 * @param {unknown} err
 */
function friendlyUpdateError(err) {
	const raw =
		err && typeof err === "object" && "message" in err ? String(err.message) : String(err || "Update error");
	if (/latest\.ya?ml|Cannot find latest|HttpError:\s*404/i.test(raw)) {
		return "UPDATE_PUBLISHING";
	}
	if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::|network/i.test(raw)) {
		return "UPDATE_NETWORK";
	}
	const firstLine = raw.split(/\r?\n/)[0].trim();
	return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
}

function setupAutoUpdater() {
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.allowDowngrade = false;
	autoUpdater.allowPrerelease = false;

	autoUpdater.on("checking-for-update", () => {
		setState({ phase: "checking", error: null });
	});

	autoUpdater.on("update-available", (info) => {
		checking = false;
		setState({
			phase: "available",
			availableVersion: info?.version || null,
			releaseNotes: typeof info?.releaseNotes === "string" ? info.releaseNotes : null,
			error: null,
		});
	});

	autoUpdater.on("update-not-available", () => {
		checking = false;
		setState({
			phase: "not-available",
			availableVersion: null,
			percent: 0,
			error: null,
		});
	});

	autoUpdater.on("download-progress", (progress) => {
		const percent = Number(progress?.percent) || 0;
		setState({
			phase: "downloading",
			percent: Math.max(0, Math.min(100, percent)),
			error: null,
		});
	});

	autoUpdater.on("update-downloaded", (info) => {
		setState({
			phase: "downloaded",
			availableVersion: info?.version || state.availableVersion,
			percent: 100,
			error: null,
		});
	});

	autoUpdater.on("error", (err) => {
		checking = false;
		const code = friendlyUpdateError(err);
		const raw = err && err.message ? err.message : String(err || "");
		// Silent startup check during incomplete Publish: don't scare the user.
		if (lastCheckSilent && isTransientPublishError(raw)) {
			setState({ phase: "idle", error: null });
			return;
		}
		setState({ phase: "error", error: code });
	});
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
	try {
		await autoUpdater.checkForUpdates();
	} catch (err) {
		checking = false;
		const raw = err && err.message ? err.message : String(err);
		if (silent && isTransientPublishError(raw)) {
			setState({ phase: "idle", error: null });
		} else {
			setState({ phase: "error", error: friendlyUpdateError(err) });
		}
	}
	return snapshot();
}

async function downloadUpdate() {
	if (!app.isPackaged) {
		setState({ phase: "error", error: "Updates only run in the packaged app" });
		return snapshot();
	}
	if (state.phase !== "available" && state.phase !== "error") {
		return snapshot();
	}
	try {
		setState({ phase: "downloading", percent: 0, error: null });
		await autoUpdater.downloadUpdate();
	} catch (err) {
		setState({ phase: "error", error: friendlyUpdateError(err) });
	}
	return snapshot();
}

function installUpdate() {
	if (!app.isPackaged || state.phase !== "downloaded") {
		return { ok: false, reason: state.phase };
	}
	setImmediate(() => {
		autoUpdater.quitAndInstall(false, true);
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

	if (app.isPackaged) {
		setupAutoUpdater();
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
};
