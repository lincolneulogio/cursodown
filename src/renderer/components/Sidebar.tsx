import {
	IconBooks,
	IconLayoutDashboard,
	IconLogout,
	IconSettings,
	IconVideo,
} from "@tabler/icons-react";
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
	icon: typeof IconVideo;
}> = [
	{ id: "courses", labelKey: "Courses", icon: IconVideo },
	{ id: "library", labelKey: "Library", icon: IconBooks },
	{ id: "dashboard", labelKey: "Dashboard", icon: IconLayoutDashboard },
	{ id: "settings", labelKey: "Settings", icon: IconSettings },
];

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
		<aside className="flex h-full w-56 shrink-0 flex-col self-stretch overflow-y-auto border-r border-ud-border bg-ud-sidebar text-ud-sidebar-text">
			<div className="flex items-center gap-3 px-4 py-5">
				<img src={logoUrl} alt="CursoDown" className="h-9 w-9 object-contain" />
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold tracking-wide">CursoDown</p>
					<p className="truncate text-xs text-ud-sidebar-muted">{t("Desktop")}</p>
				</div>
			</div>

			<nav className="flex flex-1 flex-col gap-1 px-2">
				{NAV_ITEMS.map((item) => {
					const isActive = active === item.id;
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onNavigate(item.id)}
							className={[
								"flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
								isActive
									? "bg-ud-accent text-white"
									: "text-ud-sidebar-muted hover:bg-white/10 hover:text-ud-sidebar-text",
							].join(" ")}
						>
							<Icon size={18} stroke={1.75} aria-hidden />
							<span className="truncate">{t(item.labelKey)}</span>
						</button>
					);
				})}
			</nav>

			<div className="mt-auto border-t border-white/10 p-3">
				{queueTotal > 0 && (
					<div className="mb-3 rounded-lg border border-ud-accent/30 bg-ud-accent-soft px-3 py-2 text-center text-xs font-medium text-ud-accent-hover">
						{t("Queue")}: {queue.running}/{queue.concurrency} · {queue.pending} {t("pending")}
					</div>
				)}

				{user && (
					<div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
						{user.image ? (
							<img
								src={user.image}
								alt=""
								className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white/15"
							/>
						) : (
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ud-accent text-xs font-bold tracking-wide text-white ring-2 ring-white/20">
								{initials}
							</div>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-ud-sidebar-text">{displayName}</p>
							{user.email && (
								<p className="truncate text-xs text-ud-sidebar-muted">{user.email}</p>
							)}
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={onLogout}
					className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ud-sidebar-muted transition-colors hover:bg-rose-500/15 hover:text-rose-200"
				>
					<IconLogout size={18} stroke={1.75} aria-hidden />
					<span className="truncate">{t("Logout")}</span>
				</button>
			</div>
		</aside>
	);
}
