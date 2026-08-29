import { useState, type FormEvent } from "react";
import type { SessionUser } from "../../shared/udeler.d.ts";
import logoUrl from "../assets/logo.png";
import { useI18n } from "../hooks/useI18n";
import { getUdeler } from "../hooks/useUdeler";

interface LoginPageProps {
	onLoggedIn: (user: SessionUser) => void;
	onBusy: (busy: boolean, message?: string) => void;
}

export function LoginPage({ onLoggedIn, onBusy }: LoginPageProps) {
	const { t } = useI18n();
	const [business, setBusiness] = useState(false);
	const [subdomain, setSubdomain] = useState("");
	const [showTokenPanel, setShowTokenPanel] = useState(false);
	const [accessToken, setAccessToken] = useState("");
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");

	const api = getUdeler();
	const helpUrl = api?.env?.urlHelp || "";

	const resolveSubdomain = (requireBusinessName: boolean): string | null => {
		if (!business) return "www";
		const value = subdomain.trim();
		if (!value) {
			if (requireBusinessName) {
				setError(t("Type Business Name"));
			}
			return null;
		}
		return value;
	};

	const finishSession = async (token: string, sub: string) => {
		if (!api) return;
		onBusy(true, t("Logging in"));
		setStatus(t("Logging in"));
		setError("");
		try {
			const user = await api.auth.loginWithToken(token, sub);
			if (!user) {
				setError(t("Login failed"));
				setStatus("");
				return;
			}
			onLoggedIn(user);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			setStatus("");
		} finally {
			onBusy(false);
		}
	};

	const loginWithUdemy = async () => {
		if (!api) return;
		const sub = resolveSubdomain(true);
		if (!sub) return;

		onBusy(true, t("Logging in"));
		setStatus(t("Logging in"));
		setError("");
		try {
			api.settings.save({ subDomain: sub });
			const session = await api.auth.openUdemyLogin({ subdomain: sub });
			if (!session?.accessToken) {
				setStatus("");
				onBusy(false);
				return;
			}
			await finishSession(session.accessToken, session.subDomain || sub);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			setStatus("");
			onBusy(false);
		}
	};

	const loginWithToken = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!showTokenPanel) {
			setShowTokenPanel(true);
			return;
		}
		const sub = resolveSubdomain(true);
		if (!sub) return;
		const token = accessToken.trim();
		if (!token) {
			setError(t("Access Token"));
			return;
		}
		await finishSession(token, sub);
	};

	const openHelp = async () => {
		if (!helpUrl || !api) return;
		await api.shell.openExternal(helpUrl);
	};

	return (
		<div className="flex min-h-full items-center justify-center px-4 py-10">
			<div className="w-full max-w-md rounded-2xl border border-ud-border bg-ud-elevated p-8">
				<div className="mb-8 text-center">
					<img
						src={logoUrl}
						alt="CursoDown"
						className="mx-auto mb-4 h-14 w-14 object-contain"
					/>
					<h1 className="text-2xl font-semibold tracking-tight text-ud-text">CursoDown</h1>
					<p className="mt-2 text-sm text-ud-text-muted">
						{t("Sign in with your enrolled Udemy account")}
					</p>
				</div>

				<form className="space-y-4" onSubmit={(e) => void loginWithToken(e)}>
					<p className="text-xs font-medium uppercase tracking-wide text-ud-text-muted">
						{t("Choose Login Method")}
					</p>

					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={business}
							onChange={(e) => setBusiness(e.target.checked)}
							className="rounded border-ud-border"
						/>
						{t("Udemy Business")}
					</label>

					{business && (
						<div className="flex items-center gap-2">
							<input
								type="text"
								value={subdomain}
								onChange={(e) => setSubdomain(e.target.value)}
								placeholder={t("Udemy Business Name")}
								className="w-full rounded-lg border border-ud-border bg-ud-muted px-3 py-2 text-sm outline-none focus:border-ud-accent"
							/>
							<span className="shrink-0 text-xs text-ud-text-muted">.udemy.com</span>
						</div>
					)}

					<button
						type="button"
						onClick={() => void loginWithUdemy()}
						className="w-full rounded-lg bg-ud-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-ud-accent-hover"
					>
						{t("Get Credentials")}
					</button>

					<button
						type="button"
						onClick={() => void loginWithToken()}
						className="w-full rounded-lg border border-ud-border bg-ud-muted px-4 py-2.5 text-sm font-medium hover:bg-ud-border/40"
					>
						{t("Access Token")}
					</button>

					{showTokenPanel && (
						<div className="space-y-3 rounded-xl border border-ud-border bg-ud-bg p-4">
							<label className="block text-xs text-ud-text-muted" htmlFor="access-token-input">
								{t("Access Token")}
							</label>
							<textarea
								id="access-token-input"
								rows={4}
								spellCheck={false}
								value={accessToken}
								onChange={(e) => setAccessToken(e.target.value)}
								placeholder={t("Access Token")}
								className="w-full resize-y rounded-lg border border-ud-border bg-ud-muted px-3 py-2 font-mono text-xs outline-none focus:border-ud-accent"
							/>
							<button
								type="submit"
								className="w-full rounded-lg bg-ud-accent px-4 py-2 text-sm font-medium text-white hover:bg-ud-accent-hover"
							>
								{t("Login")}
							</button>
						</div>
					)}

					{status && <p className="text-center text-sm text-ud-accent">{status}</p>}
					{error && <p className="text-center text-sm text-ud-danger">{error}</p>}

					{helpUrl && (
						<button
							type="button"
							onClick={() => void openHelp()}
							className="w-full text-center text-xs text-ud-accent hover:underline"
						>
							{t("How to get an Access Token")}
						</button>
					)}
				</form>
			</div>
		</div>
	);
}
