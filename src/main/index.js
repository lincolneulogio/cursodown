const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog } = require("electron");
const { join } = require("path");

require("../../environments.js");

const { version: appVersion, vars } = require("../../package.json");

process.env.USER_DATA_PATH = app.getPath("userData");

const isDebug = process.argv.indexOf("--developer") !== -1;
const useViteDev = isDebug && process.env.VITE_DEV_SERVER !== "0";

if (isDebug) {
	console.log("Debug mode enabled");
	process.env.DEBUG_MODE = true;
}

if (app.isPackaged) {
	process.env.IS_PACKAGE = true;
	const sentryDsn = String(process.env.SENTRY_DSN || "").trim();
	if (sentryDsn && sentryDsn !== "<YOUR_ID>") {
		const Sentry = require("@sentry/electron");
		Sentry.init({ dsn: sentryDsn });
	}
} else {
	process.env.SENTRY_DSN = "";
}

let downloadsSaved = false;
let mainWindow = null;

function createWindow() {
	const size = screen.getPrimaryDisplay().workAreaSize;
	const win = new BrowserWindow({
		title: `CursoDown | Descargador de cursos Udemy - v${appVersion}`,
		minWidth: 760,
		minHeight: 560,
		width: 960,
		height: size.height - 150,
		icon: join(__dirname, "../../app/assets/images/build/icon.png"),
		resizable: true,
		maximizable: true,
		webPreferences: {
			// Phase 4/5: React is bundled — Node stays in preload only.
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: join(__dirname, "../preload/index.js"),
		},
	});

	mainWindow = win;

	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:/i.test(url)) shell.openExternal(url);
		return { action: "deny" };
	});

	win.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith("file:") && !url.startsWith("http://localhost:5173")) {
			event.preventDefault();
			if (/^https?:/i.test(url)) shell.openExternal(url);
		}
	});

	win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		if (level >= 2) {
			console.error("[renderer]", message, `${sourceId}:${line}`);
		}
	});

	if (useViteDev) {
		win.loadURL("http://localhost:5173");
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(join(__dirname, "../../dist/renderer/index.html"));
	}

	win.on("close", (event) => {
		if (!downloadsSaved) {
			downloadsSaved = true;
			if (event != null) event.preventDefault();
			win.webContents.send("saveDownloads");
			setTimeout(() => {
				if (!win.isDestroyed()) win.destroy();
			}, 400);
		}
	});

	win.on("closed", () => {
		if (mainWindow === win) mainWindow = null;
	});

	if (!isDebug) {
		const template = [
			{
				label: app.name,
				submenu: [{ role: "quit", label: "Salir" }],
			},
			{
				label: "Ver",
				submenu: [
					{ role: "forcereload", label: "Recargar" },
					{ type: "separator" },
					{ role: "resetZoom", label: "Zoom original" },
					{ role: "zoomin", label: "Acercar" },
					{ role: "zoomout", label: "Alejar" },
					{ type: "separator" },
					{ role: "togglefullscreen", label: "Pantalla completa" },
				],
			},
			{
				label: "Donar",
				click: () => shell.openExternal(urlDonateWithMsg(vars.urlDonate)),
			},
		];
		Menu.setApplicationMenu(Menu.buildFromTemplate(template));
	}
}

