"use strict";

const $ = require("jquery");
const axios = require("axios");
const fs = require("fs");

const dialogs = require("dialogs")({});
const sanitize = require("sanitize-filename");

const native = require("./helpers/native-bridge");
const { Settings, ui, utils, Theme, CoursePlanner } = require("./helpers");
const { bindAndStartDownload } = require("./helpers/download-ui");
const { default: UdemyService, DownloadQueue, LibraryService, DownloadService } = require("./core/services");

const shell = native.shell;
const dialog = native.dialog;

const PAGE_SIZE = 25;
const MSG_DRM_PROTECTED = translate("Contains DRM protection and cannot be downloaded");
const HTTP_TIMEOUT = 40000; // 40 segundos
const downloadQueue = new DownloadQueue(2);
const downloadService = new DownloadService({
	settings: Settings,
	utils,
	translate,
	httpTimeout: HTTP_TIMEOUT,
	captureException: (error) => {
		if (typeof Sentry !== "undefined" && Sentry) Sentry.captureException(error);
	},
});
/** @type {Map<string, { abort: Function, pause: Function, resume: Function }>} */
const activeDownloads = new Map();

let repoAccount = "heliomarpm";
let udemyService;

native.onSaveDownloads(() => saveDownloads(true));

$(document).ajaxError(function (_event, _request) {
	$(".dimmer").removeClass("active");
});

try {
	$(".ui.dropdown").dropdown();
} catch (error) {
	console.error("Failed to initialize dropdowns", error);
}

$(document).on("change", "#business", function () {
	if ($(this).is(":checked")) {
		ui.$subdomainField.val(Settings.subDomain);
		ui.toggleSubdomainField(true);
	} else {
		ui.$subdomainField.val(null);
		ui.toggleSubdomainField(false);
	}
});

$(document).on("click", ".courses-sidebar", function () {
	ui.navSidebar(this, "courses");
	showCoursesPane("catalog");
});

$(document).on("click", "[data-courses-tab]", function () {
	showCoursesPane($(this).attr("data-courses-tab"));
});

$(document).on("click", ".library-sidebar", function () {
	ui.navSidebar(this, "library");
	renderLibrary();
});

$(document).on("click", ".settings-sidebar", function () {
	ui.navSidebar(this, "settings");
	loadSettings();
});

$(document).on("click", ".logout-sidebar", function () {
	dialogs.confirm(translate("Confirm Log Out?"), function (ok) {
		if (ok) {
			ui.busyLogout(true);
			saveDownloads(false);
			Settings.accessToken = null;
			applySessionUser(null);
			ui.resetToLogin();
		}
	});
});

$(".ui.dashboard .content").on("click", ".load-more.button", (e) => loadMore(e.currentTarget));

$(".ui.dashboard .content").on("click", ".dismiss-download", function () {
	const courseId = $(this).parents(".course.item").attr("course-id");
	removeCurseDownloads(courseId);
});

$(".ui.dashboard .content").on("click", ".open-in-browser", function () {
	const link = `https://${Settings.subDomain}.udemy.com${$(this).parents(".course.item").attr("course-url")}`;
	shell.openExternal(link);
});

$(".ui.dashboard .content").on("click", ".open-dir", function () {
	const pathDownloaded = $(this).parents(".course.item").find('input[name="path-downloaded"]').val();
	shell.openPath(pathDownloaded);
});

$(".ui.dashboard .content").on("click", ".check-updates", () => checkUpdate("heliomarpm"));

$(".ui.dashboard .content").on("click", ".check-updates-original", () => checkUpdate("FaisalUmair"));

$(".ui.dashboard .content").on("click", ".old-version-mac", () => {
	shell.openExternal("https://github.com/FaisalUmair/udemy-downloader-gui/releases/download/v1.8.2/Udeler-1.8.2-mac.dmg");
});

$(".ui.dashboard .content").on("click", ".old-version-linux", () => {
	shell.openExternal("https://github.com/FaisalUmair/udemy-downloader-gui/releases/download/v1.8.2/Udeler-1.8.2-linux-x86_x64.AppImage");
});

$(".ui.dashboard .content").on("click", ".download-success, .course-encrypted", function () {
	$(this).hide();
	$(this).parents(".course").find(".download-status").show();
});

$(".ui.dashboard .content").on("click", ".save_m3u.button", function (e) {
	e.stopImmediatePropagation();
	saveM3u($(this).parents(".course"));
});
$(".ui.dashboard .content").on("click", ".download.button, .download-error", function (e) {
	e.stopImmediatePropagation();
	prepareDownloading($(this).parents(".course"));
});

$(".ui.dashboard .content").on("click", ".cancel-download.button", function (e) {
	e.stopImmediatePropagation();
	if ($(this).is("[hidden]")) return;

	const $course = $(this).parents(".course");
	const courseId = $course.attr("course-id");
	const name = $course.find(".coursename").text();

	dialogs.confirm(`${translate("Cancel this download?")}\n\n${name}\n\n${translate("The download will stop. Files already saved stay on disk.")}`, function (ok) {
		if (ok) cancelActiveDownload(courseId);
	});
});

$(".ui.dashboard .content .courses.section .search.form").on("submit", function (e) {
	e.preventDefault();
	const keyword = $(e.target).find("input").val();
	search(keyword);
});

$(".download-update.button").on("click", () => {
	shell.openExternal(`https://github.com/${repoAccount}/udemy-downloader-gui/releases/latest`);
});

$(".content .ui.about").on("click", 'a[href^="http"]', function (e) {
	e.preventDefault();
	shell.openExternal(this.href);
});

$(".ui.settings .form").on("submit", (e) => {
	e.preventDefault();
	saveSettings(e.target);
});

const $settingsForm = $(".ui.settings .form");

$settingsForm.find('input[name="enabledownloadstartend"]').on("change", function () {
	$settingsForm.find('input[name="downloadstart"], input[name="downloadend"]').prop("readonly", !this.checked);
});

