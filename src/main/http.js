"use strict";

/**
 * HTTP from Electron main via Chromium net stack.
 * Allows Cookie / User-Agent headers and avoids preload XHR restrictions.
 */

const { net } = require("electron");

/**
 * @param {{ url: string, method?: string, headers?: Record<string, string>, timeout?: number, body?: string }} options
 * @returns {Promise<{ data: any, status: number, headers: Record<string, string[]> }>}
 */
function mainHttpRequest(options) {
	const { url, method = "GET", headers = {}, timeout = 40000, body } = options || {};
	if (!url) {
		return Promise.reject(new Error("url is required"));
	}

	return new Promise((resolve, reject) => {
		let settled = false;
		const request = net.request({ method: method.toUpperCase(), url });

		Object.entries(headers || {}).forEach(([key, value]) => {
			if (value == null || value === "") return;
			try {
				request.setHeader(key, String(value));
			} catch (error) {
				console.warn("mainHttpRequest setHeader failed", key, error.message);
			}
		});

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				request.abort();
			} catch (_error) {}
			reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
		}, timeout);

		let raw = "";
		request.on("response", (response) => {
			response.on("data", (chunk) => {
				raw += chunk.toString("utf8");
			});
			response.on("end", () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);

				let data = raw;
				const contentType = String(response.headers["content-type"] || "");
				if (contentType.includes("application/json") || (raw && (raw[0] === "{" || raw[0] === "["))) {
					try {
						data = JSON.parse(raw);
					} catch (_error) {}
				}

				const status = response.statusCode || 0;
				if (status >= 200 && status < 300) {
					resolve({ data, status, headers: response.headers });
					return;
				}

				console.error("[udemy-http]", method, url, status, typeof data === "string" ? data.slice(0, 300) : data);
				const error = new Error(`Request failed with status code ${status}`);
				error.response = { status, data, headers: response.headers };
				error.config = { url, method };
				reject(error);
			});
			response.on("error", (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(error);
			});
		});

		request.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});

		if (body != null) {
			request.write(typeof body === "string" ? body : JSON.stringify(body));
		}
		request.end();
	});
}

module.exports = { mainHttpRequest };
