import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { diagnosticsSnapshot, resolveVoiceMode, runApiSelfTest } from "@/api";

/**
 * Boot sequence
 * 1. mount the app (React replaces the pre-hydration skeleton inside #root)
 * 2. flag font readiness so fallback metrics don't cause a visible jump
 * 3. detect the backend (never blocks or breaks the UI)
 * 4. in development / on ?centerai=selftest, exercise the API routes end to end
 */
const container = document.getElementById("root");

/**
 * Studio deep links for static hosts.
 * `index.html#/studio/agents` is rewritten to the real path before the router mounts, so the
 * dashboard is reachable even where the host has no SPA rewrite rule. The marketing site's own
 * in-page anchors are untouched by this.
 */
if (typeof window !== "undefined" && window.location.hash.startsWith("#/studio")) {
  const target = window.location.hash.slice(1);
  if (target !== window.location.pathname) {
    window.history.replaceState(null, "", target + window.location.search);
  }
}

function flagFontsReady() {
  const done = () => document.documentElement.classList.add("fonts-ready");
  if (typeof document !== "undefined" && "fonts" in document) {
    document.fonts.ready.then(done).catch(done);
  } else {
    done();
  }
}

if (container) {
  try {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    container.querySelector("#boot")?.remove();
    flagFontsReady();
  } catch (error) {
    const boot = container.querySelector("#boot");
    if (boot) {
      boot.innerHTML =
        '<div style="max-width:32rem;text-align:center"><p style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#9ca3af">CenterAI</p><h1 style="font-size:28px;margin:.75rem 0">The app could not start</h1><p style="font-size:14px;color:#4b5563">Please refresh, or email hello@centerai.jo if this persists.</p></div>';
    }
    console.error("[CenterAI] fatal boot error", error);
  }
}

/* Backend detection is advisory: a failure simply leaves the demo engine in place. */
void resolveVoiceMode().catch(() => undefined);

const wantsSelfTest =
  import.meta.env.DEV ||
  new URLSearchParams(window.location.search).get("centerai") === "selftest";

if (wantsSelfTest) {
  window.setTimeout(() => {
    void runApiSelfTest()
      .then((result) => {
        const payload = { ...diagnosticsSnapshot(), selftest: result };
        (window as unknown as { __CENTERAI_DIAG__?: typeof payload }).__CENTERAI_DIAG__ = payload;
        const line = `[CenterAI] API self-test: ${result.passed} passed, ${result.failed} failed`;
        if (result.failed > 0) console.warn(line, result.checks.filter((c) => !c.ok));
        else console.info(line, "· window.__CENTERAI_DIAG__");
      })
      .catch((error) => {
        console.warn("[CenterAI] API self-test could not run", (error as Error)?.message);
      });
  }, 1200);
}

// Report unhandled failures once, without interrupting the running page.
let reported = false;
window.addEventListener("unhandledrejection", (event) => {
  if (reported) return;
  reported = true;
  console.error("[CenterAI] unhandled rejection", event.reason);
});