function loadSettings() {
	$settingsForm.find('input[name="check-new-version"]').prop("checked", Boolean(Settings.download.checkNewVersion));
	$settingsForm.find('input[name="dark-theme"]').prop("checked", Settings.theme === "dark");
	$settingsForm.find('input[name="auto-start-download"]').prop("checked", Boolean(Settings.download.autoStartDownload));
	$settingsForm
		.find('input[name="continue-downloading-encrypted"]')
		.prop("checked", Boolean(Settings.download.continueDonwloadingEncrypted));

	$settingsForm.find('input[name="enabledownloadstartend"]').prop("checked", Boolean(Settings.download.enableDownloadStartEnd));
	$settingsForm
		.find('input[name="downloadstart"], input[name="downloadend"]')
		.prop("readonly", !Boolean(Settings.download.enableDownloadStartEnd));

	$settingsForm.find('input:radio[name="downloadType"]').filter(`[value="${Settings.download.type}"]`).prop("checked", true);
	$settingsForm.find('input[name="skipsubtitles"]').prop("checked", Boolean(Settings.download.skipSubtitles));
	$settingsForm.find('input[name="autoretry"]').prop("checked", Boolean(Settings.download.autoRetry));
	$settingsForm.find('input[name="seq-zero-left"]').prop("checked", Boolean(Settings.download.seqZeroLeft));
	$settingsForm.find('input[name="skip-existing-files"]').prop("checked", Settings.download.skipExistingFiles !== false);
	$settingsForm.find('input[name="max-concurrent-downloads"]').val(Settings.download.maxConcurrentDownloads || 2);

	$settingsForm.find('input[name="downloadpath"]').val(Settings.downloadDirectory());
	$settingsForm.find('input[name="downloadstart"]').val(Settings.download.downloadStart);
	$settingsForm.find('input[name="downloadend"]').val(Settings.download.downloadEnd);

	const videoQuality = Settings.download.videoQuality;
	$settingsForm.find('input[name="videoquality"]').val(videoQuality);
	$settingsForm
		.find('input[name="videoquality"]')
		.parent(".dropdown")
		.find(".default.text")
		.html(translate(videoQuality || "Auto"));

	const language = Settings.language;
	$settingsForm.find('input[name="language"]').val(language || "");
	$settingsForm
		.find('input[name="language"]')
		.parent(".dropdown")
		.find(".default.text")
		.html(language || "Español");

	const defaultSubtitle = Settings.download.defaultSubtitle;
	$settingsForm.find('input[name="defaultSubtitle"]').val(defaultSubtitle || "");
	$settingsForm
		.find('input[name="defaultSubtitle"]')
		.parent(".dropdown")
		.find(".defaultSubtitle.text")
		.html(defaultSubtitle || "");
}

function saveSettings(formElement) {
	const findInput = (inputName, attr = "") => $(formElement).find(`input[name="${inputName}"]${attr}`);

	const def = Settings.DownloadDefaultOptions;

	const checkNewVersion = findInput("check-new-version")[0].checked ?? def.checkNewVersion;
	const defaultSubtitle = findInput("defaultSubtitle").val() ?? def.defaultSubtitle;
	const downloadPath = findInput("downloadpath").val() ?? def.path;
	const autoStartDownload = findInput("auto-start-download")[0].checked ?? def.autoStartDownload;
	const continueDonwloadingEncrypted = findInput("continue-downloading-encrypted")[0].checked ?? def.continueDonwloadingEncrypted;
	const enableDownloadStartEnd = findInput("enabledownloadstartend")[0].checked ?? def.enableDownloadStartEnd;
	const downloadStart = parseInt(findInput("downloadstart").val() ?? def.downloadStart);
	const downloadEnd = parseInt(findInput("downloadend").val() ?? def.downloadEnd);
	const videoQuality = findInput("videoquality").val() ?? def.videoQuality;
	const downloadType = findInput("downloadType", ":checked").val() ?? def.type;
	const skipSubtitles = findInput("skipsubtitles")[0].checked ?? def.skipSubtitles;
	const seqZeroLeft = findInput("seq-zero-left")[0].checked ?? def.seqZeroLeft;
	const autoRetry = findInput("autoretry")[0].checked ?? def.autoRetry;
	const language = findInput("language").val() ?? undefined;
	const skipExistingFiles = findInput("skip-existing-files")[0].checked ?? def.skipExistingFiles;
	const maxConcurrentDownloads = Math.min(3, Math.max(1, parseInt(findInput("max-concurrent-downloads").val() ?? def.maxConcurrentDownloads, 10) || 2));
	const darkTheme = findInput("dark-theme")[0].checked;

	Settings.download = {
		checkNewVersion,
		defaultSubtitle,
		path: downloadPath,
		autoStartDownload,
		continueDonwloadingEncrypted,
		enableDownloadStartEnd,
		downloadStart,
		downloadEnd,
		videoQuality,
		type: Number(downloadType),
		skipSubtitles,
		seqZeroLeft,
		autoRetry,
		skipExistingFiles,
		maxConcurrentDownloads,
	};

	Settings.language = language;
	Settings.theme = darkTheme ? "dark" : "light";
	Theme.apply(Settings.theme);
	downloadQueue.setConcurrency(maxConcurrentDownloads);
	updateQueueStatus();

	showAlert(translate("Settings Saved"));
}

async function selectDownloadPath() {
	try {
		const selected = await dialog.selectDirectory();
		if (!selected) return;

		fs.access(selected, fs.constants.R_OK | fs.constants.W_OK, function (err) {
			if (err) {
				showAlert(translate("Cannot select this folder"));
			} else {
				$settingsForm.find('input[name="downloadpath"]').val(selected);
			}
		});
	} catch (error) {
		showAlert(error.message || String(error), translate("Download Path"));
	}
}

async function checkUpdate(account, silent = false) {
	ui.busyCheckUpdate(true);

	try {
		const response = await fetch(`https://api.github.com/repos/${account}/udemy-downloader-gui/releases/latest`);

		if (!response.ok) {
			throw new Error(`Failed to check for updates: ${response.status}`);
		}

		const data = await response.json();
		if (data.tag_name != `v${appVersion}`) {
			repoAccount = account;
			$(".ui.update-available.modal").modal("show");
		} else if (!silent) {
			showAlert(translate("No updates available"));
		}
	} catch (error) {
		console.error("Failed to check for updates", error);
		if (!silent) {
			showAlert(translate("Failed to check for updates"), translate("Check for updates"));
		}
		appendLog("Failed to check for updates", error);
	} finally {
		ui.busyCheckUpdate(false);
	}
}

function isUdemyLoggedIn(userContext) {
	const header = userContext && userContext.header;
	const user = header && header.user;
	return Boolean((header && header.isLoggedIn) || (user && (user.id || user.email)));
}

