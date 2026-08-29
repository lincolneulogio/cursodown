import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppSettingsSnapshot } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";
import { AboutPage } from "./AboutPage";

type ThemeMode = "dark" | "light";

interface DownloadFormState {
	checkNewVersion: boolean;
	defaultSubtitle: string;
	path: string;
	autoStartDownload: boolean;
	continueDonwloadingEncrypted: boolean;
	enableDownloadStartEnd: boolean;
	downloadStart: number;
	downloadEnd: number;
	videoQuality: string;
	type: number;
	skipSubtitles: boolean;
	seqZeroLeft: boolean;
	autoRetry: boolean;
	skipExistingFiles: boolean;
	maxConcurrentDownloads: number;
	bandwidthLimitKbps: number;
	folderLayout: "course" | "instructor";
	exportIndexOnComplete: boolean;
}

interface SettingsFormState {
	language: string;
	theme: ThemeMode;
	notificationsEnabled: boolean;
	uiDensity: "compact" | "comfortable";
	download: DownloadFormState;
}

const VIDEO_QUALITIES = [
	"Auto",
	"Highest",
	"1080",
	"720",
	"576",
	"480",
	"432",
	"360",
	"Lowest",
] as const;

function asBoolean(value: unknown, fallback = false): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function snapshotToForm(snapshot: AppSettingsSnapshot): SettingsFormState {
	const d = snapshot.download || {};
	return {
		language: snapshot.language || "Español",
		theme: snapshot.theme === "light" ? "light" : "dark",
		notificationsEnabled: snapshot.notificationsEnabled !== false,
		uiDensity: snapshot.uiDensity === "compact" ? "compact" : "comfortable",
		download: {
			checkNewVersion: asBoolean(d.checkNewVersion, true),
			defaultSubtitle: asString(d.defaultSubtitle, ""),
			path: asString(d.path, snapshot.downloadPath || ""),
			autoStartDownload: asBoolean(d.autoStartDownload, false),
			continueDonwloadingEncrypted: asBoolean(d.continueDonwloadingEncrypted, false),
			enableDownloadStartEnd: asBoolean(d.enableDownloadStartEnd, false),
			downloadStart: asNumber(d.downloadStart, 0),
			downloadEnd: asNumber(d.downloadEnd, 0),
			videoQuality: asString(d.videoQuality, "Auto"),
			type: asNumber(d.type, 0),
			skipSubtitles: asBoolean(d.skipSubtitles, false),
			seqZeroLeft: asBoolean(d.seqZeroLeft, false),
			autoRetry: asBoolean(d.autoRetry, false),
			skipExistingFiles: asBoolean(d.skipExistingFiles, true),
			maxConcurrentDownloads: asNumber(d.maxConcurrentDownloads, 3),
			bandwidthLimitKbps: asNumber(d.bandwidthLimitKbps, 0),
			folderLayout: d.folderLayout === "instructor" ? "instructor" : "course",
			exportIndexOnComplete: asBoolean(d.exportIndexOnComplete, true),
		},
	};
}

function applyTheme(theme: ThemeMode) {
	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.classList.toggle("light", theme === "light");
	root.setAttribute("data-theme", theme);
}

interface SettingsPageProps {
	onBusy: (busy: boolean, message?: string) => void;
	onAppearanceChange?: () => void;
}

