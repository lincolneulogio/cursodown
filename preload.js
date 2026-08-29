"use strict";

/**
 * Preload bridge.
 *
 * Phase 1 note:
 * Electron 22 + unbundled CommonJS scripts need nodeIntegration.
 * With contextIsolation:true, page scripts lose `require` (breaks jquery/app.js).
 * So Phase 1 keeps contextIsolation:false, removes @electron/remote, and routes
 * privileged ops through window.udeler → IPC. Full isolation lands in Phase 2
 * after the download engine moves to main / renderer is bundled.
 *
 * See docs/MIGRATION_PHASE1.md
 */

const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");

function assertPath(filePath) {
	if (typeof filePath !== "string" || !filePath.trim()) {
		throw new Error("Invalid path");
	}
	return filePath;
}

const fsApi = {
	existsSync: (filePath) => fs.existsSync(assertPath(filePath)),
	mkdirSync: (filePath, options) => fs.mkdirSync(assertPath(filePath), options),
	unlinkSync: (filePath) => fs.unlinkSync(assertPath(filePath)),
	renameSync: (from, to) => fs.renameSync(assertPath(from), assertPath(to)),
	statSync: (filePath) => {
		const st = fs.statSync(assertPath(filePath));
		return {
			size: st.size,
			mtimeMs: st.mtimeMs,
			isDirectory: st.isDirectory(),
			isFile: st.isFile(),
		};
	},
	access: (filePath, mode) =>
		new Promise((resolve) => {
			const flag = mode == null ? fs.constants.F_OK : mode;
			fs.access(assertPath(filePath), flag, (err) => resolve({ ok: !err, error: err ? err.message : null }));
		}),
	constants: {
		R_OK: fs.constants.R_OK,
		W_OK: fs.constants.W_OK,
		F_OK: fs.constants.F_OK,
	},
	writeFile: (filePath, data, encoding) =>
		new Promise((resolve, reject) => {
			fs.writeFile(assertPath(filePath), data, encoding || "utf8", (err) => (err ? reject(err) : resolve()));
		}),
	writeFileSync: (filePath, data, encoding) => {
		fs.writeFileSync(assertPath(filePath), data, encoding || "utf8");
	},
	appendFileSync: (filePath, data) => {
		fs.appendFileSync(assertPath(filePath), data);
	},
	readFileSync: (filePath, encoding) => fs.readFileSync(assertPath(filePath), encoding || "utf8"),
	readdirSync: (dirPath) => {
		return fs.readdirSync(assertPath(dirPath), { withFileTypes: true }).map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
			isFile: entry.isFile(),
		}));
	},
	rmSync: (filePath, options) => fs.rmSync(assertPath(filePath), options || { recursive: true, force: true }),
	unlink: (filePath) =>
		new Promise((resolve) => {
			fs.unlink(assertPath(filePath), (err) => resolve({ ok: !err, error: err ? err.message : null }));
		}),
	downloadUrlToFile: (url, filePath) =>
		new Promise((resolve, reject) => {
			const client = String(url).startsWith("http://") ? http : https;
			const dest = assertPath(filePath);
			const file = fs.createWriteStream(dest);
			client
				.get(url, (response) => {
					response.pipe(file);
					file.on("finish", () => {
						file.close(() => resolve(dest));
					});
				})
				.on("error", (err) => {
					try {
						fs.unlinkSync(dest);
					} catch (_e) {}
					reject(err);
				});
		}),
};

const pathApi = {
	join: (...parts) => path.join(...parts),
	resolve: (...parts) => path.resolve(...parts),
	relative: (from, to) => path.relative(from, to),
	basename: (filePath, ext) => path.basename(filePath, ext),
	dirname: (filePath) => path.dirname(filePath),
	extname: (filePath) => path.extname(filePath),
	isAbsolute: (filePath) => path.isAbsolute(filePath),
	sep: path.sep,
};

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
		prettifySettings: Boolean(process.env.PRETTIFY_SETTINGS),
		userDataPath: process.env.USER_DATA_PATH || "",
	},
	path: pathApi,
	os: {
		homedir: () => os.homedir(),
		platform: () => process.platform,
	},
	fs: fsApi,
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
		openUdemyLogin: (payload) => ipcRenderer.invoke("open-udemy-login", payload || {}),
	},
	app: {
		quit: () => ipcRenderer.send("quitApp"),
	},
	onSaveDownloads: (callback) => {
		const listener = () => {
			try {
				callback();
			} catch (error) {
				console.error("onSaveDownloads callback failed", error);
			}
		};
		ipcRenderer.on("saveDownloads", listener);
		return () => ipcRenderer.removeListener("saveDownloads", listener);
	},
};

// contextIsolation is false in Phase 1 — assign directly.
window.udeler = udelerApi;

// Also expose for any early access patterns.
try {
	global.udeler = udelerApi;
} catch (_error) {}
