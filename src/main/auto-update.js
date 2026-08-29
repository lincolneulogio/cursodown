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
 * percent: number,
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
		const message = err && err.message ? err.message : String(err || "Update error");
		setState({ phase: "error", error: message });
	});
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
	try {
		await autoUpdater.checkForUpdates();
	} catch (err) {
		checking = false;
		const message = err && err.message ? err.message : String(err);
		setState({ phase: "error", error: message });
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
		const message = err && err.message ? err.message : String(err);
		setState({ phase: "error", error: message });
	}
	return snapshot();
}

function installUpdate() {
	if (!app.isPackaged || state.phase !== "downloaded") {
		return { ok: false, reason: state.phase };
	}
	// isSilent=false, isForceRunAfter=true
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
