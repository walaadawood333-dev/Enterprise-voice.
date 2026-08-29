import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DemoDialog, LegalDialog } from "@/components/DemoDialog";

type UIContextValue = {
  /** @param source which CTA opened the dialog — surfaced in the request payload. */
  openDemo: (source?: string) => void;
  closeDemo: () => void;
  openLegal: (key: string) => void;
  demoOpen: boolean;
};

const UIContext = createContext<UIContextValue>({
  openDemo: () => {},
  closeDemo: () => {},
  openLegal: () => {},
  demoOpen: false,
});

export function UIProvider({ children }: { children: ReactNode }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoSource, setDemoSource] = useState("");
  const [legalKey, setLegalKey] = useState<string | null>(null);

  const openDemo = useCallback((source = "") => {
    setLegalKey(null);
    setDemoSource(source);
    setDemoOpen(true);
  }, []);

  const closeDemo = useCallback(() => {
    setDemoOpen(false);
    // Drop the #demo hook so a reload does not reopen the dialog.
    if (typeof window !== "undefined" && window.location.hash === "#demo") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const openLegal = useCallback((key: string) => {
    setDemoOpen(false);
    setLegalKey(key);
  }, []);

  // Deep link support: /#demo opens the flow (used by mailto and QR/print links).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      if (window.location.hash === "#demo") {
        setLegalKey(null);
        setDemoSource("deep link");
        setDemoOpen(true);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Lock background scrolling while any dialog is open.
  useEffect(() => {
    if (!demoOpen && !legalKey) return;
    const el = document.documentElement;
    el.classList.add("overflow-hidden");
    return () => el.classList.remove("overflow-hidden");
  }, [demoOpen, legalKey]);

  const value = useMemo(
    () => ({ openDemo, closeDemo, openLegal, demoOpen }),
    [openDemo, closeDemo, openLegal, demoOpen]
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <DemoDialog open={demoOpen} source={demoSource} onClose={closeDemo} />
      <LegalDialog legalKey={legalKey} onClose={() => setLegalKey(null)} />
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