async function checkLogin(alertExpired = true) {
	if (Settings.accessToken) {
		try {
			ui.busyLogin(true);

			const parsed = utils.parseUdemyCredentials(Settings.accessToken);
			if (parsed.accessToken !== Settings.accessToken || parsed.clientId) {
				Settings.accessToken = parsed.accessToken;
				if (parsed.clientId) Settings.clientId = parsed.clientId;
			}

			udemyService = new UdemyService(Settings.subDomain, HTTP_TIMEOUT);
			const userContext = await udemyService.fetchProfile(Settings.accessToken, 30000, Settings.clientId);

			if (!isUdemyLoggedIn(userContext)) {
				if (alertExpired) {
					showAlert(translate("Please login again"), translate("Token expired"));
				}
				ui.resetToLogin();
				return;
			}
			ui.busyLogin(false);
			ui.showDashboard();
			applySessionUser(userContext.header && userContext.header.user);
			downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
			updateQueueStatus();

			Settings.subscriber = utils.toBoolean(userContext.header && userContext.header.user && userContext.header.user.enableLabsInPersonalPlan) || utils.toBoolean(userContext.header && userContext.header.user && userContext.header.user.consumer_subscription_active);
			fetchCourses(Settings.subscriber).then(() => {
				console.log("fetchCourses done");
			});

			if (Settings.download.checkNewVersion) {
				checkUpdate("heliomarpm", true);
			}
		} catch (error) {
			console.error("Failed to fetch user profile", error);
			if (!process.env.DEBUG_MODE) Settings.accessToken = null;

			ui.resetToLogin();
			const status = error.response && error.response.status;
			if (status === 401 || status === 403) {
				showAlert(translate("Please login again"), translate("Token expired"));
			} else {
				showAlert(error.message, error.name || "Error");
			}
		} finally {
			ui.busyLogin(false);
			console.log("access-token saved", Boolean(Settings.accessToken));
		}
	}
}

function readLoginSubdomain(requireBusinessName = false) {
	const $formLogin = $(".ud-login-form");
	const isBusiness = $formLogin.find('input[name="business"]').is(":checked");

	if (isBusiness) {
		const subdomain = String(ui.$subdomainField.val() || "").trim();
		if (!subdomain) {
			if (requireBusinessName) {
				showAlert(translate("Type Business Name"));
			}
			return null;
		}
		return subdomain;
	}

	ui.$subdomainField.val(null);
	return "www";
}

async function loginWithUdemy() {
	try {
		const subdomain = readLoginSubdomain(true);
		if (!subdomain) return;

		Settings.subDomain = subdomain;
		ui.busyLogin(true);

		const session = await native.auth.openUdemyLogin({ subdomain });
		if (!session || !session.accessToken) {
			ui.busyLogin(false);
			return;
		}

		const parsed = utils.parseUdemyCredentials(session.accessToken);
		Settings.accessToken = parsed.accessToken;
		Settings.clientId = parsed.clientId || session.clientId || null;
		Settings.subDomain = session.subDomain || subdomain;
		checkLogin();
	} catch (error) {
		ui.busyLogin(false);
		console.error("Failed to open Udemy login", error);
		showAlert(error.message || String(error), translate("Get Credentials"));
	}
}

function loginWithAccessToken() {
	if (!readLoginSubdomain(true)) return;

	const $panel = $("#token-panel");
	const $input = $("#access-token-input");

	if ($panel.is("[hidden]")) {
		$panel.removeAttr("hidden");
		$input.trigger("focus");
		return;
	}

	submitAccessToken();
}

function submitAccessToken() {
	if (!readLoginSubdomain(true)) return;

	const rawToken = String($("#access-token-input").val() || "").trim();
	if (!rawToken) {
		$("#token-panel").removeAttr("hidden");
		$("#access-token-input").trigger("focus");
		return;
	}

	const parsed = utils.parseUdemyCredentials(rawToken);
	const subdomain = String(ui.$subdomainField.val() || "").trim();
	Settings.accessToken = parsed.accessToken;
	Settings.clientId = parsed.clientId;
	Settings.subDomain = subdomain.length === 0 ? "www" : subdomain;
	checkLogin();
}

window.checkLogin = checkLogin;
window.loginWithUdemy = loginWithUdemy;
window.loginWithAccessToken = loginWithAccessToken;
window.submitAccessToken = submitAccessToken;
window.selectDownloadPath = selectDownloadPath;