export function SettingsPage({ onBusy, onAppearanceChange }: SettingsPageProps) {
	const { t, languages } = useI18n();
	const [form, setForm] = useState<SettingsFormState | null>(null);
	const [saved, setSaved] = useState(false);

	const languageOptions = useMemo(() => {
		const list = languages.length > 0 ? languages : ["Español"];
		return list;
	}, [languages]);

	useEffect(() => {
		const api = getUdeler();
		if (!api) return;
		const snapshot = api.settings.getSnapshot();
		const next = snapshotToForm(snapshot);
		setForm(next);
		applyTheme(next.theme);
	}, []);

	if (!form) {
		return <p className="text-sm text-ud-text-muted">{t("Loading")}</p>;
	}

	const updateDownload = <K extends keyof DownloadFormState>(
		key: K,
		value: DownloadFormState[K]
	) => {
		setForm((prev) =>
			prev
				? {
						...prev,
						download: { ...prev.download, [key]: value },
					}
				: prev
		);
		setSaved(false);
	};

	const selectPath = async () => {
		const api = getUdeler();
		if (!api) return;
		const dir = await api.dialog.selectDirectory();
		if (dir) {
			updateDownload("path", dir);
		}
	};

	const onThemeChange = (theme: ThemeMode) => {
		setForm((prev) => (prev ? { ...prev, theme } : prev));
		applyTheme(theme);
		getUdeler()?.settings.setTheme(theme);
		onAppearanceChange?.();
		setSaved(false);
	};

	const onDensityChange = (uiDensity: "compact" | "comfortable") => {
		setForm((prev) => (prev ? { ...prev, uiDensity } : prev));
		document.documentElement.setAttribute("data-density", uiDensity);
		getUdeler()?.settings.setDensity?.(uiDensity);
		onAppearanceChange?.();
		setSaved(false);
	};

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		const api = getUdeler();
		if (!api || !form) return;
		onBusy(true, t("Saving"));
		try {
			api.settings.save({
				language: form.language,
				theme: form.theme,
				notificationsEnabled: form.notificationsEnabled,
				uiDensity: form.uiDensity,
				downloadPath: form.download.path,
				download: { ...form.download },
			});
			api.notify?.setEnabled(form.notificationsEnabled);
			api.settings.setTheme(form.theme);
			api.settings.setDensity?.(form.uiDensity);
			applyTheme(form.theme);
			document.documentElement.setAttribute("data-density", form.uiDensity);
			onAppearanceChange?.();
			setSaved(true);
		} finally {
			onBusy(false);
		}
	};

	const Toggle = ({
		checked,
		label,
		onChange,
	}: {
		checked: boolean;
		label: string;
		onChange: (value: boolean) => void;
	}) => (
		<label className="flex items-center justify-between gap-3 rounded-lg border border-ud-border bg-ud-elevated px-3 py-2.5 text-sm">
			<span>{label}</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="h-4 w-4 accent-ud-accent"
			/>
		</label>
	);

	return (
		<div className="space-y-6">
			<header>
				<h2 className="text-xl font-semibold">{t("Settings")}</h2>
			</header>

			<form className="space-y-6" onSubmit={onSubmit}>
				<section className="space-y-3">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-ud-text-muted">
						{t("Application Settings")}
					</h3>
					<Toggle
						checked={form.download.checkNewVersion}
						label={t("Check for a new version on startup")}
						onChange={(v) => updateDownload("checkNewVersion", v)}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => {
								const api = getUdeler();
								if (!api?.updates) return;
								onBusy(true, t("Checking for updates"));
								void api.updates
									.check({ silent: false })
									.then((status) => {
										if (status.phase === "not-available") {
											api.notify.show(t("Updates"), t("You are on the latest version"));
										} else if (status.phase === "error" && status.error) {
											const msg =
												status.error === "UPDATE_PUBLISHING"
													? t(
															"Update is still being published. Try again in a few minutes."
														)
													: status.error === "UPDATE_NETWORK"
														? t("Could not check for updates. Check your connection.")
														: status.error;
											api.notify.show(t("Updates"), msg);
										}
									})
									.finally(() => onBusy(false));
							}}
							className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
						>
							{t("Check for updates now")}
						</button>
						<span className="text-xs text-ud-text-muted">
							v{getUdeler()?.env.appVersion || ""}
							{getUdeler()?.env.isPackage ? "" : ` (${t("Dev mode — updates disabled")})`}
						</span>
					</div>
					<Toggle
						checked={form.theme === "dark"}
						label={t("Dark mode")}
						onChange={(v) => onThemeChange(v ? "dark" : "light")}
					/>
					<div className="space-y-2">
						<p className="text-sm text-ud-text-muted">{t("UI density")}</p>
						{(
							[
								{
									value: "comfortable" as const,
									title: t("Comfortable"),
									hint: t("More spacing, easier to read"),
								},
								{
									value: "compact" as const,
									title: t("Compact"),
									hint: t("Denser layout, more content on screen"),
								},
							] as const
						).map((opt) => (
							<label
								key={opt.value}
								className={[
									"flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm",
									form.uiDensity === opt.value
										? "border-ud-accent bg-ud-accent/10"
										: "border-ud-border bg-ud-elevated",
								].join(" ")}
							>
								<span className="flex items-center gap-2 font-medium">
									<input
										type="radio"
										name="uiDensity"
										checked={form.uiDensity === opt.value}
										onChange={() => onDensityChange(opt.value)}
									/>
									{opt.title}
								</span>
								<span className="pl-6 text-xs text-ud-text-muted">{opt.hint}</span>
							</label>
						))}
						<p className="text-xs text-ud-text-muted">
							{t("Press ? for keyboard shortcuts")}
						</p>
					</div>
					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Language (Requires App Restart)")}</span>
						<select
							value={form.language}
							onChange={(e) => {
								setForm((prev) =>
									prev ? { ...prev, language: e.target.value } : prev
								);
								setSaved(false);
							}}
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						>
							{languageOptions.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</label>
					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Default Subtitle for download")}</span>
						<select
							value={form.download.defaultSubtitle}
							onChange={(e) => updateDownload("defaultSubtitle", e.target.value)}
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						>
							<option value="">{t("None")}</option>
							{languageOptions.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</label>
				</section>

				<section className="space-y-3">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-ud-text-muted">
						{t("Download Settings")}
					</h3>

					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Download Path")}</span>
						<div className="flex gap-2">
							<input
								type="text"
								readOnly
								value={form.download.path}
								className="w-full rounded-lg border border-ud-border bg-ud-muted px-3 py-2"
							/>
							<button
								type="button"
								onClick={() => void selectPath()}
								className="rounded-lg border border-ud-border px-3 py-2 text-sm hover:bg-ud-muted"
							>
								{t("Browse")}
							</button>
						</div>
					</label>

					<Toggle
						checked={form.download.autoStartDownload}
						label={t("Start pending downloads at startup")}
						onChange={(v) => updateDownload("autoStartDownload", v)}
					/>

					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Simultaneous course downloads")}</span>
						<input
							type="number"
							min={1}
							max={4}
							value={form.download.maxConcurrentDownloads}
							onChange={(e) =>
								updateDownload("maxConcurrentDownloads", Number(e.target.value) || 1)
							}
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						/>
					</label>

					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Bandwidth limit")}</span>
						<p className="text-xs text-ud-text-muted">{t("0 = unlimited. Value in KB/s.")}</p>
						<input
							type="number"
							min={0}
							step={64}
							value={form.download.bandwidthLimitKbps}
							onChange={(e) =>
								updateDownload("bandwidthLimitKbps", Math.max(0, Number(e.target.value) || 0))
							}
							placeholder="0"
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						/>
						<div className="flex flex-wrap gap-2 pt-1">
							{(
								[
									{ label: t("Unlimited"), value: 0 },
									{ label: "512 KB/s", value: 512 },
									{ label: "1 MB/s", value: 1024 },
									{ label: "2 MB/s", value: 2048 },
									{ label: "5 MB/s", value: 5120 },
								] as const
							).map((preset) => (
								<button
									key={preset.label}
									type="button"
									onClick={() => updateDownload("bandwidthLimitKbps", preset.value)}
									className={[
										"rounded-lg border px-2.5 py-1 text-xs",
										form.download.bandwidthLimitKbps === preset.value
											? "border-ud-accent bg-ud-accent/15 text-ud-accent-hover"
											: "border-ud-border hover:bg-ud-muted",
									].join(" ")}
								>
									{preset.label}
								</button>
							))}
						</div>
					</label>

					<div className="space-y-2">
						<p className="text-sm text-ud-text-muted">{t("Folder layout")}</p>
						{(
							[
								{
									value: "course" as const,
									title: t("Course / numbered chapters"),
									hint: t("Example: CourseName/01 Chapter/…"),
								},
								{
									value: "instructor" as const,
									title: t("By instructor"),
									hint: t("Example: Instructor/CourseName/…"),
								},
							] as const
						).map((opt) => (
							<label
								key={opt.value}
								className={[
									"flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm",
									form.download.folderLayout === opt.value
										? "border-ud-accent bg-ud-accent/10"
										: "border-ud-border bg-ud-elevated",
								].join(" ")}
							>
								<span className="flex items-center gap-2 font-medium">
									<input
										type="radio"
										name="folderLayout"
										checked={form.download.folderLayout === opt.value}
										onChange={() => updateDownload("folderLayout", opt.value)}
									/>
									{opt.title}
								</span>
								<span className="pl-6 text-xs text-ud-text-muted">{opt.hint}</span>
							</label>
						))}
					</div>

					<Toggle
						checked={form.download.skipExistingFiles}
						label={t("Skip files that already exist")}
						onChange={(v) => updateDownload("skipExistingFiles", v)}
					/>
					<Toggle
						checked={form.notificationsEnabled}
						label={t("Desktop notifications")}
						onChange={(v) => {
							setForm((prev) => (prev ? { ...prev, notificationsEnabled: v } : prev));
							setSaved(false);
						}}
					/>
					<Toggle
						checked={form.download.exportIndexOnComplete}
						label={t("Export course index on complete")}
						onChange={(v) => updateDownload("exportIndexOnComplete", v)}
					/>
					<Toggle
						checked={form.download.continueDonwloadingEncrypted}
						label={t("Skip lessons Blocked by DRM encryption while downloading")}
						onChange={(v) => updateDownload("continueDonwloadingEncrypted", v)}
					/>
					<Toggle
						checked={form.download.enableDownloadStartEnd}
						label={t("Enable Download Start/End")}
						onChange={(v) => updateDownload("enableDownloadStartEnd", v)}
					/>

					{form.download.enableDownloadStartEnd && (
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block space-y-1.5 text-sm">
								<span className="text-ud-text-muted">{t("Download Start")}</span>
								<input
									type="number"
									min={1}
									value={form.download.downloadStart || ""}
									placeholder={t("Start Download at")}
									onChange={(e) =>
										updateDownload("downloadStart", Number(e.target.value) || 0)
									}
									className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
								/>
							</label>
							<label className="block space-y-1.5 text-sm">
								<span className="text-ud-text-muted">{t("Download End")}</span>
								<input
									type="number"
									min={1}
									value={form.download.downloadEnd || ""}
									placeholder={t("End Download at")}
									onChange={(e) =>
										updateDownload("downloadEnd", Number(e.target.value) || 0)
									}
									className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
								/>
							</label>
						</div>
					)}

					<label className="block space-y-1.5 text-sm">
						<span className="text-ud-text-muted">{t("Video Quality")}</span>
						<p className="text-xs text-ud-text-muted">
							{t(
								"Note: When the selected option is not available in the Udemy API, the highest quality available will be downloaded."
							)}
						</p>
						<select
							value={form.download.videoQuality}
							onChange={(e) => updateDownload("videoQuality", e.target.value)}
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						>
							{VIDEO_QUALITIES.map((q) => (
								<option key={q} value={q}>
									{q === "Auto" || q === "Highest" || q === "Lowest" ? t(q) : `${q}p`}
								</option>
							))}
						</select>
					</label>

					<div className="space-y-2">
						<p className="text-sm font-medium">{t("What to download")}</p>
						<p className="text-xs text-ud-text-muted">
							{t("Choose videos, attachments, subtitles, or a combination")}
						</p>
						{(
							[
								{
									value: 0,
									title: t("Lectures and Attachments"),
									hint: t("Videos plus supplementary files"),
								},
								{
									value: 1,
									title: t("Videos only"),
									hint: t("Skip attachments; subtitles follow the toggle below"),
								},
								{
									value: 2,
									title: t("Attachments only"),
									hint: t("Skip videos; save articles and files"),
								},
								{
									value: 3,
									title: t("Subtitles only"),
									hint: t("Download .srt files without videos or attachments"),
								},
							] as const
						).map((opt) => (
							<label
								key={opt.value}
								className={[
									"flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm",
									form.download.type === opt.value
										? "border-ud-accent bg-ud-accent/10"
										: "border-ud-border bg-ud-elevated",
								].join(" ")}
							>
								<span className="flex items-center gap-2 font-medium">
									<input
										type="radio"
										name="downloadType"
										checked={form.download.type === opt.value}
										onChange={() => {
											updateDownload("type", opt.value);
											if (opt.value === 3) updateDownload("skipSubtitles", false);
										}}
									/>
									{opt.title}
								</span>
								<span className="pl-6 text-xs text-ud-text-muted">{opt.hint}</span>
							</label>
						))}
					</div>

					<Toggle
						checked={form.download.skipSubtitles}
						label={t("Skip Subtitles")}
						onChange={(v) => updateDownload("skipSubtitles", v)}
					/>
					<Toggle
						checked={form.download.seqZeroLeft}
						label={t("Number chapters and lectures (01, 02…)")}
						onChange={(v) => updateDownload("seqZeroLeft", v)}
					/>
					<Toggle
						checked={form.download.autoRetry}
						label={t("Auto Retry on Error (Experimental)")}
						onChange={(v) => updateDownload("autoRetry", v)}
					/>
				</section>

				<div className="flex items-center gap-3">
					<button
						type="submit"
						className="rounded-lg bg-ud-accent px-4 py-2 text-sm font-medium text-white hover:bg-ud-accent-hover"
					>
						{t("Save")}
					</button>
					{saved && <span className="text-sm text-ud-ok">{t("Saved")}</span>}
				</div>
			</form>

			<details className="rounded-xl border border-ud-border bg-ud-elevated open:pb-4">
				<summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("About")}</summary>
				<div className="px-4">
					<AboutPage embedded />
				</div>
			</details>
		</div>
	);
}
