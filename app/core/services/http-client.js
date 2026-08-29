"use strict";

/**
 * HTTP client for Udemy API.
 * - In Electron preload/renderer: routes through main (`udemy-http`) using Chromium net.
 * - In plain Node (tests): uses axios http adapter.
 */

const isElectronRenderer =
	typeof process !== "undefined" && process.type === "renderer";

let client;

if (isElectronRenderer) {
	const { ipcRenderer } = require("electron");

	client = function nodeHttp(config) {
		const options = typeof config === "string" ? { url: config } : config || {};
		return ipcRenderer.invoke("udemy-http", {
			url: options.url,
			method: options.method || "GET",
			headers: options.headers || {},
			timeout: options.timeout || 40000,
			body: options.data,
		});
	};
} else {
	const axios = require("axios");
	const http = require("http");
	const https = require("https");

	const axiosClient = axios.create({
		adapter: "http",
		httpAgent: new http.Agent({ keepAlive: true }),
		httpsAgent: new https.Agent({ keepAlive: true }),
		maxRedirects: 5,
		validateStatus: (status) => status >= 200 && status < 300,
	});

	client = function nodeHttp(config) {
		return axiosClient(config);
	};
}

module.exports = client;