function createCourseElement(courseCache, downloadSection = false) {
	courseCache.completed = courseCache.completed || false;
	courseCache.infoDownloaded = "";
	courseCache.encryptedVideos = 0;
	courseCache.pathDownloaded = "";
	courseCache.name = courseCache.name || courseCache.title;

	const history = Settings.downloadHistory.find((x) => Number(x.id) === Number(courseCache.id));
	if (history) {
		courseCache.infoDownloaded = translate(history.completed ? "Download finished on" : "Download started since") + " " + history.date;
		courseCache.completed = history.completed ? true : courseCache.completed;
		courseCache.encryptedVideos = Math.max(courseCache.encryptedVideos, history.encryptedVideos);
		courseCache.selectedSubtitle = history.selectedSubtitle ?? "";
		courseCache.pathDownloaded = history.pathDownloaded ?? "";
	}

	// Se o caminho não existir, obtenha o caminho de configurações de download para o título do curso
	if (!fs.existsSync(courseCache.pathDownloaded)) courseCache.pathDownloaded = Settings.downloadDirectory(sanitize(courseCache.name));

	const tagDismiss = `<a class="ui basic dismiss-download">&nbsp;&nbsp;&nbsp;${translate("Dismiss")}</a>`;

	const $course = $(`
        <div class="ui course item" course-id="${courseCache.id}" course-url="${courseCache.url}" course-completed="${courseCache.completed}">
            <input type="hidden" name="encryptedvideos" value="${courseCache.encryptedVideos}">
            <input type="hidden" name="selectedSubtitle" value="${courseCache.selectedSubtitle}">
            <input type="hidden" name="path-downloaded" value="${courseCache.pathDownloaded}">

            <div class="ui tiny image wrapper">
                <div class="ui tiny label download-quality grey"></div>
                <div class="ui tiny black label download-speed">
                    <span class="value">0</span>
                    <span class="download-unit"> KB/s</span>
                </div>
                <div class="ui red left corner label icon-encrypted">
                    <i class="lock icon"></i>
                </div>
                <img src="${courseCache.image ?? courseCache.image_240x135}" class="course-image border-radius" />
                ${downloadSection ? tagDismiss : ""}
                <div class="tooltip">${courseCache.encryptedVideos == 0 ? "" : MSG_DRM_PROTECTED}</div>
            </div>

            <div class="content">
                <span class="coursename">${courseCache.name}</span>
                <div class="ui tiny icon green download-success message">
                    <i class="check icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${translate("Download Finished")}</h4>
                        </div>
                        <p>${translate("Click to dismiss")}</p>
                    </div>
                </div>
                <div class="ui tiny icon red download-error message">
                    <i class="bug icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${translate("Download Failed")}</h4>
                        </div>
                        <p>${translate("Click to retry")}</p>
                    </div>
                </div>
                <div class="ui tiny icon purple course-encrypted message">
                    <i class="lock icon"></i>
                    <div class="content">
                        <div class="headers">
                            <h4>${MSG_DRM_PROTECTED}</h4>
                        </div>
                        <p>${translate("Click to dismiss")}</p>
                    </div>
                </div>

                <div class="extra download-status">
                    ${ui.actionCardTemplate}
                </div>
                <!-- <div style="margin-top:15px"><span class="lecture-name"></span></div> -->
            </div>
        </div>`);

	if (!downloadSection) {
		if (courseCache.completed) {
			resetCourse($course, $course.find(".download-success"));
		} else if (courseCache.encryptedVideos > 0) {
			resetCourse($course, $course.find(".course-encrypted"));
		} else {
			$course.find(".info-downloaded").html(courseCache.infoDownloaded).css("color", "#6d05e8").show();
		}
	} else {
		if (!courseCache.completed) {
			$course.find(".individual.progress").progress("set percent", courseCache.individualProgress).css("display", "block");
			$course.find(".combined.progress").progress("set percent", courseCache.combinedProgress).css("display", "block");
			$course.find(".download-status .label").html(courseCache.progressStatus);

			$course.find(".info-downloaded").hide();
			// $course.css("padding-bottom", "25px");
		} else {
			$course.find(".info-downloaded").html(courseCache.infoDownloaded).css("color", "#48ca56").show();
		}
	}

	if (Number(courseCache.encryptedVideos) === 0) {
		$course.find(".icon-encrypted").hide();
		$course.find(".ui.tiny.image .tooltip").hide();
		$course.find(".ui.tiny.image").removeClass("wrapper");
	} else {
		$course.find(".icon-encrypted").show();
		$course.find(".ui.tiny.image .tooltip").show();
		$course.find(".ui.tiny.image").addClass("wrapper");
	}

	if (!fs.existsSync(courseCache.pathDownloaded)) {
		$course.find(".open-dir.button").hide();
	}

	return $course;
}

function resetCourse($course, $elMessage, autoRetry, courseData, subtitle) {
	if ($elMessage.hasClass("download-success")) {
		$course.attr("course-completed", true);
	} else {
		$course.attr("course-completed", "");

		if ($elMessage.hasClass("download-error") && autoRetry && courseData) {
			if (courseData.errorCount++ < 5) {
				$course.length = 1;
				startDownload($course, courseData, subtitle);
				return;
			}
		}
	}

	downloadQueue.complete($course.attr("course-id"));
	activeDownloads.delete(String($course.attr("course-id")));
	downloadService.complete(String($course.attr("course-id")));
	updateQueueStatus();

	$course.find(".download-quality").hide();
	$course.find(".download-speed").hide().find(".value").html(0);
	$course.find(".download-status").hide().html(ui.actionCardTemplate);
	// $course.css("padding", "14px 0px");
	$elMessage.css("display", "flex");

	if (Number($course.find("input[name='encryptedvideos']").val()) > 0) {
		$course.find(".icon-encrypted").show();
		$course.find(".ui.tiny.image .tooltip").show();
		$course.find(".ui.tiny.image").addClass("wrapper");
	}
}

function showCoursesPane(pane) {
	const nextPane = pane === "downloads" ? "downloads" : "catalog";
	$("[data-courses-tab]").removeClass("is-active");
	$(`[data-courses-tab="${nextPane}"]`).addClass("is-active");
	$("[data-courses-pane]").attr("hidden", true);
	$(`[data-courses-pane="${nextPane}"]`).removeAttr("hidden");

	if (nextPane === "downloads") {
		renderDownloads();
	}
}

function renderCourses(response, isResearch = false) {
	const $catalog = $(".js-catalog");
	const $coursesItems = $catalog.find(".ui.courses.items").empty();

	$catalog.find(".disposable").remove();

	if (response.results.length) {
		// response.results.forEach(course => {
		//     $coursesItems.append(htmlCourseCard(course));
		// });
		const courseElements = response.results.map((course) => createCourseElement(course));
		$coursesItems.append(courseElements);

		if (response.next) {
            const dataUrl = Array.isArray(response.next) ? response.next : [response.next];
			// added loadMore Button
			$catalog.append(
				`<button class="ui basic blue fluid load-more button disposable" data-url=${JSON.stringify(dataUrl)}>
                    ${translate("Load More")}
                </button>`
			);
		}
	} else {
		let msg = "";
		if (!isResearch) {
			msg = getMsgChangeSearchMode();
			appendLog(translate("No Courses Found"), msg);
		}

		$coursesItems.append(
			`<div class="ui yellow message disposable">
                ${translate("No Courses Found")} <br/>
                ${translate("Remember, you will only be able to see the courses you are enrolled in")}
                ${msg}
            </div>`
		);
	}
}

async function renderDownloads() {
	const $downloadsSection = $(".js-downloads .ui.courses.items");
	if ($downloadsSection.find(".ui.course.item").length) {
		return;
	}

	const downloadedCourses = Settings.downloadedCourses || [];
	if (!downloadedCourses.length) {
		$downloadsSection.html(`<p class="ud-empty">${translate("There are no Downloads to display")}</p>`);
		return;
	}
		ui.busyLoadDownloads(true);
		// await utils.sleep(10);
		// // downloadedCourses.forEach(course => {
		// downloadedCourses.map(course => {
		//     const $courseItem = htmlCourseCard(course, true);
		//     $downloadsSection.append($courseItem);

		//     if (!course.completed && Settings.download.autoStartDownload) {
		//         initializeDownload($courseItem, course.selectedSubtitle);
		//         // $courseItem.find(".action.buttons").find(".pause.button").removeClass("disabled");
		//     }
		// });
		// ui.busyLoadDownloads(false);

		function addCourseToDOM(course) {
			return new Promise((resolve, _reject) => {
				const $courseItem = createCourseElement(course, true);
				$downloadsSection.append($courseItem);

				if (!course.completed && Settings.download.autoStartDownload) {
					prepareDownloading($courseItem, course.selectedSubtitle);
				}

				// Simula atraso de 200ms para demonstração
				// setTimeout(() => { resolve(); }, 200);
				resolve();
			});
		}

		const promises = downloadedCourses.map((course) => addCourseToDOM(course));

		// Executa todas as Promessas em paralelo
		Promise.all(promises)
			.then(() => ui.busyLoadDownloads(false))
			.catch((e) => {
				console.trace("Error adding courses:", e);
				ui.busyLoadDownloads(false);
			});
}

