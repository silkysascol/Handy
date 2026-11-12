import type { Bar, Millimeters } from "./model/index.js";
import { getProfile } from "./profiles.js";

/**
 * Despiece lineal: cómo cortar todas las piezas de un perfil en barras comerciales de 6 m
 * gastando las menos posibles. Ordena de mayor a menor y mete cada pieza en la primera barra donde quepa.
 */
export interface StockBarPlan {
  profileId: string;
  /** Largos de los cortes, en el orden en que salen de la barra. */
  cuts: { name: string; length: Millimeters }[];
  leftover: Millimeters;
}

export interface BarPlan {
  stock: StockBarPlan[];
  totals: { profileId: string; profileName: string; bars: number; meters: number; kg: number; wastePct: number }[];
  /** Piezas más largas que la barra comercial. */
  oversize: { name: string; length: Millimeters }[];
  kerf: Millimeters;
  totalKg: number;
}

export function planBars(bars: Bar[], kerf: Millimeters = 3): BarPlan {
  const plan: BarPlan = { stock: [], totals: [], oversize: [], kerf, totalKg: 0 };
  const byProfile = new Map<string, { name: string; length: number }[]>();
  for (const b of bars) {
    const list = byProfile.get(b.profileId) ?? [];
    for (let i = 0; i < b.qty; i++) list.push({ name: b.qty > 1 ? `${b.name} ${i + 1}/${b.qty}` : b.name, length: b.length });
    byProfile.set(b.profileId, list);
  }
  for (const [profileId, pieces] of byProfile) {
    const profile = getProfile(profileId);
    const open: { used: number; cuts: { name: string; length: number }[] }[] = [];
    for (const p of [...pieces].sort((x, y) => y.length - x.length)) {
      if (p.length > profile.stockLength) { plan.oversize.push(p); continue; }
      const slot = open.find((s) => s.used + (s.cuts.length ? kerf : 0) + p.length <= profile.stockLength);
      if (slot) { slot.used += (slot.cuts.length ? kerf : 0) + p.length; slot.cuts.push(p); }
      else open.push({ used: p.length, cuts: [p] });
    }
    for (const s of open) plan.stock.push({ profileId, cuts: s.cuts, leftover: profile.stockLength - s.used });
    const meters = pieces.reduce((a, p) => a + p.length, 0) / 1000;
    const kg = Number((meters * profile.kgPerM).toFixed(1));
    plan.totals.push({ profileId, profileName: profile.name, bars: open.length, meters: Number(meters.toFixed(2)), kg, wastePct: open.length ? Math.round((1 - (meters * 1000) / (open.length * profile.stockLength)) * 100) : 0 });
    plan.totalKg = Number((plan.totalKg + kg).toFixed(1));
  }
  return plan;
}
