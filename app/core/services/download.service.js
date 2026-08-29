"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const axios = require("./http-client");
const sanitize = require("sanitize-filename");
const vtt2srt = require("node-vtt-to-srt");
const Downloader = require("mt-files-downloader");
const M3U8Service = require("./m3u8.service");

const LABEL_COLOR_MAP = Object.freeze({
	144: "brown",
	240: "purple",
	360: "yellow",
	432: "orange",
	480: "teal",
	576: "blue",
	720: "olive",
	1080: "green",
	Highest: "green",
	auto: "red",
	Auto: "red",
	Attachment: "pink",
	Subtitle: "black",
});

/**
 * Pure download engine for one course.
 * Emits UI-agnostic events; the renderer binds DOM to these.
 *
 * Events:
 *  - progress:individual { percent }
 *  - progress:combined { action: "reset"|"increment", total? }
 *  - speed { value, unit }
 *  - quality { label, color }
 *  - pause-state { paused: boolean }
 *  - path { downloadPath }
 *  - drm { filePath, encryptedVideos }
 *  - log { title, detail }
 *  - complete { success: true }
 *  - encrypted-stop {}
 *  - error { error, retryable: boolean }
 *  - notify { pathCourse, courseName }
 */
class DownloadService extends EventEmitter {
	/**
	 * @param {object} deps
	 * @param {object} deps.settings - Settings module API
	 * @param {object} deps.utils - helpers/utils
	 * @param {(key: string) => string} deps.translate
	 * @param {number} [deps.httpTimeout]
	 * @param {(error: Error) => void} [deps.captureException]
	 */
	constructor(deps) {
		super();
		this.settings = deps.settings;
		this.utils = deps.utils;
		this.translate = deps.translate || ((t) => t);
		this.httpTimeout = deps.httpTimeout || 40000;
		this.captureException = deps.captureException || (() => {});
		/** @type {Map<string, CourseDownloadSession>} */
		this.#sessions = new Map();
	}

	/** @type {Map<string, CourseDownloadSession>} */
	#sessions;

	/**
	 * @param {string|number} courseId
	 * @param {object} courseData
	 * @param {string|string[]} subTitle
	 * @returns {CourseDownloadSession}
	 */
	start(courseId, courseData, subTitle = "") {
		const id = String(courseId);
		this.cancel(id);

		const session = new CourseDownloadSession({
			courseId: id,
			courseData,
			subTitle,
			settings: this.settings,
			utils: this.utils,
			translate: this.translate,
			httpTimeout: this.httpTimeout,
			captureException: this.captureException,
			emit: (event, payload) => this.emit(event, { courseId: id, ...payload }),
		});

		this.#sessions.set(id, session);
		session.start();
		return session;
	}

	pause(courseId) {
		const session = this.#sessions.get(String(courseId));
		if (session) session.pause();
	}

	resume(courseId) {
		const session = this.#sessions.get(String(courseId));
		if (session) session.resume();
	}

	cancel(courseId) {
		const id = String(courseId);
		const session = this.#sessions.get(id);
		if (session) {
			session.abort();
			this.#sessions.delete(id);
		}
	}

	complete(courseId) {
		this.#sessions.delete(String(courseId));
	}

	isActive(courseId) {
		return this.#sessions.has(String(courseId));
	}

	/**
	 * @param {string} filePath
	 * @param {boolean} [skipExisting]
	 * @returns {boolean}
	 */
	static shouldSkipExistingFile(filePath, skipExisting = true) {
		if (!filePath || !fs.existsSync(filePath)) {
			return false;
		}
		if (skipExisting === false) {
			try {
				fs.unlinkSync(filePath);
			} catch (_error) {}
			const mtdPath = `${filePath}.mtd`;
			if (fs.existsSync(mtdPath)) {
				try {
					fs.unlinkSync(mtdPath);
				} catch (_error) {}
			}
			return false;
		}
		return true;
	}

	static hasDRMProtection(dl) {
		try {
			const encrypted = Boolean(dl && dl.url && String(dl.url).includes("encrypted-files"));
			if (encrypted) console.warn("Arquivo encriptado", dl);
			return encrypted;
		} catch (_error) {
			return false;
		}
	}

	static get labelColorMap() {
		return LABEL_COLOR_MAP;
	}
}

