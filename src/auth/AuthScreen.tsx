import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CircleCheck, Loader2, ShieldCheck } from "lucide-react";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { api } from "@/api";
import { login, register, useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";

type Mode = "login" | "register";

const PASSWORD_MIN = 12;

const fieldBase =
  "w-full rounded-2xl border border-hair bg-white px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-black/25 hover:border-black/25 focus:border-black focus:outline-none";
const fieldBad = "border-red-300 bg-red-50/60 focus:border-red-500";

/**
 * CenterAI sign-in / sign-up. Same tokens as the public site: graphite panel, hairline fields,
 * Saira labels, no template chrome. All identity truth is server-validated; the client checks
 * only to give immediate feedback.
 */
export function AuthScreen({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, error, fields, busy, refresh } = useAuth();

  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === "register") void refresh(false);
  }, [mode, refresh]);

  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (session) navigate(from && from.startsWith("/studio") ? from : "/studio/overview", { replace: true });
  }, [session, navigate, location.state]);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setLocalErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const passwordChecks = useMemo(
    () => [
      { label: `${PASSWORD_MIN}+ characters`, ok: form.password.length >= PASSWORD_MIN },
      { label: "A letter and a number", ok: /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password) },
      {
        label: "Not your email address",
        ok:
          form.password.length > 0 &&
          (!form.email.includes("@") || !form.password.toLowerCase().includes(form.email.split("@")[0] ?? "@")),
      },
    ],
    [form.password, form.email]
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (mode === "register") {
      if (form.name.trim().length < 2) next.name = "Enter your full name.";
      if (form.organizationName.trim().length > 80) next.organizationName = "Keep the workspace name under 80 characters.";
      if (form.password.length < PASSWORD_MIN) next.password = `Use at least ${PASSWORD_MIN} characters.`;
      else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
        next.password = "Include at least one letter and one number.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!form.password) next.password = "Enter your password.";
    setLocalErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const ok =
      mode === "login"
        ? await login(form.email.trim(), form.password)
        : await register({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            organizationName: form.organizationName.trim(),
          });
    setSubmitting(false);
    if (ok) navigate("/studio/overview", { replace: true });
  };

  const serverError = error;
  const demoIdentity = api.transport === "local";

  return (
    <div className="grain relative min-h-dvh bg-mist text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:24px_24px]"
      />
      <div className="relative mx-auto grid min-h-dvh max-w-[1180px] items-stretch gap-0 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-10 lg:px-8 lg:py-10">
        {/* identity panel */}
        <section className="grain relative order-2 hidden flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-graphite p-8 text-white lg:order-1 lg:flex">
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-2 font-display text-[11px] font-bold tracking-[0.2em] text-white/45 uppercase transition-colors hover:text-white"
            >
              <ArrowLeft
                size={12}
                className="transition-transform duration-300 group-hover:-translate-x-0.5"
              />
              CenterAI
            </Link>
            <p className="mt-14 font-display text-[10px] font-bold tracking-[0.22em] text-white/40 uppercase">
              Agent Studio
            </p>
            <h1 className="mt-3 text-[2.6rem] leading-[1.02] font-medium tracking-tight">
              Your voice agents,
              <br />
              under your control.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/50">
              Configure agents, review sessions and meter usage against the CenterAI API foundation.
              Telephony, billing and call recording are separate phases — this workspace does not dial.
            </p>
          </div>

          <div className="space-y-6">
            <ul className="space-y-2.5 text-[13.5px] text-white/55">
              {[
                "Every read and write is scoped to your organization",
                "Passwords are hashed server-side; the browser never sees a secret",
                "Sessions are held in an httpOnly cookie, never in localStorage",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-white/35" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="h-14 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white/45">
              <VoiceBars count={54} intensity={0.32} className="h-full w-full" />
            </div>
          </div>
        </section>

        {/* form */}
        <section className="order-1 flex flex-col justify-center lg:order-2">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-ink px-1.5 text-white/90">
              <VoiceBars count={5} intensity={0.9} className="h-3 w-full" barClassName="min-w-[1.5px]" />
            </span>
            <span className="font-display text-[19px] leading-none font-bold tracking-tight">
              Center<span className="text-black/40">AI</span>
            </span>
            <span className="ms-1 rounded-full border border-hair px-2 py-0.5 font-display text-[9px] font-bold tracking-[0.16em] text-black/45 uppercase">
              Studio
            </span>
          </div>

          <div className="rounded-3xl border border-hair bg-white p-6 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.5)] sm:p-8">
            <h2 className="font-display text-[2rem] leading-none font-medium tracking-tight">
              {mode === "login" ? "Sign in" : "Create your workspace"}
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-black/50">
              {mode === "login"
                ? "Use the credentials you registered in this environment."
                : "Registration creates an organization, assigns you as owner and seeds one draft agent."}
            </p>

            {serverError ? (
              <p
                role="alert"
                className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-red-700"
              >
                {serverError}
              </p>
            ) : null}

            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              {mode === "register" ? (
                <>
                  <Field
                    id="auth-name"
                    label="Your name"
                    value={form.name}
                    onChange={set("name")}
                    error={localErrors.name ?? fields.name}
                    autoComplete="name"
                    placeholder="Rania Haddad"
                  />
                  <Field
                    id="auth-org"
                    label="Workspace name"
                    hint="optional"
                    value={form.organizationName}
                    onChange={set("organizationName")}
                    error={localErrors.organizationName ?? fields.organizationName}
                    placeholder="Haddad Retail Bank"
                  />
                </>
              ) : null}

              <Field
                id="auth-email"
                label="Work email"
                type="email"
                value={form.email}
                onChange={set("email")}
                error={localErrors.email ?? fields.email}
                autoComplete="email"
                placeholder="you@organisation.jo"
              />

              <Field
                id="auth-password"
                label="Password"
                type="password"
                value={form.password}
                onChange={set("password")}
                error={localErrors.password ?? fields.password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "••••••••••••" : `${PASSWORD_MIN}+ characters`}
              />

              {mode === "register" ? (
                <ul className="grid gap-1.5 rounded-2xl border border-hair bg-mist/60 px-4 py-3">
                  {passwordChecks.map((check) => (
                    <li
                      key={check.label}
                      className={cn(
                        "flex items-center gap-2 text-[12px] transition-colors duration-300",
                        check.ok ? "text-black/70" : "text-black/35"
                      )}
                    >
                      <CircleCheck
                        size={12}
                        className={cn("shrink-0", check.ok ? "text-black" : "text-black/25")}
                      />
                      {check.label}
                    </li>
                  ))}
                </ul>
              ) : null}

              <button
                type="submit"
                disabled={submitting || busy}
                className="btn-primary inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-display text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting || busy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {mode === "login" ? "Checking credentials…" : "Creating workspace…"}
                  </>
                ) : (
                  <>
                    {mode === "login" ? "Sign in" : "Create workspace"}
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-4 text-[12.5px]">
              <span className="text-black/45">
                {mode === "login" ? "No account yet?" : "Already have a workspace?"}
              </span>
              <Link
                to={mode === "login" ? "/register" : "/login"}
                className="font-semibold text-black/70 underline decoration-black/20 underline-offset-4 transition-colors hover:text-black"
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </Link>
            </div>
          </div>

          <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-black/40">
            {demoIdentity
              ? "Demo Mode: identity is held in memory for this browser tab only — a real, validated flow, but not a security boundary. Configure VITE_API_BASE_URL to use the server."
              : "Sessions are issued by the API as httpOnly cookies. Passwords are hashed server-side and never leave the server."}
          </p>
          <Link
            to="/"
            className="mt-2 inline-flex items-center gap-1.5 px-1 text-[11.5px] font-semibold text-black/40 transition-colors hover:text-black"
          >
            <ArrowLeft size={11} />
            Back to the public site
          </Link>
        </section>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="font-display text-[10px] font-bold tracking-[0.16em] text-black/55 uppercase"
        >
          {label}
        </label>
        {hint ? <span className="text-[11px] text-black/35">{hint}</span> : null}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldBase, error && fieldBad)}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[12px] font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LoginPage() {
  return <AuthScreen mode="login" />;
}

export function RegisterPage() {
  return <AuthScreen mode="register" />;
}