async function fetchCourseContent(courseId, courseName, courseUrl) {
	try {
		// ui.busyBuildCourseData(true);

		const response = await udemyService.fetchCourseContent(courseId, "all");
		if (!response) {
			// ui.busyBuildCourseData(false);
			showAlert(`Id: ${courseId}`, translate("Course not found"));
			return null;
		}
		console.log(`fetchCourseContent (${courseId})`, response);

		const downloadType = Number(Settings.download.type);
		const downloadAttachments = downloadType === Settings.DownloadType.Both || downloadType === Settings.DownloadType.OnlyAttachments;

		const courseData = {
			id: courseId,
			name: courseName,
			chapters: [],
			totalLectures: 0,
			encryptedVideos: 0,
			errorCount: 0,
			availableSubs: [],
		};

		let chapterData = null;
		response.results.forEach((item) => {
			const type = item._class.toLowerCase();
			if (type == "chapter") {
				if (chapterData) {
					courseData.chapters.push(chapterData);
				}
				chapterData = { id: item.id, name: item.title.trim(), lectures: [] };
			} else if (type == "quiz" || type == "practice") {
				const srcUrl = `${courseUrl}t/${item._class}/${item.id}`;

				chapterData.lectures.push({
					type: "url",
					name: item.title,
					src: `<script type="text/javascript">window.location = "${srcUrl}";</script>`,
					quality: "Attachment",
				});
				courseData.totalLectures++;
			} else {
				const lecture = { type, name: item.title, src: "", quality: Settings.download.videoQuality, isEncrypted: false };
				const { asset, supplementary_assets } = item;
				const assetType = asset.asset_type.toLowerCase();

				if (assetType == "article") {
					lecture.type = "article";
					lecture.quality = asset.asset_type;
					lecture.src = asset.data?.body ?? asset.body;
				} else if (assetType == "file" || assetType == "e-book") {
					lecture.type = "file";
					lecture.quality = asset.asset_type;
					lecture.src = asset.download_urls[asset.asset_type][0].file;
				} else if (assetType == "presentation") {
					lecture.type = "file";
					lecture.quality = asset.asset_type;
					lecture.src = asset.url_set[asset.asset_type][0].file;
				} else if (assetType.startsWith("video")) {
					const streams = asset.streams;

					if (!streams.minQuality) {
						//WARN: File not uploaded
						lecture.type = "url";
						lecture.quality = "NotFound";
						lecture.src = `<script type="text/javascript">window.location = "${courseUrl}/${item._class}/${item.id}";</script>`;
						appendLog("File not uploaded", `Course: ${courseId}|${courseName}`, `Lecture: ${item.id}|${item.title}`);
					} else {

						switch ( (lecture.quality || "").toLowerCase()) {
                            case "":
							case "auto":
							case "highest":
								lecture.quality = streams.maxQuality;
								break;
							case "lowest":
								lecture.quality = streams.minQuality;
								break;
							default:
                                lecture.quality = utils.isNumber(lecture.quality) ? lecture.quality : lecture.quality.slice(0, -1);
						}

						if (lecture.quality && !streams.sources[lecture.quality]) {
							if (utils.isNumber(lecture.quality) && streams.maxQuality != "auto") {
								const source = utils.getClosestValue(streams.sources, lecture.quality);
								lecture.quality = source?.key || streams.maxQuality;
							} else {
								lecture.quality = streams.maxQuality;
							}
						}

						lecture.src = streams.sources[lecture.quality].url;
						lecture.type = streams.sources[lecture.quality].type;
						if (streams.isEncrypted) {
							lecture.isEncrypted = true;
							courseData.encryptedVideos++;
						}
					}
				} else {
					appendLog("Unknown Asset Type ", `type: ${assetType}`, `Course: ${courseId}|${courseName}`);
				}

				if (!Settings.download.skipSubtitles && asset.captions.length > 0) {
					lecture.subtitles = {};

					asset.captions.forEach((caption) => {
						caption.video_label in courseData.availableSubs
							? (courseData.availableSubs[caption.video_label] = courseData.availableSubs[caption.video_label] + 1)
							: (courseData.availableSubs[caption.video_label] = 1);

						lecture.subtitles[caption.video_label] = caption.url;
					});
				}

				if (downloadAttachments && supplementary_assets.length > 0) {
					const attachments = (lecture.attachments = []);

					supplementary_assets.forEach((attachment) => {
						const type = attachment.download_urls ? "file" : "url";
						const src = attachment.download_urls
							? attachment.download_urls[attachment.asset_type][0].file
							: `<script type="text/javascript">window.location = "${attachment.external_url}";</script>`;

						attachments.push({ type, name: attachment.title, src, quality: "Attachment" });
					});
				}

				chapterData.lectures.push(lecture);
				courseData.totalLectures++;
			}
		});

		if (chapterData) {
			courseData.chapters.push(chapterData);
		}

		// ui.busyBuildingCourseData(false);
		return courseData;
	} catch (error) {
		handleApiError(error, "EBUILDING_COURSE_DATA", courseName, true);
	}
}

async function fetchCourses(isSubscriber) {
	ui.busyLoadCourses(true);

	udemyService
		.fetchCourses(PAGE_SIZE, isSubscriber)
		.then((resp) => {
			renderCourses(resp);
			if (Settings.downloadedCourses) {
				renderDownloads();
			}
		})
		.catch((e) => {
			handleApiError(e, "EFETCHING_COURSES");
		})
		.finally(() => {
			ui.busyLoadCourses(false);
		});
}

