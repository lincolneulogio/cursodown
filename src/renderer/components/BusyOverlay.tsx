import { useI18n } from "../hooks/useI18n";

interface BusyOverlayProps {
	visible: boolean;
	message?: string;
}

export function BusyOverlay({ visible, message }: BusyOverlayProps) {
	const { t } = useI18n();

	if (!visible) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<div className="flex flex-col items-center gap-3 rounded-2xl border border-ud-border bg-ud-elevated px-8 py-6 shadow-xl">
				<div
					className="h-10 w-10 animate-spin rounded-full border-2 border-ud-accent border-t-transparent"
					aria-hidden
				/>
				<p className="text-sm text-ud-text-muted">{message || t("Loading")}</p>
			</div>
		</div>
	);
}
