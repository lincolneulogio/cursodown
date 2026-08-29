"use strict";

/**
 * Renderer-facing access to the preload bridge.
 * Prefer this module over require("electron") / require("fs") in UI code.
 */

function getApi() {
	if (typeof window !== "undefined" && window.udeler) {
		return window.udeler;
	}
	throw new Error("window.udeler is not available. Check preload.js and contextIsolation.");
}

const nativeBridge = {
	get api() {
		return getApi();
	},
	get fs() {
		return getApi().fs;
	},
	get path() {
		return getApi().path;
	},
	get os() {
		return getApi().os;
	},
	get shell() {
		return getApi().shell;
	},
	get dialog() {
		return getApi().dialog;
	},
	get auth() {
		return getApi().auth;
	},
	get app() {
		return getApi().app;
	},
	get env() {
		return getApi().env;
	},
	onSaveDownloads(callback) {
		return getApi().onSaveDownloads(callback);
	},
};

module.exports = nativeBridge;