class CourseDownloadSession {
	constructor(options) {
		this.courseId = options.courseId;
		this.courseData = options.courseData;
		this.settings = options.settings;
		this.utils = options.utils;
		this.translate = options.translate;
		this.httpTimeout = options.httpTimeout;
		this.captureException = options.captureException;
		this.emit = options.emit;

		const raw = Array.isArray(options.subTitle) ? options.subTitle[0] : options.subTitle;
		this.subtitle = String(raw || "").split("|").filter(Boolean);

		this.cancelled = false;
		this.timerDownloader = null;
		this.downloader = new Downloader();
		this.downloaded = 0;
		this.toDownload = 0;
		this.courseName = sanitize(this.courseData.name || "course");
		this.downloadDirectory = this.settings.downloadDirectory();
		this.coursePath = path.join(this.downloadDirectory, this.courseName);
	}

	start() {
		this.emit("path", { downloadPath: this.coursePath });

		const lectureChapterMap = {};
		let sequenceMap = 0;
		this.courseData.chapters.forEach((chapter, chapterIndex) => {
			chapter.lectures.forEach((_lecture, lectureIndex) => {
				sequenceMap++;
				lectureChapterMap[sequenceMap] = { chapterIndex, lectureIndex };
			});
		});

		this.toDownload = this.courseData.totalLectures;
		const enableDownloadStartEnd = this.settings.download.enableDownloadStartEnd;
		let downloadStart = 1;

		if (enableDownloadStartEnd) {
			downloadStart = Math.max(1, Math.min(this.settings.download.downloadStart, this.toDownload));
			let downloadEnd = Math.max(0, this.settings.download.downloadEnd);
			downloadEnd = Math.max(downloadStart, downloadEnd === 0 ? this.toDownload : downloadEnd);
			this.toDownload = downloadEnd - downloadStart + 1;
		}

		this.emit("progress:combined", { action: "reset", total: this.toDownload });
		this.emit("pause-state", { paused: false });

		if (enableDownloadStartEnd) {
			const mapped = lectureChapterMap[downloadStart];
			this.downloadChapter(mapped.chapterIndex, mapped.lectureIndex);
		} else {
			this.downloadChapter(0, 0);
		}
	}

	abort() {
		this.cancelled = true;
		if (this.timerDownloader) {
			clearInterval(this.timerDownloader);
			this.timerDownloader = null;
		}
		try {
			(this.downloader._downloads || []).forEach((dl) => {
				if (dl && typeof dl.stop === "function") dl.stop();
			});
		} catch (_error) {}
	}

	pause(isEncrypted) {
		if (this.downloader._downloads?.length) {
			this.downloader._downloads[this.downloader._downloads.length - 1].stop();
			this.emit("pause-state", { paused: true });
			if (isEncrypted) {
				this.emit("encrypted-stop", {});
			}
		}
	}

	resume() {
		if (this.downloader._downloads?.length) {
			this.downloader._downloads[this.downloader._downloads.length - 1].resume();
			this.emit("pause-state", { paused: false });
		}
	}

	setLabelQuality(label) {
		const color = LABEL_COLOR_MAP[label] || "grey";
		this.emit("quality", { label, color });
	}

	shouldSkip(filePath) {
		return DownloadService.shouldSkipExistingFile(filePath, this.settings.download.skipExistingFiles !== false);
	}

	downloadChapter(chapterIndex, lectureIndex) {
		if (this.cancelled) return;
		try {
			const countLectures = this.courseData.chapters[chapterIndex].lectures.length;
			const seqName = this.utils.getSequenceName(
				chapterIndex + 1,
				this.courseData.chapters.length,
				sanitize(this.courseData.chapters[chapterIndex].name.trim()),
				". ",
				this.coursePath
			);

			fs.mkdirSync(seqName.fullPath, { recursive: true });
			this.downloadLecture(chapterIndex, lectureIndex, countLectures, seqName.name);
		} catch (error) {
			this.emit("log", { title: "EDOWNLOADING_CHAPTER", detail: error });
			this.emit("error", { error, retryable: false });
		}
	}

