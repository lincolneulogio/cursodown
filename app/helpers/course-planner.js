"use strict";

/**
 * Combined DRM preview + chapter/lecture picker.
 * Resolves with filtered course data, or null if the user cancels.
 */
const CoursePlanner = {
	/**
	 * @param {Object} courseData
	 * @param {(text: string) => string} translate
	 * @returns {Promise<Object|null>}
	 */
	open(courseData, translate) {
		return new Promise((resolve) => {
			const $root = $("#course-planner");
			if (!$root.length || !courseData) {
				resolve(courseData);
				return;
			}

			const stats = CoursePlanner._stats(courseData);
			CoursePlanner._render(courseData, stats, translate);

			const finish = (result) => {
				$root.removeClass("is-open");
				$(document).off("keydown.coursePlanner");
				resolve(result);
			};

            $root.find("[data-planner-cancel]").text(translate("Cancel"));
            $root.find("[data-planner-confirm]").text(translate("Download"));
            $root.find("[data-select-all]").closest("label").find("span").text(translate("Select all"));
            $root.addClass("is-open");
			$root.find("[data-planner-cancel]").off("click").on("click", () => finish(null));
			$root.find("[data-planner-confirm]").off("click").on("click", () => {
				const selected = new Set();
				$root.find('input[data-lecture]:checked').each(function () {
					selected.add(this.getAttribute("data-lecture"));
				});
				finish(CoursePlanner._filter(courseData, selected));
			});

			$root.find("[data-select-all]").off("change").on("change", function () {
				const checked = this.checked;
				$root.find('input[data-lecture]:not(:disabled)').prop("checked", checked);
				$root.find('input[data-chapter]').prop("checked", checked);
				CoursePlanner._updateCount(translate);
			});

			$root.off("change", "input[data-chapter]").on("change", "input[data-chapter]", function () {
				const chapter = this.getAttribute("data-chapter");
				$root.find(`input[data-lecture^="${chapter}:"]:not(:disabled)`).prop("checked", this.checked);
				CoursePlanner._syncSelectAll();
				CoursePlanner._updateCount(translate);
			});

			$root.off("change", "input[data-lecture]").on("change", "input[data-lecture]", function () {
				const chapter = this.getAttribute("data-lecture").split(":")[0];
				const $lectures = $root.find(`input[data-lecture^="${chapter}:"]:not(:disabled)`);
				const checked = $lectures.filter(":checked").length;
				$root.find(`input[data-chapter="${chapter}"]`).prop("checked", checked === $lectures.length && $lectures.length > 0);
				CoursePlanner._syncSelectAll();
				CoursePlanner._updateCount(translate);
			});

			$(document).on("keydown.coursePlanner", (event) => {
				if (event.key === "Escape") {
					finish(null);
				}
			});

			CoursePlanner._updateCount(translate);
			CoursePlanner._syncSelectAll();
		});
	},

	_stats(courseData) {
		let total = 0;
		let encrypted = 0;
		(courseData.chapters || []).forEach((chapter) => {
			(chapter.lectures || []).forEach((lecture) => {
				total += 1;
				if (lecture.isEncrypted) encrypted += 1;
			});
		});
		const percent = total === 0 ? 0 : Math.round((encrypted / total) * 100);
		return { total, encrypted, downloadable: total - encrypted, percent };
	},

	_render(courseData, stats, translate) {
		const $root = $("#course-planner");
		$root.find("[data-planner-title]").text(courseData.name || "");
		$root.find("[data-drm-percent]").text(`${stats.percent}%`);
		$root.find("[data-drm-detail]").text(
			translate("Encrypted lessons") + `: ${stats.encrypted} / ${stats.total}`
		);

		const $banner = $root.find("[data-drm-banner]");
		$banner.toggleClass("is-critical", stats.percent >= 80);
		$banner.toggleClass("is-warning", stats.percent > 0 && stats.percent < 80);
		$banner.toggleClass("is-ok", stats.percent === 0);
		$root.find("[data-drm-hint]").text(
			stats.percent === 0
				? translate("No DRM detected on selected content")
				: translate("Encrypted lessons cannot be downloaded. Attachments can still be saved.")
		);

		const chaptersHtml = (courseData.chapters || [])
			.map((chapter, chapterIndex) => {
				const lectures = (chapter.lectures || [])
					.map((lecture, lectureIndex) => {
						const key = `${chapterIndex}:${lectureIndex}`;
						const locked = Boolean(lecture.isEncrypted);
						return `
							<label class="ud-lecture ${locked ? "is-locked" : ""}">
								<input type="checkbox" data-lecture="${key}" ${locked ? "disabled" : "checked"} />
								<span class="ud-lecture-name">${CoursePlanner._escape(lecture.name)}</span>
								<span class="ud-lecture-meta">${locked ? translate("Encrypted") : CoursePlanner._escape(translate(String(lecture.quality || lecture.type || "")))}</span>
							</label>`;
					})
					.join("");

				return `
					<section class="ud-chapter">
						<label class="ud-chapter-head">
							<input type="checkbox" data-chapter="${chapterIndex}" checked />
								<span>${CoursePlanner._escape(chapter.name)}</span>
							<span class="ud-chapter-count">${(chapter.lectures || []).length}</span>
						</label>
						<div class="ud-lectures">${lectures}</div>
					</section>`;
			})
			.join("");

		$root.find("[data-planner-tree]").html(chaptersHtml || `<p class="ud-empty">${translate("No Courses Found")}</p>`);
		$root.find("[data-select-all]").prop("checked", true);
	},

	_syncSelectAll() {
		const $all = $('#course-planner input[data-lecture]:not(:disabled)');
		const checked = $all.filter(":checked").length;
		$("#course-planner [data-select-all]").prop("checked", $all.length > 0 && checked === $all.length);
	},

	_updateCount(translate) {
		const count = $('#course-planner input[data-lecture]:checked').length;
		$("#course-planner [data-selected-count]").text(`${count} ${translate("items")}`);
	},

	_filter(courseData, selectedKeys) {
		const chapters = [];
		let totalLectures = 0;
		let encryptedVideos = 0;

		(courseData.chapters || []).forEach((chapter, chapterIndex) => {
			const lectures = (chapter.lectures || []).filter((_lecture, lectureIndex) =>
				selectedKeys.has(`${chapterIndex}:${lectureIndex}`)
			);
			if (!lectures.length) return;
			chapters.push({ ...chapter, lectures });
			totalLectures += lectures.length;
			encryptedVideos += lectures.filter((lecture) => lecture.isEncrypted).length;
		});

		return {
			...courseData,
			chapters,
			totalLectures,
			encryptedVideos,
		};
	},

	_escape(value) {
		return String(value || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	},
};

module.exports = CoursePlanner;
