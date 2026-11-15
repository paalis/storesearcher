/**
 * Liten, avbrytbar fjær-animasjon med Apples parametere (WWDC «Designing Fluid Interfaces»):
 * - dampingRatio: 1 = kritisk dempet (ingen overskyting), < 1 = litt sprett
 * - response: hvor raskt verdien når målet, i sekunder (ikke en fast varighet)
 *
 * Animasjonen starter alltid fra nåverdien og tar med seg hastigheten, så den kan
 * gripes og snus når som helst uten hopp.
 */
export interface SpringOptions {
  dampingRatio?: number;
  response?: number;
  /** Starthastighet i enheter per sekund (f.eks. px/s fra en dra-bevegelse) */
  velocity?: number;
}

export interface SpringHandle {
  stop(): void;
  /** Nåværende verdi og hastighet – brukes når animasjonen avbrytes */
  readonly value: number;
  readonly velocity: number;
}

export function animateSpring(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  { dampingRatio = 1, response = 0.35, velocity = 0 }: SpringOptions = {},
  onComplete?: () => void,
): SpringHandle {
  const omega = (2 * Math.PI) / response; // egenfrekvens
  const stiffness = omega * omega; // masse = 1
  const damping = 2 * dampingRatio * omega;
  let x = from;
  let v = velocity;
  let raf = 0;
  let last = 0;
  let stopped = false;
  const span = Math.max(Math.abs(to - from), 1);

  const step = (now: number) => {
    if (stopped) return;
    // Faste, små tidssteg for stabil integrasjon uavhengig av bildefrekvens
    let dt = last ? Math.min((now - last) / 1000, 0.064) : 1 / 60;
    last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      const a = -stiffness * (x - to) - damping * v;
      v += a * h;
      x += v * h;
      dt -= h;
    }
    const settled = Math.abs(x - to) < span * 0.0005 + 0.05 && Math.abs(v) < 2;
    if (settled) {
      x = to;
      v = 0;
      onUpdate(x);
      stopped = true;
      onComplete?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    get value() {
      return x;
    },
    get velocity() {
      return v;
    },
  };
}

/** Apples projeksjon av hvor en kastet bevegelse ville stoppet (eksponentiell retardasjon). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressiv motstand forbi en grense – jo lenger forbi, jo mindre følger elementet. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