	downloadLecture(chapterIndex, lectureIndex, countLectures, sanitizedChapterName) {
		if (this.cancelled) return;
		try {
			if (this.downloaded === this.toDownload) {
				this.emit("complete", { success: true });
				this.emit("notify", {
					pathCourse: this.coursePath,
					courseName: this.courseName,
				});
				return;
			}
			if (lectureIndex === countLectures) {
				this.downloadChapter(chapterIndex + 1, 0);
				return;
			}

			const chapterName = this.courseData.chapters[chapterIndex].name.trim();
			const lectureData = this.courseData.chapters[chapterIndex].lectures[lectureIndex];
			const lectureType = String(lectureData.type || "").toLowerCase();
			const lectureName = lectureData.name.trim();
			const sanitizedLectureName = sanitize(lectureName);
			const chapterDir = path.join(this.coursePath, sanitizedChapterName);

			const dlStart = (dl, typeVideo, callback) => {
				if (this.cancelled) return;
				dl.setRetryOptions({ maxRetries: 3, retryInterval: 3000 });
				dl.setOptions({ threadsCount: 5, timeout: 5000, range: "0-100" });
				dl.start();

				let notStarted = 0;
				let reStarted = 0;

				this.timerDownloader = setInterval(() => {
					if (this.cancelled) {
						clearInterval(this.timerDownloader);
						this.timerDownloader = null;
						try {
							if (dl && typeof dl.stop === "function") dl.stop();
						} catch (_error) {}
						return;
					}

					switch (dl.status) {
						case 0:
							if (reStarted <= 5) {
								notStarted++;
								if (notStarted >= 15) {
									dl.start();
									notStarted = 0;
									reStarted++;
								}
							}
							this.emit("speed", { value: 0, unit: "B/s" });
							break;
						case 1:
						case -1: {
							const stats = dl.getStats();
							const speedAndUnit = this.utils.getDownloadSpeed(stats.present.speed || 0);
							this.emit("speed", speedAndUnit);
							this.emit("progress:individual", { percent: stats.total.completed });

							if (dl.status === -1 && dl.stats.total.size == 0 && fs.existsSync(dl.filePath)) {
								dl.emit("end");
								clearInterval(this.timerDownloader);
							} else if (dl.status === -1) {
								this.emit("log", { title: "Download error, retrying... ", detail: { url: dl.url } });
								axios({ timeout: this.httpTimeout, method: "HEAD", url: dl.url })
									.then(() => {
										this.emit("error", { error: new Error("download retry"), retryable: true });
									})
									.catch((error) => {
										const statusCode = error.response?.status || 0;
										const unlinkFile = statusCode === 401 || statusCode === 403;
										try {
											if (unlinkFile) fs.unlinkSync(dl.filePath);
										} finally {
											this.emit("error", {
												error,
												retryable: this.settings.download.autoRetry && !unlinkFile,
											});
										}
									});
								clearInterval(this.timerDownloader);
							}
							break;
						}
						case 2:
						case -3:
							break;
						default:
							this.emit("speed", { value: 0, unit: "B/s" });
					}
				}, 1000);

				dl.on("error", (item) => {
					console.error("dl.on(error)", item.error && item.error.message);
					if (DownloadService.hasDRMProtection(item)) {
						item.emit("end");
					} else {
						this.emit("log", { title: "DL_ONERROR", detail: item.error && item.error.message });
					}
				});

				dl.on("start", () => {
					this.emit("pause-state", { paused: false });
				});

				dl.on("stop", () => {
					console.warn("dl.on(stop)");
				});

				dl.on("end", () => {
					if (typeVideo && DownloadService.hasDRMProtection(dl)) {
						this.courseData.encryptedVideos = Number(this.courseData.encryptedVideos || 0) + 1;
						this.emit("drm", {
							filePath: dl.filePath,
							encryptedVideos: this.courseData.encryptedVideos,
						});
						this.emit("log", { title: `DRM Protected::${this.courseData.name}`, detail: dl.filePath });
						fs.unlink(dl.filePath + ".mtd", (err) => {
							if (err) console.error("dl.on(end)__fs.unlink", err.message);
						});

						if (!this.settings.download.continueDonwloadingEncrypted) {
							dl.destroy();
							this.pause(true);
							clearInterval(this.timerDownloader);
							return;
						}
					}
					callback();
				});
			};

			const downloadAttachments = (index, totalAttachments) => {
				this.emit("progress:individual", { percent: 0 });
				const attachment = lectureData.attachments[index];
				const attachmentName = attachment.name.trim();
				this.setLabelQuality(attachment.quality || "Attachment");

				if (["article", "url"].includes(attachment.type)) {
					fs.writeFile(
						this.utils.getSequenceName(lectureIndex + 1, countLectures, attachmentName + ".html", `.${index + 1} `, chapterDir).fullPath,
						attachment.src,
						() => {
							index++;
							if (index === totalAttachments) {
								this.emit("progress:combined", { action: "increment" });
								this.downloaded++;
								this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
							} else {
								downloadAttachments(index, totalAttachments);
							}
						}
					);
					return;
				}

				let fileExtension = attachment.src.split("/").pop().split("?").shift().split(".").pop();
				fileExtension = attachment.name.split(".").pop() == fileExtension ? "" : "." + fileExtension;

				const lectureSeqName = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitize(attachmentName) + fileExtension,
					`.${index + 1} `,
					chapterDir
				);

				if (fs.existsSync(lectureSeqName.fullPath + ".mtd") && !fs.statSync(lectureSeqName.fullPath + ".mtd").size) {
					fs.unlinkSync(lectureSeqName.fullPath + ".mtd");
				}

				const endAttachment = () => {
					index++;
					clearInterval(this.timerDownloader);
					if (index === totalAttachments) {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					} else {
						downloadAttachments(index, totalAttachments);
					}
				};

				let dl;
				if (fs.existsSync(lectureSeqName.fullPath + ".mtd")) {
					dl = this.downloader.resumeDownload(lectureSeqName.fullPath);
				} else if (this.shouldSkip(lectureSeqName.fullPath)) {
					endAttachment();
					return;
				} else {
					dl = this.downloader.download(attachment.src, lectureSeqName.fullPath);
				}

				dlStart(dl, String(attachment.type || "").includes("video"), endAttachment);
			};

			const checkAttachment = () => {
				this.emit("progress:individual", { percent: 0 });
				if (lectureData.attachments) {
					lectureData.attachments.sort(this.utils.dynamicSort("name"));
					downloadAttachments(0, lectureData.attachments.length);
				} else {
					if (lectureData.isEncrypted) {
						this.emit("log", {
							title: "Video with DRM Protection",
							detail: `Chapter: ${chapterName}\nLecture: ${lectureName}`,
						});
					}
					this.emit("progress:combined", { action: "increment" });
					this.downloaded++;
					this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
				}
			};

			const downloadSubtitle = () => {
				this.emit("progress:individual", { percent: 0 });
				this.setLabelQuality("Subtitle");
				this.emit("speed", { value: 0, unit: "B/s" });

				const subtitleSeqName = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitizedLectureName + ".srt",
					". ",
					path.join(chapterDir, "subs")
				);

				if (fs.existsSync(subtitleSeqName.fullPath) && this.shouldSkip(subtitleSeqName.fullPath)) {
					checkAttachment();
					return;
				}

				fs.mkdirSync(path.join(chapterDir, "subs"), { recursive: true });

				const vttFile = subtitleSeqName.fullPath.replace(".srt", ".vtt");
				const vttFileWS = fs.createWriteStream(vttFile).on("finish", () => {
					const strFileWS = fs.createWriteStream(subtitleSeqName.fullPath).on("finish", () => {
						fs.unlinkSync(vttFile);
						checkAttachment();
					});
					fs.createReadStream(vttFile).pipe(vtt2srt()).pipe(strFileWS);
				});

				const subtitles = lectureData.subtitles || {};
				const availables = this.subtitle.filter((el) => el in subtitles);
				let downloadThisSub = availables[0] || Object.keys(subtitles)[0] || "";

				if (availables.length > 1) {
					for (const key of availables) {
						const autoTag = `[${this.translate("Auto")}]`;
						if (key.indexOf("[Auto]") === -1 && key.indexOf(autoTag) === -1) {
							downloadThisSub = key;
							break;
						}
					}
				}

				if (!downloadThisSub || !subtitles[downloadThisSub]) {
					checkAttachment();
					return;
				}

				https.get(subtitles[downloadThisSub], (response) => {
					response.pipe(vttFileWS);
				});
			};

