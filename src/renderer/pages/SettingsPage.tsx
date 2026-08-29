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
}

interface SettingsFormState {
	language: string;
	theme: ThemeMode;
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
			maxConcurrentDownloads: asNumber(d.maxConcurrentDownloads, 2),
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
}

export function SettingsPage({ onBusy }: SettingsPageProps) {
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
				downloadPath: form.download.path,
				download: { ...form.download },
			});
			api.settings.setTheme(form.theme);
			applyTheme(form.theme);
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
					<Toggle
						checked={form.theme === "dark"}
						label={t("Dark mode")}
						onChange={(v) => onThemeChange(v ? "dark" : "light")}
					/>
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
							max={3}
							value={form.download.maxConcurrentDownloads}
							onChange={(e) =>
								updateDownload("maxConcurrentDownloads", Number(e.target.value) || 1)
							}
							className="w-full rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 outline-none focus:border-ud-accent"
						/>
					</label>

					<Toggle
						checked={form.download.skipExistingFiles}
						label={t("Skip files that already exist")}
						onChange={(v) => updateDownload("skipExistingFiles", v)}
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
						{(
							[
								{ value: 0, label: t("Download Lectures and Attachments") },
								{ value: 1, label: t("Download only Lectures") },
								{ value: 2, label: t("Download only Attachments") },
							] as const
						).map((opt) => (
							<label
								key={opt.value}
								className="flex items-center gap-2 rounded-lg border border-ud-border bg-ud-elevated px-3 py-2 text-sm"
							>
								<input
									type="radio"
									name="downloadType"
									checked={form.download.type === opt.value}
									onChange={() => updateDownload("type", opt.value)}
								/>
								{opt.label}
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
						label={t("Enumerate download with zero left")}
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
