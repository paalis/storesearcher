"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { animateSpring, prefersReducedMotion, project, rubberband, type SpringHandle } from "@/lib/spring";

/**
 * Bunnark på mobil, sentrert dialog på større skjermer.
 *
 * Bevegelse etter Apples prinsipper:
 * - Arket glir opp og lukkes ned samme vei; dialogen skaleres inn og ut fra midten.
 * - Fjærer (kritisk dempet) som alltid starter fra nåverdien, så de kan avbrytes.
 * - Arket kan dras ned: følger fingeren 1:1, motstand oppover, og et kast nedover lukker
 *   (beslutningen tas fra prosjektert endepunkt, og hastigheten tas med inn i fjæra).
 * - Redusert bevegelse: kun en kort overtoning.
 *
 * `open=false` starter lukkeanimasjonen; `onExited` kalles når den er ferdig.
 */
export function Modal({
  open,
  onClose,
  onExited,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const spring = useRef<SpringHandle | null>(null);
  const value = useRef(0); // ark: y i px (0 = åpent). Dialog: fremdrift 0–1 (1 = åpent)
  const releaseVelocity = useRef(0);
  const mode = useRef<{ sheet: boolean; reduced: boolean }>({ sheet: false, reduced: false });
  const closeRef = useRef(onClose);
  const exitedRef = useRef(onExited);
  useEffect(() => {
    closeRef.current = onClose;
    exitedRef.current = onExited;
  });

  // Montér når den åpnes (lukking avmonterer først når animasjonen er ferdig)
  if (open && !mounted) setMounted(true);

  const height = () => panel.current?.offsetHeight ?? 600;

  /** Tegn nåverdien direkte på DOM-en (ingen React-render per bilde). */
  const render = (v: number) => {
    value.current = v;
    const p = panel.current;
    const s = scrim.current;
    if (!p || !s) return;
    const { sheet, reduced } = mode.current;
    if (reduced) {
      const o = sheet ? 1 - Math.min(Math.max(v / height(), 0), 1) : v;
      p.style.transform = sheet && v !== 0 && v !== height() ? `translate3d(0, ${v}px, 0)` : "";
      p.style.opacity = String(o);
      s.style.opacity = String(o);
    } else if (sheet) {
      p.style.transform = `translate3d(0, ${v}px, 0)`;
      s.style.opacity = String(1 - Math.min(Math.max(v / height(), 0), 1));
    } else {
      p.style.transform = `translate3d(0, ${(1 - v) * 8}px, 0) scale(${0.96 + 0.04 * v})`;
      p.style.opacity = String(Math.min(Math.max(v, 0), 1));
      s.style.opacity = String(Math.min(Math.max(v, 0), 1));
    }
  };

  /** Overtoning (redusert bevegelse på mobil). */
  const setOpacity = (o: number) => {
    if (panel.current) panel.current.style.opacity = String(o);
    if (scrim.current) scrim.current.style.opacity = String(o);
  };

  const springTo = (target: number, opts: { dampingRatio?: number; response?: number; velocity?: number }, done?: () => void) => {
    spring.current?.stop();
    spring.current = animateSpring(value.current, target, render, opts, done);
  };

  // Inn- og utgang
  useLayoutEffect(() => {
    if (!mounted) return;
    const sheet = window.matchMedia("(max-width: 639px)").matches;
    const reduced = prefersReducedMotion();
    if (open) {
      mode.current = { sheet, reduced };
      const closed = sheet ? height() : 0;
      // Start fra lukket posisjon første gang, ellers fra der den er (avbrutt lukking)
      if (!spring.current) render(sheet && reduced ? 0 : closed);
      if (sheet && reduced) {
        // Overtoning i stedet for å gli
        render(0);
        panel.current!.style.opacity = "0";
        scrim.current!.style.opacity = "0";
        spring.current = animateSpring(0, 1, setOpacity, { response: 0.25 });
      } else {
        springTo(sheet ? 0 : 1, { dampingRatio: 1, response: 0.35 });
      }
    } else {
      const done = () => {
        spring.current = null;
        setMounted(false);
        exitedRef.current?.();
      };
      if (mode.current.sheet && !mode.current.reduced) {
        // Samme vei ut som inn – og med hastigheten fra et eventuelt kast
        springTo(height(), { dampingRatio: 1, response: 0.3, velocity: releaseVelocity.current }, done);
      } else if (mode.current.sheet && mode.current.reduced) {
        spring.current?.stop();
        const from = Number(panel.current?.style.opacity || 1);
        spring.current = animateSpring(from, 0, setOpacity, { response: 0.2 }, done);
      } else {
        springTo(0, { dampingRatio: 1, response: mode.current.reduced ? 0.2 : 0.25 }, done);
      }
      releaseVelocity.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- styres av open/mounted
  }, [open, mounted]);

  useEffect(() => () => spring.current?.stop(), []);

  // Tastatur, scroll-lås og fokus
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    (panel.current?.querySelector<HTMLElement>("input:not(.sr-only), textarea, select") ??
      panel.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  /* ---------- Dra arket (kun mobil) ---------- */
  const drag = useRef<{ id: number; startY: number; startValue: number; active: boolean; history: { t: number; y: number }[] } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!mode.current.sheet || !open || (e.target as HTMLElement).closest("button")) return;
    // Grip arket der det er nå – også midt i en animasjon
    spring.current?.stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, startValue: value.current, active: false, history: [{ t: e.timeStamp, y: e.clientY }] };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.active && Math.abs(dy) < 6) return; // liten terskel før vi tolker det som et drag
    d.active = true;
    d.history.push({ t: e.timeStamp, y: e.clientY });
    while (d.history.length > 2 && e.timeStamp - d.history[0].t > 100) d.history.shift();
    const raw = d.startValue + dy;
    render(raw < 0 ? rubberband(raw, height()) : raw); // motstand oppover, 1:1 nedover
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (e.type === "pointercancel") {
      // Nettleseren tok over bevegelsen (f.eks. systemgest): tilbake til åpen, uten hastighet
      springTo(0, { dampingRatio: 1, response: 0.3 });
      return;
    }
    // Ta med slippunktet og bruk bare de siste 100 ms: holdes fingeren i ro før slipp,
    // er hastigheten null – ikke hastigheten fra et tidligere kast.
    const h = [...d.history, { t: e.timeStamp, y: e.clientY }].filter((p) => e.timeStamp - p.t <= 100);
    const first = h[0];
    const lastPt = h[h.length - 1];
    const dt = (lastPt.t - first.t) / 1000;
    const velocity = h.length > 1 && dt > 0 ? (lastPt.y - first.y) / dt : 0; // px/s, positiv = nedover
    const projected = value.current + project(velocity);
    if (d.active && projected > height() * 0.5) {
      releaseVelocity.current = velocity;
      closeRef.current();
    } else {
      // Tilbake til åpen, med hastigheten fra fingeren. Litt sprett bare etter et kast.
      springTo(0, { dampingRatio: Math.abs(velocity) > 300 ? 0.8 : 1, response: 0.3, velocity });
    }
  };

  if (!mounted) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      inert={!open}
    >
      <div ref={scrim} className="absolute inset-0 bg-black/40" style={{ opacity: 0 }} onClick={() => open && closeRef.current()} />
      <div
        ref={panel}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[1.75rem] border border-border bg-surface shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <div
          className="touch-none select-none sm:touch-auto sm:select-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Gripehåndtak på mobil */}
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between border-b border-border px-5 pt-2 pb-3 sm:pt-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button type="button" className="btn-ghost -mr-2 size-11 p-0 sm:size-9" onClick={() => closeRef.current()} aria-label="Lukk">
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