			const endDownloadAttachment = () => {
				clearInterval(this.timerDownloader);
				if (this.courseData.chapters[chapterIndex].lectures[lectureIndex].subtitles) {
					downloadSubtitle();
				} else {
					checkAttachment();
				}
			};

			this.emit("progress:individual", { percent: 0 });
			this.setLabelQuality(lectureData.quality || "Auto");

			if (lectureType === "article" || lectureType === "url") {
				const articlePath = this.utils.getSequenceName(
					lectureIndex + 1,
					countLectures,
					sanitizedLectureName + ".html",
					". ",
					chapterDir
				).fullPath;

				if (this.shouldSkip(articlePath)) {
					if (lectureData.attachments) {
						lectureData.attachments.sort(this.utils.dynamicSort("name"));
						downloadAttachments(0, lectureData.attachments.length);
					} else {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					}
					return;
				}

				fs.writeFile(articlePath, lectureData.src, () => {
					if (lectureData.attachments) {
						lectureData.attachments.sort(this.utils.dynamicSort("name"));
						downloadAttachments(0, lectureData.attachments.length);
					} else {
						this.emit("progress:combined", { action: "increment" });
						this.downloaded++;
						this.downloadLecture(chapterIndex, lectureIndex + 1, countLectures, sanitizedChapterName);
					}
				});
				return;
			}

