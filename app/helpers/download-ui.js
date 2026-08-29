"use strict";

/**
 * Binds jQuery course-card UI to DownloadService events.
 * Keeps DOM concerns out of the download engine.
 */

/**
 * @param {object} ctx
 * @param {JQuery} ctx.$course
 * @param {object} ctx.courseData
 * @param {string|string[]} ctx.subTitle
 * @param {object} ctx.downloadService
 * @param {Map} ctx.activeDownloads
 * @param {object} ctx.Settings
 * @param {object} ctx.ui
 * @param {Function} ctx.translate
 * @param {Function} ctx.sanitize
 * @param {Function} ctx.resetCourse
 * @param {Function} ctx.sendNotification
 * @param {Function} ctx.appendLog
 * @param {Function} ctx.$
 */
function bindAndStartDownload(ctx) {
	const {
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
	} = ctx;

	ui.showProgress($course, true);

	const subtitle = Array.isArray(subTitle) ? subTitle[0] : subTitle;
	$course.find(".info-downloaded").hide();
	$course.find('input[name="selectedSubtitle"]').val(String(subtitle || "").split("|"));
	$course.find('input[name="encryptedvideos"]').val(courseData.encryptedVideos);

	const $clone = $course.clone();
	const $downloads = $(".js-downloads .ui.courses.items");
	const $courses = $(".js-catalog .ui.courses.items");

	if ($course.closest(".js-catalog").length) {
		const $downloadItem = $downloads.find("[course-id=" + $course.attr("course-id") + "]");
		if ($downloadItem.length) {
			$downloadItem.replaceWith($clone);
		} else {
			$downloads.find(".ud-empty").remove();
			$downloads.prepend($clone);
		}
	} else {
		const $courseItem = $courses.find("[course-id=" + $course.attr("course-id") + "]");
		if ($courseItem.length) {
			$courseItem.replaceWith($clone);
		}
	}
	$course.push($clone[0]);

	const courseId = String($course.attr("course-id"));
	const courseName = sanitize(courseData.name);
	const $progressCombined = $course.find(".combined.progress");
	const $progressIndividual = $course.find(".individual.progress");
	const $downloadSpeed = $course.find(".download-speed");
	const $downloadSpeedValue = $downloadSpeed.find(".value");
	const $downloadSpeedUnit = $downloadSpeed.find(".download-unit");
	const $downloadQuality = $course.find(".download-quality");
	const $downloadButton = $course.find(".download.button");
	const $pauseButton = $course.find(".pause.button");
	const $resumeButton = $course.find(".resume.button");

	const downloadDirectory = Settings.downloadDirectory();
	$course.find('input[name="path-downloaded"]').val(`${downloadDirectory}/${courseName}`);
	$course.find(".open-dir.button").show();

	$downloadButton.addClass("disabled");
	$pauseButton.removeClass("disabled");
	$resumeButton.addClass("disabled");
	ui.toggleCancelDownload($course, true);

	const onEvent = (event, payload) => {
		if (String(payload.courseId) !== courseId) return;

		switch (event) {
			case "path":
				$course.find('input[name="path-downloaded"]').val(payload.downloadPath);
				break;
			case "progress:combined":
				if (payload.action === "reset") {
					$progressCombined.progress({
						total: payload.total,
						text: {
							active: `${translate("Downloaded")} {value} ${translate("out of")} {total} ${translate("items")}`,
						},
					});
					$progressCombined.progress("reset");
					$downloadSpeed.show();
					$downloadQuality.show();
				} else if (payload.action === "increment") {
					$progressCombined.progress("increment");
				}
				break;
			case "progress:individual":
				if (payload.percent === 0) {
					$progressIndividual.progress("reset");
				} else {
					$progressIndividual.progress("set percent", payload.percent);
				}
				break;
			case "speed":
				$downloadSpeedValue.html(payload.value);
				$downloadSpeedUnit.html(payload.unit);
				break;
			case "quality": {
				const lastClass = ($downloadQuality.attr("class") || "").split(" ").pop();
				const raw = String(payload.label);
				const display = Number.isNaN(parseFloat(raw)) ? translate(raw) : `${raw}p`;
				$downloadQuality.html(display).removeClass(lastClass).addClass(payload.color || "grey");
				break;
			}
			case "pause-state":
				if (payload.paused) {
					$pauseButton.addClass("disabled");
					$resumeButton.removeClass("disabled");
				} else {
					$pauseButton.removeClass("disabled");
					$resumeButton.addClass("disabled");
				}
				break;
			case "drm":
				$course.find('input[name="encryptedvideos"]').val(payload.encryptedVideos);
				break;
			case "log":
				appendLog(payload.title, payload.detail);
				break;
			case "encrypted-stop":
				cleanupListeners();
				resetCourse($course, $course.find(".course-encrypted"));
				break;
			case "complete":
				cleanupListeners();
				resetCourse($course, $course.find(".download-success"));
				break;
			case "notify":
				sendNotification(
					payload.pathCourse,
					payload.courseName,
					$course.find(".ui.tiny.image").find(".course-image").attr("src")
				);
				break;
			case "error":
				cleanupListeners();
				resetCourse(
					$course,
					$course.find(".download-error"),
					Boolean(payload.retryable && Settings.download.autoRetry),
					courseData,
					subtitle
				);
				break;
			default:
				break;
		}
	};

	const listeners = [
		"path",
		"progress:combined",
		"progress:individual",
		"speed",
		"quality",
		"pause-state",
		"drm",
		"log",
		"encrypted-stop",
		"complete",
		"notify",
		"error",
	];

	/** @type {Record<string, Function>} */
	const bound = {};
	listeners.forEach((eventName) => {
		bound[eventName] = (payload) => onEvent(eventName, payload);
		downloadService.on(eventName, bound[eventName]);
	});

	function cleanupListeners() {
		listeners.forEach((eventName) => {
			downloadService.off(eventName, bound[eventName]);
		});
	}

	const session = downloadService.start(courseId, courseData, subtitle);

	$pauseButton.off("click").on("click", () => session.pause());
	$resumeButton.off("click").on("click", () => session.resume());

	activeDownloads.set(courseId, {
		abort: () => {
			cleanupListeners();
			session.abort();
			downloadService.complete(courseId);
		},
		pause: () => session.pause(),
		resume: () => session.resume(),
		cleanup: cleanupListeners,
	});
}

module.exports = { bindAndStartDownload };
