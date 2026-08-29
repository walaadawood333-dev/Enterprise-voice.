/** Offset for the fixed pill navigation when jumping to a section. */
export const NAV_OFFSET = 96;

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
  window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  if (window.history.replaceState) {
    window.history.replaceState(null, "", `#${id}`);
  }
  return true;
}
