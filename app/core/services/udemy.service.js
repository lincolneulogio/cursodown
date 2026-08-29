"use strict";

const nodeHttp = require("./http-client");
const NodeCache = require("node-cache");
const M3U8Service = require("./m3u8.service");

class UdemyService {
	#timeout = 40000;
	#headerAuth = null;

	#urlBase;
	#urlLogin;
	#URL_COURSES = "/users/me/subscribed-courses";
	#URL_COURSES_ENROLL = "/users/me/subscription-course-enrollments";
	#ASSETS_FIELDS = "&fields[asset]=asset_type,title,filename,body,captions,media_sources,stream_urls,download_urls,external_url,media_license_token,length";

	#cache = new NodeCache({ stdTTL: 3600 }); // TTL padrão de 1 hora

	constructor(subDomain = "www", httpTimeout = 40000) {
		subDomain = (subDomain.trim().length === 0 ? "www" : subDomain.trim()).toLowerCase();

		this.#urlBase = `https://${subDomain}.udemy.com`;
		this.#timeout = httpTimeout;
		this.#headerAuth = null;
		this.#urlLogin = `${this.#urlBase}/join/login-popup`;
	}

	get urlBase() {
		return this.#urlBase;
	}

	/**
	 * Applies bearer + cookie auth used by subsequent API calls.
	 * @param {string} accessToken
	 * @param {string|null} [clientId]
	 */
	setAuth(accessToken, clientId = null) {
		this.#headerAuth = this.#buildAuthHeaders(accessToken, clientId);
		return this.#headerAuth;
	}

	#parseCredentials(accessToken, clientId = null) {
		let token = String(accessToken || "").trim();
		if (/^bearer\s+/i.test(token)) {
			token = token.replace(/^bearer\s+/i, "").trim();
		}

		let resolvedClientId = clientId || null;
		const separator = token.lastIndexOf(":");
		if (separator > 0) {
			const maybeClientId = token.slice(separator + 1).trim();
			if (/^[A-Za-z0-9_-]{6,32}$/.test(maybeClientId)) {
				resolvedClientId = resolvedClientId || maybeClientId;
				token = token.slice(0, separator).trim();
			}
		}