function loadMore(loadMoreButton) {
	const $button = $(loadMoreButton);
	const $courses = $button.prev(".courses.items");
	const url = [...$button.data("url")];

	ui.busyLoadCourses(true);
	udemyService
		.fetchLoadMore(url[0])
		.then((resp) => {
			$courses.append(...resp.results.map((course) => createCourseElement(course, false)));
			if (!resp.next) {
                if (url.length > 1) {
                    $button.data("url", [url[1]]);
                } else {
                    $button.remove();
                }
			} else {
                if (url.length > 1) {
                    $button.data("url", [resp.next, url[1]]);
                }else {
                    $button.data("url", [resp.next]);
                }
            }
		})
		.catch((e) => {
			const statusCode = (e.response?.status || 0).toString() + (e.code ? ` :${e.code}` : "");
			appendLog(`ELOADING_MORE: (${statusCode})`, e);
		})
		.finally(() => {
			ui.busyLoadCourses(false);
		});
}

async function search(keyword) {
	ui.busyLoadCourses(true);

	try {
		const courses = await udemyService.fetchSearchCourses(keyword, PAGE_SIZE, Settings.subscriber);
		renderCourses(courses, !!keyword);
	} catch (error) {
		handleApiError(error, "ESEARCHING_COURSES", null, false);
	} finally {
		ui.busyLoadCourses(false);
	}
}

function getMsgChangeSearchMode() {
	const msg = Settings.subscriber
		? translate("This account has been identified with a subscription plan")
		: translate("This account was identified without a subscription plan");

	const button = `
    <div class="ui fluid buttons">
        <button class='ui primary button change-search-mode' onclick='toggleSubscriber()'>${translate("Change search mode")}</button>
    </div>`;

	return `<p>${msg}<br/>${translate("If it's wrong, change the search mode and try again")}${button}</p>`;
}

/**
 * Toggles the subscriber setting and clears the search field.
 */
function toggleSubscriber() {
	Settings.subscriber = !Settings.subscriber;
	search("");
}

function addDownloadHistory(courseId, courseName, completed = false, encryptedVideos = 0, selectedSubtitle = "", pathDownloaded = "") {
	courseId = Number(courseId);
	courseName = String(courseName) || "";
	completed = Boolean(completed);
	encryptedVideos = Number(encryptedVideos);
	selectedSubtitle = String(selectedSubtitle) || "";
	pathDownloaded = String(pathDownloaded) || "";

	const items = Settings.downloadHistory;
	const index = items.findIndex((x) => Number(x.id) === courseId);

	if (index !== -1) {
		const item = items[index];
		item.id = courseId;
		item.name = courseName;
		if (completed !== Boolean(item.completed)) {
			item.completed = completed;
			item.date = new Date(Date.now()).toLocaleDateString();
		}
		item.encryptedVideos = encryptedVideos;
		item.selectedSubtitle = selectedSubtitle;
		item.pathDownloaded = pathDownloaded;
	} else {
		items.push({
			id: courseId,
			name: courseName,
			completed,
			date: new Date(Date.now()).toLocaleDateString(),
			encryptedVideos,
			selectedSubtitle,
			pathDownloaded,
		});
	}

	Settings.downloadHistory = items;
}

function getDownloadHistory(courseId) {
	return Settings.downloadHistory.find((x) => x.id === courseId) || undefined;
}

function saveDownloads(shouldQuitApp) {
	ui.busySavingHistory(true);

	function getProgress($progress) {
		const dataPercent = $progress.attr("data-percent");
		return parseInt(dataPercent, 10);
	}

	const downloadedCourses = [];
	const downloads = $(".js-downloads .ui.courses.items .ui.course.item");

	downloads.each((_index, element) => {
		const $el = $(element);
		const hasProgress = $el.find(".progress.active").length > 0;
		const individualProgress = hasProgress ? getProgress($el.find(".download-status .individual.progress")) : 0;
		const combinedProgress = hasProgress ? getProgress($el.find(".download-status .combined.progress")) : 0;
		const isCompleted = !hasProgress && $el.attr("course-completed") === "true";

		const courseData = {
			id: Number($el.attr("course-id")),
			url: $el.attr("course-url"),
			name: $el.find(".coursename").text(),
			image: $el.find(".image img").attr("src"),
			individualProgress: Math.min(100, individualProgress),
			combinedProgress: Math.min(100, combinedProgress),
			completed: isCompleted,
			progressStatus: $el.find(".download-status .label").text(),
			encryptedVideos: Number($el.find('input[name="encryptedvideos"]').val()),
			selectedSubtitle: $el.find('input[name="selectedSubtitle"]').val(),
			pathDownloaded: $el.find('input[name="path-downloaded"]').val(),
		};

		downloadedCourses.push(courseData);
		addDownloadHistory(
			courseData.id,
			courseData.name,
			courseData.completed,
			courseData.encryptedVideos,
			courseData.selectedSubtitle,
			courseData.pathDownloaded
		);
	});

	Settings.downloadedCourses = downloadedCourses.sort((a, b) => {
		if (a.completed === b.completed) {
			return b.combinedProgress - a.combinedProgress;
		}
		return a.completed ? 1 : -1;
	});

	if (shouldQuitApp) {
		native.app.quit();
	} else {
		ui.busySavingHistory(false);
	}
}

function removeCurseDownloads(courseId) {
	const $downloads = $(".js-downloads .ui.courses.items .ui.course.item"); //.slice(0);

	$downloads.each((_index, element) => {
		const $el = $(element);
		if ($el.attr("course-id") == courseId) {
			$el.remove();
		}
	});
}

async function saveM3u($course) {
	ui.prepareDownloading($course);

	const courseId = $course.attr("course-id");
	const courseName = $course.find(".coursename").text();
	const courseUrl = `https://${Settings.subDomain}.udemy.com${$course.attr("course-url")}`;

	console.clear();

	let courseData = null;
	try {
		courseData = await fetchCourseContent(courseId, courseName, courseUrl);
		if (!courseData) {
			// ui.showProgress($course, false);
			return;
		}

		console.log(courseData);
		dialog
			.showSaveDialog({
				title: translate("Save playlist"),
				defaultPath: `${courseName}.m3u`,
				filters: [{ name: translate("M3U playlist"), extensions: ["m3u"] }],
			})
			.then((result) => {
				if (!result || result.canceled) {
					return;
				}
				let filePath = result.filePath;
				if (!filePath.endsWith(".m3u")) filePath += ".m3u";

				let content = "#EXTM3U";
				courseData.chapters.forEach((chapter) => {
					chapter.lectures.forEach((lecture, lec_index) => {
						content += `\n#EXTINF:-1,${lec_index + 1}. ${lecture.name}\n${lecture.src}`;

						if (lecture.attachments && lecture.attachments.length > 0) {
							lecture.attachments.forEach((attachment, attach_index) => {
								content += `\n#EXTINF:-1,${lec_index + 1}.${attach_index + 1} ${attachment.name}\n${attachment.src}`;
							});
						}
					});
				});

				fs.writeFile(filePath, content, (error) => {
					if (error) {
						appendLog("saveM3u_Error", error);
						return;
					}
					console.log("File successfully create!");
				});
			});

	} catch (error) {
		handleApiError(error, "ESAVE_M3U", null, false);
		ui.busyOff();
		$course.find(".prepare-downloading").hide();
	} finally {
        ui.showProgress($course, false);
    }
}

