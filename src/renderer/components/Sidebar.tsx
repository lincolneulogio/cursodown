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

const NAV_ITEMS: Array<{
	id: NavSection;
	labelKey: string;
	icon: "courses" | "library" | "dashboard" | "settings" | "logger";
}> = [
	{ id: "courses", labelKey: "Courses", icon: "courses" },
	{ id: "library", labelKey: "Library", icon: "library" },
	{ id: "dashboard", labelKey: "Dashboard", icon: "dashboard" },
	{ id: "settings", labelKey: "Settings", icon: "settings" },
	{ id: "logger", labelKey: "Logger", icon: "logger" },
];

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]["icon"] }) {
	const common = "h-[18px] w-[18px] shrink-0";

	switch (name) {
		case "courses":
			return (
				<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
					<rect x="3" y="5" width="14" height="14" rx="2" />
					<path d="M17 9l4-2v10l-4-2" />
				</svg>
			);
		case "library":
			return (
				<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
					<path d="M4 6h5v14H4zM10 4h5v16h-5zM16 8h4v12h-4z" />
				</svg>
			);
		case "dashboard":
			return (
				<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
					<path d="M4 13h7V4H4v9zm9 7h7V4h-7v16zM4 20h7v-5H4v5z" />
				</svg>
			);
		case "settings":
			return (
				<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
					<circle cx="12" cy="12" r="3" />
					<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
				</svg>
			);
		case "logger":
			return (
				<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
					<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
				</svg>
			);
	}
}

function LogoutIcon() {
	return (
		<svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
			<path d="M16 17l5-5-5-5M21 12H9" />
		</svg>
	);
}

function getUserLabel(user: SessionUser): string {
	const name = user.name?.trim();
	if (name) return name;
	const email = user.email?.trim();
	if (email) return email.split("@")[0] || email;
	return "Usuario";
}

function getUserInitials(user: SessionUser): string {
	const label = getUserLabel(user);
	const parts = label.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
	}
	return label.slice(0, 2).toUpperCase();
}

export function Sidebar({ active, user, queue, onNavigate, onLogout }: SidebarProps) {
	const { t } = useI18n();
	const queueTotal = queue.running + queue.pending;
	const displayName = user ? getUserLabel(user) : "";
	const initials = user ? getUserInitials(user) : "";

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
								"flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
								isActive
									? "bg-ud-accent text-white shadow-sm shadow-ud-accent/25"
									: "text-white/70 hover:bg-white/10 hover:text-white",
							].join(" ")}
						>
							<NavIcon name={item.icon} />
							<span className="truncate">{t(item.labelKey)}</span>
						</button>
					);
				})}
			</nav>

			<div className="mt-auto border-t border-white/10 p-3">
				{queueTotal > 0 && (
					<div className="mb-3 rounded-lg border border-ud-accent/20 bg-ud-accent/10 px-3 py-2 text-center text-xs text-ud-accent-hover">
						{t("Queue")}: {queue.running}/{queue.concurrency} · {queue.pending} {t("pending")}
					</div>
				)}

				{user && (
					<div className="mb-2 flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
						{user.image ? (
							<img
								src={user.image}
								alt=""
								className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white/10"
							/>
						) : (
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ud-accent/30 text-xs font-semibold text-white ring-2 ring-white/10">
								{initials}
							</div>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-white">{displayName}</p>
							{user.email && (
								<p className="truncate text-xs text-white/50">{user.email}</p>
							)}
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={onLogout}
					className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
				>
					<LogoutIcon />
					<span className="truncate">{t("Logout")}</span>
				</button>
			</div>
		</aside>
	);
}