			const seqName = this.utils.getSequenceName(
				lectureIndex + 1,
				countLectures,
				sanitizedLectureName + (lectureType === "file" ? ".pdf" : ".mp4"),
				". ",
				chapterDir
			);

			const skipLecture = this.settings.download.type == this.settings.DownloadType.OnlyAttachments;

			if (lectureType !== "application/x-mpegurl") {
				if (this.shouldSkip(seqName.fullPath) || skipLecture || lectureData.isEncrypted) {
					endDownloadAttachment();
					return;
				}

				if (fs.existsSync(seqName.fullPath + ".mtd") && !fs.statSync(seqName.fullPath + ".mtd").size) {
					fs.unlinkSync(seqName.fullPath + ".mtd");
				}

				let dl;
				if (fs.existsSync(seqName.fullPath + ".mtd")) {
					dl = this.downloader.resumeDownload(seqName.fullPath);
				} else {
					dl = this.downloader.download(lectureData.src, seqName.fullPath);
				}
				dlStart(dl, lectureType.includes("video"), endDownloadAttachment);
				return;
			}

			if (this.shouldSkip(seqName.fullPath) || skipLecture || lectureData.isEncrypted) {
				endDownloadAttachment();
				return;
			}
			if (fs.existsSync(seqName.fullPath + ".mtd")) {
				fs.unlinkSync(seqName.fullPath + ".mtd");
			}

			this.downloadHls(lectureData.src, seqName.fullPath)
				.then(() => endDownloadAttachment())
				.catch((error) => {
					this.emit("log", { title: "downloadLecture_HLS_Error", detail: error });
					this.captureException(error);
					this.emit("error", { error, retryable: false });
				});
		} catch (error) {
			this.emit("log", { title: "downloadLecture_Error:", detail: error });
			this.captureException(error);
			this.emit("error", { error, retryable: false });
		}
	}

	/**
	 * Downloads an HLS playlist into a single binary file.
	 * @param {string} playlistUrl
	 * @param {string} outputPath
	 */
	async downloadHls(playlistUrl, outputPath) {
		const list = await M3U8Service.resolveSegmentUrls(playlistUrl, (quality) => {
			this.setLabelQuality(quality);
		});

		if (!list.length) {
			return;
		}

		this.emit("progress:individual", { percent: 0 });
		const CHUNK_SIZE = 100;
		let count = 0;

		for (let i = 0; i < list.length; i += CHUNK_SIZE) {
			if (this.cancelled) return;
			const chunk = list.slice(i, i + CHUNK_SIZE);
			const result = [];

			for (const url of chunk) {
				const startTime = performance.now();
				const response = await M3U8Service.getFile(url, true);
				const endTime = performance.now();
				const timeDiff = (endTime - startTime) / 1000.0;

				if (!response) {
					throw new Error("Invalid or null HLS segment response");
				}

				const speedAndUnit = this.utils.getDownloadSpeed(response.byteLength / timeDiff);
				this.emit("speed", speedAndUnit);
				result.push(response);
				count++;
				this.emit("progress:individual", { percent: parseInt((count / list.length) * 100, 10) });
			}

			const buffers = result.map((segment) => Buffer.from(segment));
			fs.appendFileSync(outputPath, Buffer.concat(buffers));
		}
	}
}

module.exports = DownloadService;
module.exports.CourseDownloadSession = CourseDownloadSession;