async function prepareDownloading($course, subtitle) {
	ui.prepareDownloading($course);
	// ui.showProgress($course, true);

	const courseId = $course.attr("course-id");
	const courseName = $course.find(".coursename").text();
	const courseUrl = `https://${Settings.subDomain}.udemy.com${$course.attr("course-url")}`;

	const skipSubtitles = Boolean(Settings.download.skipSubtitles);
	const defaultSubtitle = skipSubtitles ? null : (subtitle ?? Settings.download.defaultSubtitle);

	console.clear();

	let courseData = null;
	try {
		courseData = await fetchCourseContent(courseId, courseName, courseUrl);
		if (!courseData) {
			ui.showProgress($course, false);
			return;
		}

		const planned = await CoursePlanner.open(courseData, translate);
		if (!planned || planned.totalLectures === 0) {
			ui.showProgress($course, false);
			$course.find(".prepare-downloading").hide();
			return;
		}

		try {
			console.log("Downloading", planned);
			askForSubtitle(planned.availableSubs, planned.totalLectures, defaultSubtitle, (subtitle) => {
				enqueueCourseDownload($course, planned, subtitle);
			});
		} catch (error) {
			throw utils.newError("EASK_FOR_SUBTITLE", error.message);
		}
	} catch (error) {
		const errorName = error.name === "EASK_FOR_SUBTITLE" ? error.name : "EPREPARE_DOWNLOADING";
		handleApiError(error, errorName, null, false);
		ui.busyOff();
		$course.find(".prepare-downloading").hide();
		resetCourse($course, $course.find(".download-error"), Settings.download.autoRetry, courseData, subtitle);
	}
}

function startDownload($course, courseData, subTitle = "") {
	bindAndStartDownload({
		$course,
		courseData,
		subTitle,
		downloadService,
		activeDownloads,
		Settings,
		ui,
		translate,
		sanitize,
		resetCourse,
		sendNotification,
		appendLog,
		$,
	});
}

function askForSubtitle(subtitlesAvailable, totalLectures, defaultSubtitle = "", callback) {
	const subtitleLanguages = [];
	const languages = [];
	const totals = {};
	const languageKeys = {};

    try {
        if (subtitlesAvailable && Object.keys(subtitlesAvailable).length === 0) {
            callback("");
            return;
        }
    } catch (error) {
        return;
    }

	defaultSubtitle = defaultSubtitle.replace(/\s*\[.*?\]/g, "").trim();
	for (const key in subtitlesAvailable) {
		const subtitle = key.replace(/\s*\[.*?\]/g, "").trim();

		// default subtitle exists
		if (subtitle === defaultSubtitle) {
			callback(key);
			return;
		}

		if (!(subtitle in totals)) {
			languages.push(subtitle);
			totals[subtitle] = 0;
			languageKeys[subtitle] = [];
		}

		totals[subtitle] += subtitlesAvailable[key];
		languageKeys[subtitle].push(key);
	}

	if (languages.length === 1) {
		callback(languageKeys[0]);
		return;
	} else if (languages.length === 0) {
		return;
	}

	languages.forEach((language) => {
		totals[language] = Math.min(totalLectures, totals[language]);
	});

	languages.sort();
	languages.forEach((language) => {
		subtitleLanguages.push({
			name: `<b>${language}</b> <i>${totals[language]} ${translate("Lectures")}</i>`,
			value: languageKeys[language].join("|"),
		});
	});
	subtitleLanguages.unshift({ name: "", value: "" });

	const $subtitleModal = $(".ui.subtitle.modal");
	const $subtitleDropdown = $subtitleModal.find(".ui.dropdown");

	$subtitleModal.modal({ closable: false }).modal("show");
	$subtitleDropdown.dropdown({
		values: subtitleLanguages,
		onChange: (subtitle) => {
			$subtitleModal.modal("hide");
			$subtitleDropdown.dropdown({ values: [] });
			callback(subtitle);
		},
	});
}

function sendNotification(pathCourse, courseName, urlImage = null) {
	try {
		new Notification(courseName, {
			body: translate("Download Finished"),
			icon: urlImage ?? __dirname + "/assets/images/build/icon.png",
		}).onclick = () => {
			shell.openPath(pathCourse);
		};
	} catch (error) {
		appendLog("sendNotification", error);
	}
}

function appendLog(title, error, additionalDescription = "") {
	let description =
		error instanceof Error
			? error.message
			: typeof error == "object"
				? JSON.stringify(error)
				: error;

	description += additionalDescription !== "" ? "\n\n" + additionalDescription : "";

	if (error instanceof Error) {
		console.trace(`[${title}] ${error.message}\n ${error.stack}`);
		captureException(error);
	} else {
		console.warn(`[${title}] ${description}`);
	}
}

function handleApiError(error, errorName, courseName = null, triggerThrow = true) {
	error.name = errorName;
	error.code = error.code || "";

	const statusCode = error.response?.status || 0;
	switch (statusCode) {
		case 403:
			error.message = translate("You do not have permission to access this course");
			// prompt.alert(msgError);
			showAlertError(error.message, errorName);
			break;
		case 503:
			error.message = translate("Service is temporarily unavailable. Please wait a few minutes and try again.");
			showAlertError(error.message, errorName);
			break;
		case 504:
			error.message = translate("Service is temporarily unavailable. Please wait a few minutes and try again.");
			showAlertError(error.message, errorName);
			break;
		default:
			break;
	}

	if (courseName) error.message += `\n\n course: ${courseName}`;

	appendLog(`${errorName}: ${error.code}(${statusCode})`, error);

	if (triggerThrow) {
		// throw utils.newError(errorName, error.message);
		throw error;
	}
}

function showAlertError(message, title = "") {
	title = title ? `.:: ${title} ::.` : ".:: Error ::.";
	dialog.showErrorBox(title, String(message || ""));
}