app.whenReady().then(() => {
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

ipcMain.on("quitApp", () => app.quit());

const { mainHttpRequest } = require("./http");

ipcMain.handle("udemy-http", async (_event, payload = {}) => {
	const url = String(payload.url || "");
	let hostname = "";
	try {
		hostname = new URL(url).hostname;
	} catch (_error) {
		throw new Error("Invalid URL");
	}
	if (!hostname.endsWith("udemy.com") && !hostname.endsWith("udemycdn.com") && !hostname.endsWith("udemy.cn")) {
		throw new Error("URL host not allowed");
	}
	return mainHttpRequest({
		url,
		method: payload.method || "GET",
		headers: payload.headers || {},
		timeout: payload.timeout || 40000,
		body: payload.body,
	});
});

ipcMain.handle("shell-open-external", async (_event, url) => {
	const target = String(url || "");
	if (!/^https?:/i.test(target) && !/^mailto:/i.test(target)) {
		return { ok: false, error: "URL not allowed" };
	}
	await shell.openExternal(target);
	return { ok: true };
});

ipcMain.handle("shell-open-path", async (_event, target) => {
	const pathToOpen = String(target || "");
	if (!pathToOpen) return { ok: false, error: "Empty path" };
	const errorMessage = await shell.openPath(pathToOpen);
	return { ok: !errorMessage, error: errorMessage || null };
});

ipcMain.handle("open-udemy-login", async (event, payload = {}) => {
	const parent = BrowserWindow.fromWebContents(event.sender);
	if (!parent) return null;

	const subdomain = String(payload.subdomain || "www").trim() || "www";
	const loginUrl =
		subdomain === "www" ? "https://www.udemy.com/join/login-popup" : `https://${subdomain}.udemy.com`;

	return new Promise((resolve) => {
		let settled = false;
		const size = parent.getSize();
		const loginWin = new BrowserWindow({
			width: Math.max(720, size[0] - 100),
			height: Math.max(560, size[1] - 100),
			parent,
			modal: true,
			autoHideMenuBar: true,
			webPreferences: {
				partition: "temp:udemy-login",
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		});

		loginWin.setMenuBarVisibility(false);
		loginWin.webContents.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
		);

		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearInterval(pollId);
			if (!loginWin.isDestroyed()) loginWin.destroy();
			resolve(result);
		};

		const captureFromCookies = async () => {
			if (settled || loginWin.isDestroyed()) return;
			try {
				const cookies = await loginWin.webContents.session.cookies.get({});
				const accessCookie = cookies.find(
					(item) =>
						item.name === "access_token" &&
						item.value &&
						item.value.length >= 20 &&
						String(item.domain || "").includes("udemy.com")
				);
				if (!accessCookie) return;
				const clientCookie = cookies.find((item) => item.name === "client_id");
				finish({
					accessToken: accessCookie.value,
					clientId: clientCookie ? clientCookie.value : null,
					subDomain: subdomain,
				});
			} catch (_error) {}
		};

		const tryCaptureHeaders = (details) => {
			if (settled) return;
			const requestUrl = details.url || "";
			if (/\/join\/|login-popup|oauth2|csrf/i.test(requestUrl)) return;
			const headers = details.requestHeaders || {};
			const cookieHeader = headers.Cookie || headers.cookie || "";
			const accessMatch = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
			const clientMatch = cookieHeader.match(/(?:^|;\s*)client_id=([^;]+)/i);
			const authHeader = headers.Authorization || headers.authorization || "";
			const bearer = /^bearer\s+/i.test(authHeader) ? authHeader.replace(/^bearer\s+/i, "").trim() : "";
			const accessToken =
				(accessMatch && decodeURIComponent(accessMatch[1])) || (/\/api-2\.0\//.test(requestUrl) ? bearer : "");
			if (accessToken && accessToken.length >= 20) {
				finish({
					accessToken,
					clientId: clientMatch ? decodeURIComponent(clientMatch[1]) : null,
					subDomain: (() => {
						try {
							return new URL(requestUrl).hostname.split(".")[0] || subdomain;
						} catch (_error) {
							return subdomain;
						}
					})(),
				});
			}
		};

		loginWin.webContents.session.webRequest.onBeforeSendHeaders({ urls: ["*://*.udemy.com/*"] }, (details, callback) => {
			callback({ requestHeaders: details.requestHeaders });
			tryCaptureHeaders(details);
		});

		const pollId = setInterval(captureFromCookies, 800);
		loginWin.webContents.setWindowOpenHandler(({ url }) => {
			loginWin.loadURL(url);
			return { action: "deny" };
		});
		loginWin.webContents.on("did-finish-load", captureFromCookies);
		loginWin.webContents.on("did-navigate", captureFromCookies);
		loginWin.on("closed", () => finish(null));
		loginWin.loadURL(loginUrl);
	});
});

ipcMain.handle("select-directory", async (event) => {
	const parent = BrowserWindow.fromWebContents(event.sender);
	const result = await dialog.showOpenDialog(parent || undefined, { properties: ["openDirectory"] });
	if (result.canceled || !result.filePaths?.[0]) return null;
	return result.filePaths[0];
});

ipcMain.handle("show-save-dialog", async (event, options = {}) => {
	const parent = BrowserWindow.fromWebContents(event.sender);
	return dialog.showSaveDialog(parent || undefined, options);
});

ipcMain.on("show-error-box", (_event, payload = {}) => {
	dialog.showErrorBox(payload.title || "Error", payload.message || "");
});

function urlDonateWithMsg(baseUrl) {
	return `${baseUrl}&item_name=${"CursoDown is free and without any ads. If you appreciate that, please consider donating to the Developer.".replace(
		" ",
		"+"
	)}`;
}
