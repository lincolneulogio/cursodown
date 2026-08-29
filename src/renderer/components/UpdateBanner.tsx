import type { UpdateStatus } from "../../shared/udeler.d.ts";
import { useI18n } from "../hooks/useI18n";

interface UpdateBannerProps {
	status: UpdateStatus;
	onDownload: () => void;
	onInstall: () => void;
	onDismiss: () => void;
}

export function UpdateBanner({ status, onDownload, onInstall, onDismiss }: UpdateBannerProps) {
	const { t } = useI18n();
	const version = status.availableVersion || "";

	if (status.phase === "available") {
		return (
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-ud-accent/30 bg-ud-accent/10 px-4 py-2.5 text-sm">
				<p className="text-ud-text">
					{t("Update available")}: <span className="font-semibold">v{version}</span>
					<span className="text-ud-text-muted">
						{" "}
						({t("Current version")}: v{status.currentVersion})
					</span>
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={onDismiss}
						className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
					>
						{t("Later")}
					</button>
					<button
						type="button"
						onClick={onDownload}
						className="rounded-lg bg-ud-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-ud-accent-hover"
					>
						{t("Download update")}
					</button>
				</div>
			</div>
		);
	}

	if (status.phase === "downloading") {
		const pct = Math.round(status.percent || 0);
		return (
			<div className="space-y-1.5 border-b border-ud-border bg-ud-elevated px-4 py-2.5 text-sm">
				<div className="flex items-center justify-between gap-2">
					<p>
						{t("Downloading update")}
						{version ? ` v${version}` : ""}… {pct}%
					</p>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-ud-muted">
					<div
						className="h-full rounded-full bg-ud-accent transition-all"
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>
		);
	}

	if (status.phase === "downloaded") {
		return (
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm">
				<p>{t("Update ready to install")}</p>
				<button
					type="button"
					onClick={onInstall}
					className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
				>
					{t("Restart and install")}
				</button>
			</div>
		);
	}

	if (status.phase === "error" && status.error) {
		return (
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm">
				<p className="text-rose-200">
					{t("Update failed")}: {status.error}
				</p>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-lg border border-ud-border px-3 py-1.5 text-xs hover:bg-ud-muted"
				>
					{t("Dismiss")}
				</button>
			</div>
		);
	}

	return null;
}
