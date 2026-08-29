"use strict";

const ui = {
	navSidebar: (tab, tabName) => {
		$(".content .ui.section").hide();
		$(`.content .ui.${tabName}.section`).show();
		$(tab).parent(".sidebar").find(".active").removeClass("active purple");
		$(tab).addClass("active purple");
	},
	busyOff: () => {
		$(".ui .dimmer").removeClass("active");
	},
	busy: (isActive, text) => {
		const $busyDimmer = $(".ui.dashboard .dimmer");
		$busyDimmer.find(".ui.big.text.loader").text(text);
		if (isActive) {
			$busyDimmer.addClass("active");
		} else {
			$busyDimmer.removeClass("active");
		}
	},
	busyLogin: (isActive) => {
		const status = document.getElementById("login-status");
		if (status) {
			status.hidden = !isActive;
			status.textContent = isActive ? translate("Logging in") : "";
		}
	},
	busyLogout: (isActive) => {
		ui.busy(isActive, translate("Logging Out"));
	},
	busyCheckUpdate: (isActive) => {
		ui.busy(isActive, translate("Checking for Updates"));
	},
	busyLoadCourses: (isActive) => {
		ui.busy(isActive, translate("Loading Courses"));
	},
	busyBuildingCourseData: (isActive) => {
		ui.busy(isActive, translate("Getting Info"));
	},
	busyLoadDownloads: (isActive) => {
		ui.busy(isActive, translate("Loading Downloads"));
	},
	busySavingHistory: (isActive) => {
		ui.busy(isActive, translate("Saving download history"));
	},
	showModalUpdate: () => {
		$(".ui.update-available.modal").modal("show");
	},
	showDashboard: () => {
		$(".ud-login").slideUp("fast");
		$(".ui.dashboard").fadeIn("fast").css("display", "flex");
	},
	resetToLogin: () => {
		$(".ui.dimmer").removeClass("active");
		$(".ui.dashboard .courses.items").empty();
		$(".content .ui.section").hide();
		$(".content .ui.courses.section").show();
		$("[data-courses-tab]").removeClass("is-active");
		$("[data-courses-tab='catalog']").addClass("is-active");
		$("[data-courses-pane]").attr("hidden", true);
		$("[data-courses-pane='catalog']").removeAttr("hidden");
		$(".sidebar").find(".active").removeClass("active purple");
		$(".sidebar").find(".courses-sidebar").addClass("active purple");
		$(".ud-login").slideDown("fast");
		$(".ui.dashboard").fadeOut("fast");
	},
	toggleSubdomainField: (isVisible) => {
		const $subdomainField = $("#divsubdomain");
		isVisible ? $subdomainField.show() : $subdomainField.hide();
	},
	get $subdomainField() {
		return $("#subdomain");
	},
	get actionCardTemplate() {
		return `
            <div class="ud-actions">
                <button type="button" class="ud-icon-btn save_m3u button" data-tip="${translate("Save M3U playlist")}" aria-label="${translate("Save M3U playlist")}"><i class="save outline icon"></i></button>
                <button type="button" class="ud-icon-btn download button" data-tip="${translate("Download course")}" aria-label="${translate("Download course")}"><i class="download icon"></i></button>
                <button type="button" class="ud-icon-btn disabled pause button" data-tip="${translate("Pause download")}" aria-label="${translate("Pause download")}"><i class="pause icon"></i></button>
                <button type="button" class="ud-icon-btn disabled resume button" data-tip="${translate("Resume download")}" aria-label="${translate("Resume download")}"><i class="play icon"></i></button>
                <button type="button" class="ud-icon-btn cancel-download button" data-tip="${translate("Cancel download")}" aria-label="${translate("Cancel download")}" hidden><i class="remove icon"></i></button>
                <button type="button" class="ud-icon-btn open-in-browser button" data-tip="${translate("Open course on Udemy")}" aria-label="${translate("Open course on Udemy")}"><i class="desktop icon"></i></button>
                <button type="button" class="ud-icon-btn open-dir button" data-tip="${translate("Open download folder")}" aria-label="${translate("Open download folder")}"><i class="folder open icon"></i></button>
            </div>
            <div class="ud-progress-block">
                <progress class="prepare-downloading" style="width: 100%; display: none;"></progress>
                <div class="ui tiny indicating individual progress">
                    <div class="bar"></div>
                </div>
                <div class="ui small indicating combined progress">
                    <div class="bar">
                        <div class="progress"></div>
                    </div>
                    <div class="label">${translate("Building Course Data")}</div>
                </div>
            </div>
            <div class="info-downloaded"></div>`;
	},
	prepareDownloading: ($courseCard) => {
		$courseCard.find(".prepare-downloading").show();
		$courseCard.find(".ui.progress").hide();

		$courseCard.find(".individual.progress").progress("reset");
		$courseCard.find(".combined.progress").progress("reset");

		$courseCard.find(".download-quality").html("").hide();
		$courseCard.find(".download-speed").hide();
		$courseCard.find(".download-error").hide();
		$courseCard.find(".course-encrypted").hide();
		$courseCard.find(".download-status").show();
		$courseCard.find(".info-downloaded").hide();
		$courseCard.find(".icon-encrypted").hide();
		$courseCard.find(".ui.tiny.image .tooltip").hide();
		$courseCard.find(".ui.tiny.image").removeClass("wrapper");
		ui.toggleCancelDownload($courseCard, false);
		// $courseCard.find('input[name="encryptedvideos"]').val(0);
		// $courseCard.css("padding-bottom", "25px")
	},
	showProgress: ($courseCard, shouldShow) => {
		$courseCard.find(".prepare-downloading").hide();

		const $progressElement = $courseCard.find(".ui.progress");
		shouldShow ? $progressElement.show() : $progressElement.hide();
	},
	configureEncryptedIcon($courseCard) {
		if (Number($courseCard.find("input[name='encryptedvideos']").val()) === 0) {
			$courseCard.find(".icon-encrypted").hide();
			$courseCard.find(".ui.tiny.image .tooltip").hide();
			$courseCard.find(".ui.tiny.image").removeClass("wrapper");
		} else {
			$courseCard.find(".icon-encrypted").show();
			$courseCard.find(".ui.tiny.image .tooltip").show();
			$courseCard.find(".ui.tiny.image").addClass("wrapper");
		}
	},
	toggleCancelDownload($courseCard, isVisible) {
		const $btn = $courseCard.find(".cancel-download.button");
		if (!$btn.length) return;
		if (isVisible) {
			$btn.removeAttr("hidden");
		} else {
			$btn.attr("hidden", true);
		}
	},
};

module.exports = ui;
