import type { NavSection, SessionUser } from "../../shared/udeler.d.ts";
import logoUrl from "../assets/logo.png";
import { useI18n } from "../hooks/useI18n";

interface QueueStatus {
	running: number;
	pending: number;
	concurrency: number;
}

interface SidebarProps {
	active: NavSection;
	user: SessionUser | null;
	queue: QueueStatus;
	onNavigate: (section: NavSection) => void;
	onLogout: () => void;
}

const NAV_ITEMS: Array<{ id: NavSection; labelKey: string }> = [
	{ id: "courses", labelKey: "Courses" },
	{ id: "library", labelKey: "Library" },
	{ id: "settings", labelKey: "Settings" },
	{ id: "logger", labelKey: "Logger" },
];

export function Sidebar({ active, user, queue, onNavigate, onLogout }: SidebarProps) {
	const { t } = useI18n();
	const queueTotal = queue.running + queue.pending;

	return (
		<aside className="flex h-full w-56 shrink-0 flex-col border-r border-ud-border bg-ud-sidebar text-white">
			<div className="flex items-center gap-3 px-4 py-5">
				<img src={logoUrl} alt="CursoDown" className="h-9 w-9 object-contain" />
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold tracking-wide">CursoDown</p>
					<p className="truncate text-xs text-white/50">{t("Desktop")}</p>
				</div>
			</div>

			<nav className="flex flex-1 flex-col gap-1 px-2">
				{NAV_ITEMS.map((item) => {
					const isActive = active === item.id;
					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onNavigate(item.id)}
							className={[
								"rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
								isActive
									? "bg-ud-accent text-white"
									: "text-white/70 hover:bg-white/10 hover:text-white",
							].join(" ")}
						>
							{t(item.labelKey)}
						</button>
					);
				})}
			</nav>

			<div className="mt-auto space-y-3 border-t border-white/10 px-3 py-4">
				{queueTotal > 0 && (
					<div className="rounded-full bg-ud-accent/20 px-3 py-1.5 text-center text-xs text-ud-accent-hover">
						{t("Queue")}: {queue.running}/{queue.concurrency} · {queue.pending} {t("pending")}
					</div>
				)}

				{user && (
					<div className="flex items-center gap-2.5">
						{user.image ? (
							<img
								src={user.image}
								alt=""
								className="h-8 w-8 rounded-full object-cover bg-white/10"
							/>
						) : (
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs">
								{(user.name || "?").slice(0, 1).toUpperCase()}
							</div>
						)}
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">{user.name}</p>
							{user.email && (
								<p className="truncate text-xs text-white/50">{user.email}</p>
							)}
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={onLogout}
					className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/15"
				>
					{t("Logout")}
				</button>
			</div>
		</aside>
	);
}
