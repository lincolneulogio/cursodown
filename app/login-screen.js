"use strict";

(function initLoginScreen() {
const native = require("./helpers/native-bridge");
const Settings = require("./helpers/settings");
const utils = require("./helpers/utils");

function businessChecked() {
	const input = document.getElementById("business");
	return Boolean(input && input.checked);
}

function readSubdomain(requireBusinessName) {
	if (!businessChecked()) {
		return "www";
	}

	const input = document.getElementById("subdomain");
	const value = String(input && input.value ? input.value : "").trim();
	if (!value) {
		if (requireBusinessName) {
			window.alert(window.translate ? window.translate("Type Business Name") : "Escribe el nombre de la empresa");
		}
		return null;
	}
	return value;
}

function toggleBusinessField() {
	const wrap = document.getElementById("divsubdomain");
	if (!wrap) return;
	wrap.style.display = businessChecked() ? "flex" : "none";
}

function setLoginStatus(isActive) {
	const status = document.getElementById("login-status");
	if (!status) return;
	status.hidden = !isActive;
	status.textContent = isActive ? (window.translate ? window.translate("Logging in") : "Iniciando sesión...") : "";
}

function finishWithCredentials(accessToken, clientId, subDomain) {
	const parsed = utils.parseUdemyCredentials(accessToken);
	Settings.accessToken = parsed.accessToken;
	Settings.clientId = parsed.clientId || clientId || null;
	Settings.subDomain = subDomain || "www";
	setLoginStatus(true);

	if (typeof window.checkLogin === "function") {
		window.checkLogin();
		return;
	}

	window.location.reload();
}

async function loginWithUdemy() {
	try {
		const subdomain = readSubdomain(true);
		if (!subdomain) return;

		Settings.subDomain = subdomain;
		setLoginStatus(true);

		const session = await native.auth.openUdemyLogin({ subdomain });
		if (!session || !session.accessToken) {
			setLoginStatus(false);
			return;
		}

		finishWithCredentials(session.accessToken, session.clientId, session.subDomain || subdomain);
	} catch (error) {
		setLoginStatus(false);
		console.error("Failed to open Udemy login", error);
		window.alert(error.message || String(error));
	}
}

function loginWithAccessToken() {
	if (!readSubdomain(true)) return;

	const panel = document.getElementById("token-panel");
	const input = document.getElementById("access-token-input");
	if (panel && panel.hasAttribute("hidden")) {
		panel.removeAttribute("hidden");
		if (input) input.focus();
		return;
	}

	submitAccessToken();
}

function submitAccessToken() {
	if (!readSubdomain(true)) return;

	const input = document.getElementById("access-token-input");
	const rawToken = String(input && input.value ? input.value : "").trim();
	if (!rawToken) {
		const panel = document.getElementById("token-panel");
		if (panel) panel.removeAttribute("hidden");
		if (input) input.focus();
		return;
	}

	const subdomain = readSubdomain(false) || "www";
	const parsed = utils.parseUdemyCredentials(rawToken);
	finishWithCredentials(parsed.accessToken, parsed.clientId, subdomain);
}

function bindLoginScreen() {
	const form = document.querySelector(".ud-login-form");
	if (form) {
		form.addEventListener("submit", (event) => event.preventDefault());
	}

	const business = document.getElementById("business");
	if (business) {
		business.addEventListener("change", toggleBusinessField);
	}

	const udemyBtn = document.getElementById("btn-login-udemy");
	if (udemyBtn) {
		udemyBtn.addEventListener("click", (event) => {
			event.preventDefault();
			loginWithUdemy();
		});
	}

	const tokenBtn = document.getElementById("btn-login-token");
	if (tokenBtn) {
		tokenBtn.addEventListener("click", (event) => {
			event.preventDefault();
			loginWithAccessToken();
		});
	}

	const submitBtn = document.getElementById("btn-login-token-submit");
	if (submitBtn) {
		submitBtn.addEventListener("click", (event) => {
			event.preventDefault();
			submitAccessToken();
		});
	}

	const tokenInput = document.getElementById("access-token-input");
	if (tokenInput) {
		tokenInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				submitAccessToken();
			}
		});
	}

	const helpLink = document.querySelector(".how-get-token");
	if (helpLink) {
		helpLink.addEventListener("click", (event) => {
			event.preventDefault();
			if (helpLink.href) {
				native.shell.openExternal(helpLink.href);
			}
		});
	}
}

window.loginWithUdemy = loginWithUdemy;
window.loginWithAccessToken = loginWithAccessToken;
window.submitAccessToken = submitAccessToken;

bindLoginScreen();
})();
