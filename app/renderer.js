"use strict";

(function initRenderer() {
	const Sentry = require("@sentry/electron");
	const Gettings = require("./helpers/settings.js");
	const Theme = require("./helpers/theme.js");
	const { version: appVersion, vars: pkgVars } = require("../package.json");

	const bridgeEnv = typeof window !== "undefined" && window.udeler ? window.udeler.env : null;
	const debugMode = bridgeEnv ? bridgeEnv.debugMode : Boolean(process.env.DEBUG_MODE);
	const sentryDsn = bridgeEnv ? bridgeEnv.sentryDsn : process.env.SENTRY_DSN || "";

	let featToggle = {};

	if (!debugMode) {
		fetch(pkgVars.urlToggles)
			.then((resp) => resp.json())
			.then((json) => {
				featToggle = json;
				Sentry.init({ dsn: featToggle.enableSentry ? sentryDsn : "" });
				console.log(featToggle.enableSentry ? "Sentry is enabled" : "Sentry is disabled");
			})
			.catch((error) => {
				console.warn("Feature toggles unavailable", error.message);
			});
	}

	const localeMeta = require("./locale/meta.json");
	let localeJson;

	function translate(text) {
		try {
			if (!localeJson) {
				const language = Gettings.language || "Español";
				const file = language === "English" ? "es.json" : localeMeta[language] || "es.json";
				localeJson = require(`./locale/${file}`);
			}

			return localeJson[text] || require("./locale/es.json")[text] || text;
		} catch (e) {
			console.error(e);
			return text;
		}
	}

	function translateWrite(text) {
		document.write(translate(text));
	}

	function urlDonate() {
		return `${pkgVars.urlDonate}&item_name=${translate(
			"Udeler is free and without any ads. If you appreciate that, please consider donating to the Developer."
		).replace(" ", "+")}`;
	}

	Theme.apply(Gettings.theme);

	window.translate = translate;
	window.translateWrite = translateWrite;
	window.urlDonate = urlDonate;
	window.pkgVars = pkgVars;
	window.appVersion = appVersion;
	window.Gettings = Gettings;
})();
