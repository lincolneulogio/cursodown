import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AppSettingsSnapshot } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

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

function SectionCard({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-2xl border border-ud-border bg-ud-elevated">
			<header className="border-b border-ud-border bg-ud-muted/40 px-5 py-4">
				<h3 className="text-sm font-semibold tracking-tight text-ud-text">{title}</h3>
				{description ? <p className="mt-1 text-xs text-ud-text-muted">{description}</p> : null}
			</header>
			<div className="space-y-4 p-5">{children}</div>
		</section>
	);
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
	return (
		<div className="space-y-1">
			<p className="text-sm font-medium text-ud-text">{children}</p>
			{hint ? <p className="text-xs leading-relaxed text-ud-text-muted">{hint}</p> : null}
		</div>
	);
}

function ToggleRow({
	checked,
	label,
	hint,
	onChange,
}: {
	checked: boolean;
	label: string;
	hint?: string;
	onChange: (value: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-ud-border/80 bg-ud-bg/40 px-3.5 py-3 transition-colors hover:border-ud-accent/30 hover:bg-ud-accent-soft/40">
			<span className="min-w-0 space-y-0.5">
				<span className="block text-sm font-medium text-ud-text">{label}</span>
				{hint ? <span className="block text-xs text-ud-text-muted">{hint}</span> : null}
			</span>
			<span
				className={[
					"relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
					checked ? "bg-ud-accent" : "bg-ud-border",
				].join(" ")}
				aria-hidden
			>
				<span
					className={[
						"absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
						checked ? "translate-x-5" : "translate-x-0",
					].join(" ")}
				/>
			</span>
			<input
				type="checkbox"
				className="sr-only"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
		</label>
	);
}

function ChoiceCard<T extends string | number>({
	name,
	value,
	selected,
	title,
	hint,
	onSelect,
}: {
	name: string;
	value: T;
	selected: boolean;
	title: string;
	hint?: string;
	onSelect: (value: T) => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			onClick={() => onSelect(value)}
			className={[
				"w-full rounded-xl border px-3.5 py-3 text-left transition-all",
				selected
					? "border-ud-accent bg-ud-accent-soft ring-1 ring-ud-accent/30"
					: "border-ud-border bg-ud-bg/30 hover:border-ud-accent/40 hover:bg-ud-muted/50",
			].join(" ")}
		>
			<span className="flex items-start gap-3">
				<span
					className={[
						"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
						selected ? "border-ud-accent" : "border-ud-border",
					].join(" ")}
				>
					{selected ? <span className="h-2 w-2 rounded-full bg-ud-accent" /> : null}
				</span>
				<span className="min-w-0">
					<span className="block text-sm font-medium text-ud-text">{title}</span>
					{hint ? <span className="mt-0.5 block text-xs text-ud-text-muted">{hint}</span> : null}
				</span>
			</span>
			<input type="radio" name={name} className="sr-only" checked={selected} readOnly />
		</button>
	);
}

function SegmentedControl<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
}) {
	return (
		<div className="inline-flex w-full rounded-xl border border-ud-border bg-ud-muted/60 p-1 sm:w-auto">
			{options.map((opt) => {
				const active = value === opt.value;
				return (
					<button
						key={opt.value}
						type="button"
						onClick={() => onChange(opt.value)}
						className={[
							"flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-none",
							active
								? "bg-ud-accent text-white"
								: "text-ud-text-muted hover:bg-ud-elevated hover:text-ud-text",
						].join(" ")}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

const inputClass =
	"w-full rounded-xl border border-ud-border bg-ud-bg/50 px-3.5 py-2.5 text-sm text-ud-text outline-none transition-colors placeholder:text-ud-text-muted/70 focus:border-ud-accent focus:bg-ud-elevated focus:ring-2 focus:ring-ud-ring";

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
		return (
			<div className="flex h-40 items-center justify-center text-sm text-ud-text-muted">
				{t("Loading")}
			</div>
		);
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

	const checkUpdates = () => {
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
							? t("Update is still being published. Try again in a few minutes.")
							: status.error === "UPDATE_CHECKSUM"
								? t(
										"Update file is incomplete. Download the installer from the Releases page."
									)
								: status.error === "UPDATE_NETWORK"
									? t("Could not check for updates. Check your connection.")
									: status.error;
					api.notify.show(t("Updates"), msg);
				}
			})
			.finally(() => onBusy(false));
	};

	const appVersion = getUdeler()?.env.appVersion || "";
	const isPackage = Boolean(getUdeler()?.env.isPackage);

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<header className="space-y-1">
				<h2 className="text-2xl font-semibold tracking-tight text-ud-text">{t("Settings")}</h2>
				<p className="text-sm text-ud-text-muted">
					{t("Application Settings")} · v{appVersion}
					{!isPackage ? ` · ${t("Dev mode — updates disabled")}` : ""}
				</p>
			</header>

			<form className="space-y-5" onSubmit={onSubmit}>
				<SectionCard
					title={t("Appearance")}
					description={t("Theme, density and language for the interface")}
				>
					<div className="space-y-3">
						<FieldLabel>{t("Theme")}</FieldLabel>
						<SegmentedControl
							value={form.theme}
							onChange={onThemeChange}
							options={[
								{ value: "light", label: t("Light") },
								{ value: "dark", label: t("Dark") },
							]}
						/>
					</div>

					<div className="space-y-2">
						<FieldLabel hint={t("Press ? for keyboard shortcuts")}>{t("UI density")}</FieldLabel>
						<div className="grid gap-2 sm:grid-cols-2">
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
								<ChoiceCard
									key={opt.value}
									name="uiDensity"
									value={opt.value}
									selected={form.uiDensity === opt.value}
									title={opt.title}
									hint={opt.hint}
									onSelect={onDensityChange}
								/>
							))}
						</div>
					</div>

					<label className="block space-y-2">
						<FieldLabel>{t("Language (Requires App Restart)")}</FieldLabel>
						<select
							value={form.language}
							onChange={(e) => {
								setForm((prev) =>
									prev ? { ...prev, language: e.target.value } : prev
								);
								setSaved(false);
							}}
							className={inputClass}
						>
							{languageOptions.map((lang) => (
								<option key={lang} value={lang}>
									{lang}
								</option>
							))}
						</select>
					</label>
				</SectionCard>

				<SectionCard title={t("Updates")}>
					<ToggleRow
						checked={form.download.checkNewVersion}
						label={t("Check for a new version on startup")}
						onChange={(v) => updateDownload("checkNewVersion", v)}
					/>
					<div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-ud-border bg-ud-bg/30 px-4 py-3">
						<button
							type="button"
							onClick={checkUpdates}
							className="rounded-xl border border-ud-accent/40 bg-ud-accent-soft px-3.5 py-2 text-sm font-medium text-ud-accent hover:bg-ud-accent hover:text-white"
						>
							{t("Check for updates now")}
						</button>
						<span className="text-xs text-ud-text-muted">
							{t("Current version")}: v{appVersion}
						</span>
					</div>
				</SectionCard>

				<SectionCard
					title={t("Download Settings")}
					description={t("Path, quality, bandwidth and folder structure")}
				>
					<div className="space-y-2">
						<FieldLabel>{t("Download Path")}</FieldLabel>
						<div className="flex gap-2">
							<input
								type="text"
								readOnly
								value={form.download.path}
								className={`${inputClass} bg-ud-muted/60`}
							/>
							<button
								type="button"
								onClick={() => void selectPath()}
								className="shrink-0 rounded-xl border border-ud-border bg-ud-elevated px-4 py-2.5 text-sm font-medium hover:border-ud-accent/50 hover:bg-ud-accent-soft"
							>
								{t("Browse")}
							</button>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block space-y-2">
							<FieldLabel>{t("Simultaneous course downloads")}</FieldLabel>
							<input
								type="number"
								min={1}
								max={4}
								value={form.download.maxConcurrentDownloads}
								onChange={(e) =>
									updateDownload("maxConcurrentDownloads", Number(e.target.value) || 1)
								}
								className={inputClass}
							/>
						</label>
						<label className="block space-y-2">
							<FieldLabel>{t("Default Subtitle for download")}</FieldLabel>
							<select
								value={form.download.defaultSubtitle}
								onChange={(e) => updateDownload("defaultSubtitle", e.target.value)}
								className={inputClass}
							>
								<option value="">{t("None")}</option>
								{languageOptions.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="space-y-2">
						<FieldLabel hint={t("0 = unlimited. Value in KB/s.")}>
							{t("Bandwidth limit")}
						</FieldLabel>
						<input
							type="number"
							min={0}
							step={64}
							value={form.download.bandwidthLimitKbps}
							onChange={(e) =>
								updateDownload("bandwidthLimitKbps", Math.max(0, Number(e.target.value) || 0))
							}
							placeholder="0"
							className={inputClass}
						/>
						<div className="flex flex-wrap gap-2">
							{(
								[
									{ label: t("Unlimited"), value: 0 },
									{ label: "512 KB/s", value: 512 },
									{ label: "1 MB/s", value: 1024 },
									{ label: "2 MB/s", value: 2048 },
									{ label: "5 MB/s", value: 5120 },
								] as const
							).map((preset) => {
								const active = form.download.bandwidthLimitKbps === preset.value;
								return (
									<button
										key={preset.label}
										type="button"
										onClick={() => updateDownload("bandwidthLimitKbps", preset.value)}
										className={[
											"rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
											active
												? "border-ud-accent bg-ud-accent text-white"
												: "border-ud-border text-ud-text-muted hover:border-ud-accent/40 hover:text-ud-text",
										].join(" ")}
									>
										{preset.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="space-y-2">
						<FieldLabel>{t("Folder layout")}</FieldLabel>
						<div className="grid gap-2 sm:grid-cols-2">
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
								<ChoiceCard
									key={opt.value}
									name="folderLayout"
									value={opt.value}
									selected={form.download.folderLayout === opt.value}
									title={opt.title}
									hint={opt.hint}
									onSelect={(v) => updateDownload("folderLayout", v)}
								/>
							))}
						</div>
					</div>

					<label className="block space-y-2">
						<FieldLabel
							hint={t(
								"Note: When the selected option is not available in the Udemy API, the highest quality available will be downloaded."
							)}
						>
							{t("Video Quality")}
						</FieldLabel>
						<select
							value={form.download.videoQuality}
							onChange={(e) => updateDownload("videoQuality", e.target.value)}
							className={inputClass}
						>
							{VIDEO_QUALITIES.map((q) => (
								<option key={q} value={q}>
									{q === "Auto" || q === "Highest" || q === "Lowest" ? t(q) : `${q}p`}
								</option>
							))}
						</select>
					</label>

					<div className="space-y-2">
						<FieldLabel hint={t("Choose videos, attachments, subtitles, or a combination")}>
							{t("What to download")}
						</FieldLabel>
						<div className="grid gap-2">
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
								<ChoiceCard
									key={opt.value}
									name="downloadType"
									value={opt.value}
									selected={form.download.type === opt.value}
									title={opt.title}
									hint={opt.hint}
									onSelect={(v) => {
										updateDownload("type", v);
										if (v === 3) updateDownload("skipSubtitles", false);
									}}
								/>
							))}
						</div>
					</div>
				</SectionCard>

				<SectionCard title={t("Download behavior")}>
					<div className="space-y-2">
						<ToggleRow
							checked={form.download.autoStartDownload}
							label={t("Start pending downloads at startup")}
							onChange={(v) => updateDownload("autoStartDownload", v)}
						/>
						<ToggleRow
							checked={form.download.skipExistingFiles}
							label={t("Skip files that already exist")}
							onChange={(v) => updateDownload("skipExistingFiles", v)}
						/>
						<ToggleRow
							checked={form.notificationsEnabled}
							label={t("Desktop notifications")}
							onChange={(v) => {
								setForm((prev) => (prev ? { ...prev, notificationsEnabled: v } : prev));
								setSaved(false);
							}}
						/>
						<ToggleRow
							checked={form.download.exportIndexOnComplete}
							label={t("Export course index on complete")}
							onChange={(v) => updateDownload("exportIndexOnComplete", v)}
						/>
						<ToggleRow
							checked={form.download.continueDonwloadingEncrypted}
							label={t("Skip lessons Blocked by DRM encryption while downloading")}
							onChange={(v) => updateDownload("continueDonwloadingEncrypted", v)}
						/>
						<ToggleRow
							checked={form.download.skipSubtitles}
							label={t("Skip Subtitles")}
							onChange={(v) => updateDownload("skipSubtitles", v)}
						/>
						<ToggleRow
							checked={form.download.seqZeroLeft}
							label={t("Number chapters and lectures (01, 02…)")}
							onChange={(v) => updateDownload("seqZeroLeft", v)}
						/>
						<ToggleRow
							checked={form.download.autoRetry}
							label={t("Auto Retry on Error (Experimental)")}
							onChange={(v) => updateDownload("autoRetry", v)}
						/>
						<ToggleRow
							checked={form.download.enableDownloadStartEnd}
							label={t("Enable Download Start/End")}
							onChange={(v) => updateDownload("enableDownloadStartEnd", v)}
						/>
					</div>

					{form.download.enableDownloadStartEnd && (
						<div className="grid gap-3 rounded-xl border border-ud-accent/25 bg-ud-accent-soft/50 p-4 sm:grid-cols-2">
							<label className="block space-y-2">
								<FieldLabel>{t("Download Start")}</FieldLabel>
								<input
									type="number"
									min={1}
									value={form.download.downloadStart || ""}
									placeholder={t("Start Download at")}
									onChange={(e) =>
										updateDownload("downloadStart", Number(e.target.value) || 0)
									}
									className={inputClass}
								/>
							</label>
							<label className="block space-y-2">
								<FieldLabel>{t("Download End")}</FieldLabel>
								<input
									type="number"
									min={1}
									value={form.download.downloadEnd || ""}
									placeholder={t("End Download at")}
									onChange={(e) =>
										updateDownload("downloadEnd", Number(e.target.value) || 0)
									}
									className={inputClass}
								/>
							</label>
						</div>
					)}
				</SectionCard>

				<div className="sticky bottom-0 z-10 -mx-1 border-t border-ud-border bg-ud-elevated/95 px-1 py-3 backdrop-blur-md">
					<div className="flex items-center justify-between gap-3">
						<span className="text-xs text-ud-text-muted sm:text-sm">
							{saved ? (
								<span className="font-medium text-ud-ok">{t("Saved")}</span>
							) : (
								t("Save your changes when ready")
							)}
						</span>
						<button
							type="submit"
							className="rounded-xl bg-ud-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-ud-accent-hover"
						>
							{t("Save")}
						</button>
					</div>
				</div>
			</form>

			<details className="group overflow-hidden rounded-2xl border border-ud-border bg-ud-elevated">
				<summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ud-text marker:content-none [&::-webkit-details-marker]:hidden">
					<span className="flex items-center justify-between gap-2">
						{t("About")}
						<span className="text-xs font-normal text-ud-text-muted group-open:hidden">
							CursoDown
						</span>
					</span>
				</summary>
				<div className="space-y-2 border-t border-ud-border px-5 py-4 text-sm text-ud-text-muted">
					<p className="font-medium text-ud-text">CursoDown v{getUdeler()?.env?.appVersion || "—"}</p>
					<p>
						Electron {getUdeler()?.versions.electron} · Chrome {getUdeler()?.versions.chrome} · Node{" "}
						{getUdeler()?.versions.node}
					</p>
				</div>
			</details>
		</div>
	);
}