		return { token, clientId: resolvedClientId };
	}

	#buildAuthHeaders(accessToken, clientId = null) {
		const { token, clientId: resolvedClientId } = this.#parseCredentials(accessToken, clientId);
		const cookies = [`access_token=${token}`];
		if (resolvedClientId) {
			cookies.push(`client_id=${resolvedClientId}`);
		}

		return {
			Authorization: `Bearer ${token}`,
			"X-Udemy-Authorization": `Bearer ${token}`,
			Cookie: cookies.join("; "),
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.215 Safari/537.36",
			Accept: "application/json, text/plain, */*",
			"Accept-Language": "en-US,en;q=0.9",
			Referer: `${this.#urlBase}/`,
			Origin: this.#urlBase,
			"X-Requested-With": "XMLHttpRequest",
		};
	}

	/**
	 * Creates and returns a new Error object with the specified name and message.
	 *
	 * @param {string} name - The name of the error.
	 * @param {string} [message=""] - The optional error message. Default is an empty string.
	 * @returns {Error} The newly created Error object.
	 */
	_error(name, message = "") {
		const error = new Error();
		error.name = name;
		error.message = message;
		return error;
	}

	async _prepareStreamSource(courseId, el) {
		try {
			if (el._class === "lecture") {
				const assetType = el.asset?.asset_type.toLowerCase();
				if (assetType === "video" || assetType === "videomashup") {
					const asset = el.asset;
					const stream_urls = asset.stream_urls?.Video || asset.media_sources;
					const utils = require("../../helpers/utils");
					const isEncrypted = utils.isUdemyVideoEncrypted({
						...asset,
						media_sources: stream_urls,
						stream_urls: asset.stream_urls,
					});
					if (stream_urls) {
						const streams = await this._convertToStreams(stream_urls, isEncrypted, asset.title);

						delete el.asset.stream_urls;
						delete el.asset.media_sources;
						el.asset.streams = streams;
					} else if (isEncrypted) {
						el.asset.streams = {
							minQuality: null,
							maxQuality: null,
							isEncrypted: true,
							sources: {},
						};
					}
				} else if (assetType === "presentation") {
					const lecture = await this.fetchLecture(courseId, el.id, true, true);
					el.asset = lecture.asset;
					el.supplementary_assets = lecture.supplementary_assets;
				}
			}
		} catch (error) {
			throw this._error("EPREPARE_STREAM_SOURCE", error.message);
		}
	}

	async _prepareStreamsSource(courseId, items) {
		// console.log("Preparing stream urls...", items);
		try {
			const promises = items.map((el) => this._prepareStreamSource(courseId, el));
			await Promise.all(promises);
			// console.log("All streams prepared");
		} catch (error) {
			throw this._error("EPREPARE_STREAMS_SOURCE", error.message);
		}
	}

	/**
	 * Transforms media sources into a standardized format.
	 *
	 * @param {Array<Object>} streamUrls - The array of stream URLs.
	 * @param {boolean} isEncrypted - Indicates if the media is encrypted.
	 * @returns {Promise<{
	 *  minQuality: string|null,
	 *  maxQuality: string|null,
	 *  isEncrypted: boolean
	 *  sources: { [key: string]: { type: string, url: string } }
	 * }>} - The transformed media sources.
	 */
	async _convertToStreams(streamUrls, isEncrypted, title = "") {
		try {
			if (!streamUrls) {
				throw this._error("ENO_STREAMS", "No streams found to convert");
			}

			// Strict DRM: never expose downloadable sources when the asset is encrypted.
			if (isEncrypted) {
				return {
					minQuality: null,
					maxQuality: null,
					isEncrypted: true,
					sources: {},
				};
			}

			const sources = {};
			let minQuality = Number.MAX_SAFE_INTEGER;
			let maxQuality = Number.MIN_SAFE_INTEGER;
			const utils = require("../../helpers/utils");

			const streams = streamUrls.filter((v) => {
				const url = v.file || v.src;
				return url && !utils.isEncryptedMediaUrl(url);
			});

			if (streams.length === 0) {
				return {
					minQuality: null,
					maxQuality: null,
					isEncrypted: true,
					sources: {},
				};
			}

			const promises = streams.map(async (video) => {
				const type = video.type;
				if (type === "application/dash+xml") return;

				const quality = String(video.label || "auto").toLowerCase();
				const url = video.file || video.src;
				if (!url || utils.isEncryptedMediaUrl(url)) return;

				const existing = sources[quality];
				const preferIncoming =
					!existing ||
					(type === "video/mp4" && existing.type !== "video/mp4");
				if (preferIncoming) {
					sources[quality] = { type, url };
				}

				if (quality !== "auto") {
					const numericQuality = parseInt(quality, 10);
					if (!isNaN(numericQuality)) {
						if (numericQuality < minQuality) {
							minQuality = numericQuality;
						}
						if (numericQuality > maxQuality) {
							maxQuality = numericQuality;
						}
					}
					return;
				}

				try {
					const m3u8 = new M3U8Service(url);
					const playlist = await m3u8.loadPlaylist();
					for (const item of playlist) {
						const numericQuality = item.quality;
						if (!numericQuality || Number.isNaN(numericQuality)) continue;
						if (utils.isEncryptedMediaUrl(item.url)) continue;

						if (numericQuality < minQuality) {
							minQuality = numericQuality;
						}
						if (numericQuality > maxQuality) {
							maxQuality = numericQuality;
						}

						const key = numericQuality.toString();
						// Keep existing progressive MP4; only fill gaps with HLS variants.
						if (!sources[key] || sources[key].type !== "video/mp4") {
							sources[key] = {
								type: "application/x-mpegurl",
								url: item.url,
							};
						}
					}
				} catch (_error) {
					// Keep the auto entry when playlist expand fails.
				}
			});

			await Promise.all(promises);

			const usableKeys = Object.keys(sources).filter((key) => sources[key]?.url);
			if (usableKeys.length === 0) {
				return {
					minQuality: null,
					maxQuality: null,
					isEncrypted: true,
					sources: {},
				};
			}

			return {
				minQuality:
					minQuality === Number.MAX_SAFE_INTEGER
						? sources["auto"]
							? "auto"
							: null
						: minQuality.toString(),
				maxQuality:
					maxQuality === Number.MIN_SAFE_INTEGER
						? sources["auto"]
							? "auto"
							: null
						: maxQuality.toString(),
				isEncrypted: false,
				sources,
			};
		} catch (error) {
			throw this._error("ECONVERT_TO_STREAMS", error.message);
		}
	}

	async #fetchUrl(url, method = "GET", httpTimeout = this.#timeout) {
		const isProfileRequest = url.includes("/contexts/me");

		if (!isProfileRequest) {
			const cachedData = this.#cache.get(url);
			if (cachedData) {
				return cachedData;
			}
		}

		console.log(`Fetching URL: ${url}`);
		try {
			const response = await nodeHttp({
				url,
				method,
				headers: this.#headerAuth,
				timeout: httpTimeout || this.#timeout,
			});

			if (!isProfileRequest) {
				this.#cache.set(url, response.data);
			}
			return response.data;
		} catch (e) {
			console.error(`Error fetching URL: ${url}`, e);
			throw e;
		}
	}

	async #fetchEndpoint(endpoint, method = "GET", httpTimeout = this.#timeout) {
		endpoint = `${this.#urlBase}/api-2.0${endpoint}`;
		return await this.#fetchUrl(endpoint, method, httpTimeout);
	}

	async fetchLoadMore(url, httpTimeout = this.#timeout) {
		// Verifique o cache antes de fazer a requisição
		const cachedData = this.#cache.get(url);
		if (cachedData) {
			// console.log(`Cache hit: ${url}`);
			return cachedData;
		}

		// console.log(`Fetching URL: ${url}`);
		try {
			const response = await nodeHttp({
				url,
				method: "GET",
				headers: this.#headerAuth,
				timeout: this.#timeout,
			});

			// Armazene o resultado no cache
			this.#cache.set(url, response.data);
			return response.data;
		} catch (e) {
			console.error(`Error fetching URL: ${url}`, e);
			throw e;
		}
	}

	async fetchProfile(accessToken, httpTimeout = this.#timeout, clientId = null) {
		this.setAuth(accessToken, clientId);
		return await this.#fetchEndpoint("/contexts/me/?header=True", "GET", httpTimeout);
	}

	async fetchSearchCourses(keyword, pageSize, isSubscriber, httpTimeout = this.#timeout) {
		if (!keyword) {
			return await this.fetchCourses(pageSize, isSubscriber, httpTimeout);
		}

		pageSize = Math.max(pageSize, 10);

		const param = `page=1&ordering=title&fields[user]=job_title&fields[course]=id,title,url,published_title,image_480x270,image_240x135,visible_instructors,num_lectures,content_info,completion_ratio,last_accessed_time&page_size=${pageSize}&search=${encodeURIComponent(keyword)}`;
		// const url = !isSubscriber ? `${this.#URL_COURSES}?${param}` : `${this.#URL_COURSES_ENROLL}?${param}`;
        const url = `${this.#URL_COURSES}?${param}`;
        const urlEnroll = `${this.#URL_COURSES_ENROLL}?${param}`;

        if (isSubscriber) {
            const [courses, enrolledCourses] = await Promise.all([
                this.#fetchEndpoint(url, "GET", httpTimeout),
                this.#fetchEndpoint(urlEnroll, "GET", httpTimeout)
            ]);

            const next = [courses.next, enrolledCourses.next].filter((n) => n !== null);
            const previous = [courses.previous, enrolledCourses.previous].filter((p) => p !== null);

            return {
                count: courses.count + enrolledCourses.count,
                next: next.length > 0 ? next : null,
                previous: previous.length > 0 ? previous : null,
                results: [...courses.results, ...enrolledCourses.results]
            }
        }

		return await this.#fetchEndpoint(url, "GET", httpTimeout);
	}

	async fetchCourses(pageSize = 30, isSubscriber = false, httpTimeout = this.#timeout) {
		pageSize = Math.max(pageSize, 10);

		const param = `page_size=${pageSize}&ordering=-last_accessed&fields[course]=id,title,url,published_title,image_480x270,image_240x135,visible_instructors,num_lectures,content_info,completion_ratio,last_accessed_time`;
		// const url = !isSubscriber ? `${this.#URL_COURSES}?${param}` : `${this.#URL_COURSES_ENROLL}?${param}`;
        const url = `${this.#URL_COURSES}?${param}`;
        const urlEnroll = `${this.#URL_COURSES_ENROLL}?${param}`;

        if (isSubscriber) {
            const [courses, enrolledCourses] = await Promise.all([
                this.#fetchEndpoint(url, "GET", httpTimeout),
                this.#fetchEndpoint(urlEnroll, "GET", httpTimeout)
            ]);

            const next = [courses.next, enrolledCourses.next].filter((n) => n !== null);
            const previous = [courses.previous, enrolledCourses.previous].filter((p) => p !== null);

            return {
                count: courses.count + enrolledCourses.count,
                next: next.length > 0 ? next : null,
                previous: previous.length > 0 ? previous : null,
                results: [...courses.results, ...enrolledCourses.results]
            }
        }

		return await this.#fetchEndpoint(url, "GET", httpTimeout);
	}

	async fetchCourse(courseId, httpTimeout = this.#timeout) {
		const url = `/courses/${courseId}/cached-subscriber-curriculum-items?page_size=10000&fields[lecture]=id,title,asset`;
		return await this.#fetchEndpoint(url, "GET", httpTimeout);
	}

	/**
	 * Fetches the lecture data for a given course and lecture ID.
	 *
	 * @param {number} courseId - The ID of the course.
	 * @param {number} lectureId - The ID of the lecture.
	 * @param {boolean} getAttachments - Whether to get supplementary assets. Defaults to false.
	 * @return {Promise<any>} - The lecture data.
	 */
	async fetchLecture(courseId, lectureId, getAttachments, allAssets = false, httpTimeout = this.#timeout) {
		let url = `/users/me/subscribed-courses/${courseId}/lectures/${lectureId}?fields[lecture]=id,title,asset${getAttachments ? ",supplementary_assets" : ""}`;
		url += allAssets ? "&fields[asset]=@all" : this.#ASSETS_FIELDS;

		const lectureData = await this.#fetchEndpoint(`${url}`, "GET", httpTimeout);
		// console.log("fetchLecture", lectureData);
		// await this._prepareStreamSource(lectureData);

		return lectureData;
	}

	async fetchLectureAttachments(lectureId, httpTimeout = this.#timeout) {
		const url = `/lectures/${lectureId}/supplementary-assets`;
		return await this.#fetchEndpoint(url);
	}

	/**
	 * Fetches the course content for a given course ID and content type.
	 *
	 * @param {number} courseId - The ID of the course.
	 * @param {'less' | 'all' | 'lectures' | 'attachments'} [contentType='all'] - The type of content to fetch.
	 * @return {Promise<any>} - The course content data.
	 */
	async fetchCourseContent(courseId, contentType, httpTimeout = this.#timeout) {
		let url = `${this.#urlBase}/api-2.0/courses/${courseId}/cached-subscriber-curriculum-items?page_size=200`;

		contentType = (contentType || "less").toLowerCase();
		if (contentType !== "less") url += "&fields[lecture]=id,title";
		if (contentType === "all") url += ",asset,supplementary_assets";
		if (contentType === "lectures") url += ",asset";
		if (contentType === "attachments") url += ",supplementary_assets";
		if (contentType !== "less") url += this.#ASSETS_FIELDS;

		let contentData = null;
		let loadContent = false;

		try {
			// contentData = await this.#fetchEndpoint(url);
			do {
				const resp = await this.#fetchUrl(url);
				if (!contentData) {
					contentData = resp;
				} else {
					contentData.results.push(...resp.results);
				}

				if (resp.next) {
					url = decodeURI(resp.next);
					url = url.replace(/%5B/g, "[").replace(/%5D/g, "]").replace(/%2C/g, ",");
				}

				loadContent = resp.next != null;
			} while (loadContent);

			loadContent = false;
		} catch (error) {
			if (error?.response?.status === 503) {
				contentData = await this.fetchCourse(courseId, httpTimeout);
				loadContent = contentType !== "less";
			} else {
				throw error;
			}
		}

		if (!contentData || contentData.count == 0) {
			return null;
		}

		if (contentData.results[0]._class !== "chapter") {
			contentData.results.unshift({
				id: 0,
				_class: "chapter",
				title: "Chapter 1",
			});
			contentData.count++;
		}

		if (loadContent) {
			const promises = contentData.results.map(async (el) => {
				if (el._class === "lecture") {
					const lecture = await this.fetchLecture(courseId, el.id, true, false, httpTimeout);
					el.asset = lecture.asset;
					el.supplementary_assets = lecture.supplementary_assets;
				}
				return el;
			});
			await Promise.all(promises);
		}

		contentData.count = contentData.results.length;

		await this._prepareStreamsSource(courseId, contentData.results);
		// console.log("fetchCourseContent", contentData);
		return contentData;
	}

	/**
	 * Lightweight DRM scan without preparing stream URLs.
	 * Uses a small page size and only the fields needed for DRM detection.
	 * @param {string|number} courseId
	 * @param {number} [httpTimeout]
	 * @returns {Promise<{ encryptedVideos: number, videoCount: number, totalLectures: number }>}
	 */
	async scanCourseDrm(courseId, httpTimeout = Math.max(this.#timeout, 60000)) {
		const utils = require("../../helpers/utils");
		let url =
			`${this.#urlBase}/api-2.0/courses/${courseId}/cached-subscriber-curriculum-items` +
			`?page_size=100&fields[lecture]=id,asset` +
			`&fields[asset]=asset_type,media_license_token`;

		let contentData = null;
		let loadMore = false;
		let pages = 0;
		const MAX_PAGES = 40;

		do {
			const resp = await this.#fetchUrl(url, "GET", httpTimeout);
			if (!contentData) {
				contentData = resp;
			} else {
				contentData.results.push(...(resp.results || []));
			}
			pages += 1;
			loadMore = Boolean(resp.next) && pages < MAX_PAGES;
			if (resp.next) {
				url = decodeURI(resp.next)
					.replace(/%5B/g, "[")
					.replace(/%5D/g, "]")
					.replace(/%2C/g, ",");
			}
		} while (loadMore);

		let encryptedVideos = 0;
		let videoCount = 0;
		let totalLectures = 0;

		for (const item of contentData?.results || []) {
			if (!item || item._class !== "lecture") continue;
			totalLectures += 1;
			const assetType = String(item.asset?.asset_type || "").toLowerCase();
			if (!assetType.startsWith("video")) continue;
			videoCount += 1;
			if (utils.isUdemyVideoEncrypted(item.asset)) {
				encryptedVideos += 1;
			}
		}

		return { encryptedVideos, videoCount, totalLectures };
	}

	get urlBase() {
		return this.#urlBase;
	}
	get urlLogin() {
		return this.#urlLogin;
	}

	get timeout() {
		return this.#timeout;
	}
	set timeout(value) {
		this.#timeout = value;
	}
}

module.exports = UdemyService;
