import logoUrl from "../assets/logo.png";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface AboutPageProps {
	embedded?: boolean;
}

const STACK = [
	"Next.js",
	"React",
	"TypeScript",
	"Tailwind CSS",
	"Astro",
	"Laravel",
	"PostgreSQL",
	"MySQL",
	"SQL Server",
	"SQLite",
	"Drizzle ORM",
	"Better Auth",
	"Node.js",
	"APIs REST",
	"Figma",
	"Photoshop",
	"CorelDRAW",
] as const;

export function AboutPage({ embedded = false }: AboutPageProps) {
	const { t } = useI18n();
	const api = getUdeler();
	const version = api?.env?.appVersion || "—";

	return (
		<div className={embedded ? "space-y-4" : "space-y-6"}>
			{!embedded && (
				<header>
					<h2 className="text-xl font-semibold">{t("About")}</h2>
				</header>
			)}

			<div className="flex flex-wrap items-center gap-4">
				<img src={logoUrl} alt="CursoDown" className="h-14 w-14 object-contain" />
				<div>
					<h3 className="text-lg font-semibold">CursoDown</h3>
					<p className="text-sm text-ud-text-muted">v{version}</p>
				</div>
			</div>

			<article className="space-y-3 rounded-xl border border-ud-border bg-ud-elevated p-4">
				<p className="text-xs uppercase tracking-wide text-ud-text-muted">
					{t("Product-oriented Full-Stack Developer")}
				</p>
				<h4 className="text-base font-semibold">Lincol Eulogio Huanca</h4>
				{[1, 2, 3, 4, 5].map((n) => (
					<p key={n} className="text-sm text-ud-text-muted">
						{t(`about.bio.${n}`)}
					</p>
				))}

				<h5 className="pt-2 text-sm font-semibold">{t("Stack")}</h5>
				<div className="flex flex-wrap gap-2">
					{STACK.map((tag) => (
						<span
							key={tag}
							className="rounded-md bg-ud-muted px-2 py-1 text-xs text-ud-text-muted"
						>
							{tag}
						</span>
					))}
				</div>
			</article>

			<p className="text-xs text-ud-text-muted">
				Electron {api?.versions.electron} · Chrome {api?.versions.chrome} · Node{" "}
				{api?.versions.node}
			</p>
		</div>
	);
}