function showAlert(message, title = "") {
	if (title) title = `.:: ${title} ::.\n\r`;
	dialogs.alert(`${title}${message}`);
}

function captureException(exception) {
	if (Sentry) Sentry.captureException(exception);
}

process.on("uncaughtException", (error) => {
	appendLog("EPROCESS_UNCAUGHT_EXCEPTION", error);
	captureException(error);
});

process.on("unhandledRejection", (error) => {
	appendLog("EPROCESS_UNHANDLED_REJECTION", error);
	captureException(error);
});

function shouldSkipExistingFile(filePath) {
	return DownloadService.shouldSkipExistingFile(filePath, Settings.download.skipExistingFiles !== false);
}

function enqueueCourseDownload($course, courseData, subtitle) {
	const courseId = $course.attr("course-id");
	downloadQueue.setConcurrency(Settings.download.maxConcurrentDownloads || 2);
	const status = downloadQueue.enqueue(courseId, () => {
		startDownload($course, courseData, subtitle);
	});
	updateQueueStatus();

	if (status === "duplicate") {
		showAlert(translate("This course is already in the queue"));
		return;
	}

	$course.find(".download.button").addClass("disabled");
	ui.toggleCancelDownload($course, true);

	if (status === "queued") {
		$course.find(".download-status").show();
		$course.find(".combined.progress").show().find(".label").html(translate("Waiting in queue"));
		$course.find(".download.button").addClass("disabled");
	}
}

function cancelActiveDownload(courseId) {
	const id = String(courseId);
	const active = activeDownloads.get(id);
	if (active && typeof active.abort === "function") {
		active.abort();
	}
	activeDownloads.delete(id);
	downloadService.complete(id);
	downloadQueue.cancel(id);
	updateQueueStatus();

	$(`.course.item[course-id="${id}"]`).each((_, el) => {
		const $card = $(el);
		$card.attr("course-completed", "");
		$card.find(".download-quality").hide();
		$card.find(".download-speed").hide().find(".value").html("0");
		$card.find(".prepare-downloading").hide();
		$card.find(".download-status").hide().html(ui.actionCardTemplate);
		$card.find(".download-error, .download-success, .course-encrypted").hide();
		$card.find(".info-downloaded").show();
	});

	$(`.js-downloads .course.item[course-id="${id}"]`).remove();
}

function updateQueueStatus() {
	const $pill = $("#queue-status");
	if (!$pill.length) return;
	const running = downloadQueue.runningCount;
	const pending = downloadQueue.pendingCount;
	if (running + pending === 0) {
		$pill.removeClass("is-visible").text("");
		return;
	}
	$pill.addClass("is-visible").text(`${running}/${downloadQueue.concurrency}`);
}

function applySessionUser(user) {
	if (user) {
		Settings.sessionUser = {
			id: user.id,
			name: user.display_name || user.title || user.name || "",
			email: user.email || "",
			image: user.image_50x50 || user.image_100x100 || "",
		};
	}

	const session = user === null ? null : Settings.sessionUser;
	const $card = $("#session-card");
	if (!$card.length) return;

	if (!session || !session.name) {
		$card.hide();
		return;
	}

	$("#session-name").text(session.name);
	$("#session-email").text(session.email || Settings.subDomain || "");
	const $avatar = $("#session-avatar");
	if (session.image) {
		$avatar.attr("src", session.image).show();
	} else {
		$avatar.hide();
	}
	$card.show();
}

function renderLibrary() {
	const items = LibraryService.list(Settings.downloadDirectory(), Settings.downloadHistory, Settings.downloadedCourses || []);
	const $grid = $("#library-grid").empty();

	if (!items.length) {
		$grid.append(`<p class="ud-empty">${translate("There are no Downloads to display")}</p>`);
		return;
	}

	items.forEach((item) => {
		const cover = item.image
			? `<img src="${item.image}" alt="" />`
			: `<div class="ud-lib-cover"></div>`;
		const status = item.exists
			? item.completed
				? translate("Download Finished")
				: translate("Downloads")
			: translate("Cannot select this folder");

		$grid.append(`
			<article class="ud-lib-card">
				${cover}
				<div class="ud-lib-body">
					<h4>${$("<div>").text(item.name).html()}</h4>
					<div class="ud-lib-meta">${status}${item.encryptedVideos ? " · DRM" : ""}</div>
					<div class="ud-lib-actions">
						<button type="button" class="ud-btn ud-btn-primary" data-open-library="${encodeURIComponent(item.path || "")}" ${item.exists ? "" : "disabled"}>
							${translate("Open")}
						</button>
						<button type="button" class="ud-btn ud-btn-danger" data-delete-library="${encodeURIComponent(item.id)}" data-library-path="${encodeURIComponent(item.path || "")}" data-library-name="${encodeURIComponent(item.name)}">
							${translate("Delete")}
						</button>
					</div>
				</div>
			</article>
		`);
	});
}

$(document).on("click", "[data-open-library]", function () {
	const target = decodeURIComponent($(this).attr("data-open-library") || "");
	if (target) shell.openPath(target);
});

$(document).on("click", "[data-delete-library]", function () {
	const id = decodeURIComponent($(this).attr("data-delete-library") || "");
	const folderPath = decodeURIComponent($(this).attr("data-library-path") || "");
	const name = decodeURIComponent($(this).attr("data-library-name") || "");

	dialogs.confirm(`${translate("Delete from this computer")}?\n\n${name}\n\n${translate("The downloaded files will be removed permanently.")}`, function (ok) {
		if (!ok) return;

		try {
			if (folderPath) {
				LibraryService.removeFolder(Settings.downloadDirectory(), folderPath);
			}

			const next = LibraryService.forget(
				{ id, path: folderPath },
				Settings.downloadHistory,
				Settings.downloadedCourses || []
			);
			Settings.downloadHistory = next.history;
			Settings.downloadedCourses = next.downloadedCourses;

			if (id && !String(id).startsWith("folder:")) {
				removeCurseDownloads(id);
			}

			renderLibrary();
		} catch (error) {
			console.error("Failed to delete library item", error);
			showAlert(error.message || String(error), translate("Delete"));
		}
	});
});

// console.table(getAllDownloadsHistory());
Theme.apply(Settings.theme);
applySessionUser();
checkLogin(false);

window.loginWithUdemy = loginWithUdemy;
window.loginWithAccessToken = loginWithAccessToken;
window.submitAccessToken = submitAccessToken;
window.selectDownloadPath = selectDownloadPath;
