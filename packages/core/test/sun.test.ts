import { describe, expect, it } from "vitest";
import {
  addOpening, addRoom, attachRoom, clock, compassName, createWorld, daylight, parseSunQuery, placeCabinet, runCommand, setSite, sunPatch, sunPosition, sunReport, sunSummary, wallBearing,
  type World,
} from "../src/index.js";

const BOGOTA = { latitude: 4.711, longitude: -74.072, utcOffset: -5 };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** Mediodía solar: el minuto en que el sol está más alto. */
const solarNoon = (site: typeof BOGOTA, date: string) => { let best = 0, top = -90; for (let m = 600; m < 900; m++) { const a = sunPosition(site, date, m).altitude; if (a > top) { top = a; best = m; } } return { minutes: best, ...sunPosition(site, date, best) }; };

function house(): World {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400 });
  addOpening(w, room.id, { wall: "east", type: "window", offset: 1000, width: 1000, height: 1000, sill: 1000 });
  addOpening(w, room.id, { wall: "west", type: "window", offset: 1000, width: 1000, height: 1000, sill: 1000 });
  addOpening(w, room.id, { wall: "north", type: "window", offset: 1500, width: 1000, height: 1000, sill: 1000 });
  setSite(w, { place: "Bogotá" });
  return w;
}

describe("posición del sol", () => {
  it("al mediodía solar la altura es 90° menos la distancia entre la latitud y la declinación", () => {
    const june = solarNoon(BOGOTA, "2026-06-21"), december = solarNoon(BOGOTA, "2026-12-21"), march = solarNoon(BOGOTA, "2026-03-21");
    expect(near(june.altitude, 90 - (23.44 - 4.711), 0.6), `junio ${june.altitude}`).toBe(true);
    expect(near(december.altitude, 90 - (23.44 + 4.711), 0.6), `diciembre ${december.altitude}`).toBe(true);
    expect(march.altitude).toBeGreaterThan(84);
    // En Bogotá el sol de mediodía queda al norte en junio y al sur en diciembre.
    expect(compassName(june.azimuth)).toBe("norte");
    expect(compassName(december.azimuth)).toBe("sur");
    expect(near(june.minutes, 718, 6)).toBe(true);
    // Hemisferio sur: en Buenos Aires el sol de mediodía siempre queda al norte, alto en diciembre y bajo en junio.
    const ba = { latitude: -34.604, longitude: -58.382, utcOffset: -3 };
    expect(near(solarNoon(ba, "2026-12-21").altitude, 90 - (34.604 - 23.44), 0.6)).toBe(true);
    expect(near(solarNoon(ba, "2026-06-21").altitude, 90 - (34.604 + 23.44), 0.6)).toBe(true);
    expect(compassName(solarNoon(ba, "2026-06-21").azimuth)).toBe("norte");
  });

  it("sale por el este, se pone por el oeste, y cerca del ecuador el día dura unas doce horas", () => {
    const { sunrise, sunset } = daylight(BOGOTA, "2026-06-21");
    expect(sunrise).toBeGreaterThan(335); expect(sunrise).toBeLessThan(360);
    expect(sunset).toBeGreaterThan(1078); expect(sunset).toBeLessThan(1102);
    expect(compassName(sunPosition(BOGOTA, "2026-03-21", 420).azimuth)).toBe("este");
    expect(compassName(sunPosition(BOGOTA, "2026-03-21", 1020).azimuth)).toBe("oeste");
    expect(sunPosition(BOGOTA, "2026-03-21", 60).altitude).toBeLessThan(0);
    // En Madrid el día de verano es mucho más largo que el de invierno.
    const madrid = { latitude: 40.417, longitude: -3.704, utcOffset: 1 };
    const summer = daylight(madrid, "2026-06-21"), winter = daylight(madrid, "2026-12-21");
    expect((summer.sunset - summer.sunrise) / 60).toBeGreaterThan(14.5);
    expect((winter.sunset - winter.sunrise) / 60).toBeLessThan(9.8);
    expect(clock(905)).toBe("3:05 p. m.");
    expect(clock(30)).toBe("12:30 a. m.");
  });
});

describe("sol por las ventanas", () => {
  it("la ventana del este recibe sol en la mañana y la del oeste en la tarde; la mancha cae donde dice la geometría", () => {
    const w = house(), room = w.rooms[0];
    const [east, west, north] = room.openings;
    const am = sunPosition(w.site!, "2026-03-21", 480), pm = sunPosition(w.site!, "2026-03-21", 960);
    const patch = sunPatch(w, room, east, am)!;
    expect(patch).not.toBeNull();
    expect(sunPatch(w, room, west, am)).toBeNull();
    expect(sunPatch(w, room, west, pm)).not.toBeNull();
    expect(sunPatch(w, room, east, pm)).toBeNull();
    // El borde de arriba de la ventana (a 2 m) proyecta a 2 m / tan(altura) del muro, casi perpendicular en el equinoccio.
    const reach = 4000 - Math.min(...patch.map((p) => p[0]));
    expect(near(reach, 2000 / Math.tan((am.altitude * Math.PI) / 180), 120), `${reach}`).toBe(true);
    expect(Math.max(...patch.map((p) => p[0]))).toBeLessThan(4000 - 900 / Math.tan((am.altitude * Math.PI) / 180));
    for (const [x, z] of patch) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(4000); expect(z).toBeGreaterThanOrEqual(0); expect(z).toBeLessThanOrEqual(3000); }
    // La del norte recibe sol a mediodía en junio y nunca en diciembre.
    expect(sunPatch(w, room, north, sunPosition(w.site!, "2026-06-21", 720))).not.toBeNull();
    expect(sunReport(w, "2026-12-21").find((r) => r.wall === "north")!.hours).toBe(0);
    // De noche no entra sol.
    expect(sunPatch(w, room, east, sunPosition(w.site!, "2026-03-21", 120))).toBeNull();
  });

  it("el informe del día da horas de sol, alcance y muebles asoleados por ventana", () => {
    const w = house(), room = w.rooms[0];
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 2500, gap: 1000, name: "Mesa", params: { width: 1200, height: 750, depth: 600 } });
    placeCabinet(w, { roomId: room.id, wall: "south", offset: 100, name: "Armario", params: { width: 800, height: 2000, depth: 500 } });
    const rows = sunReport(w, "2026-03-21");
    expect(rows.map((r) => [r.wall, r.faces])).toEqual([["east", "este"], ["west", "oeste"], ["north", "norte"]]);
    const east = rows[0], west = rows[1];
    expect(east.hours).toBeGreaterThan(4.5); expect(east.hours).toBeLessThan(6.6);
    expect(east.from!).toBeLessThan(420); expect(east.to!).toBeGreaterThan(660); expect(east.to!).toBeLessThan(760);
    expect(west.from!).toBeGreaterThan(690);
    expect(east.reach).toBe(4000); // con el sol bajo cruza todo el cuarto
    expect(east.items).toContain("Mesa");
    const text = sunSummary(w, "2026-03-21").join("\n");
    expect(text).toMatch(/Bogotá, 2026-03-21: amanece a las (5:5|6:0)\d a\. m\. y anochece a las 6:[01]\d p\. m\./);
    expect(text).toMatch(/Sala, ventana del muro este \(mira al este\): \d,\d h de sol directo, de .* Le cae a Mesa/);
    expect(text).toMatch(/ventana del muro oeste .* Sol de tarde: es el que más calienta/);
    expect(() => sunReport(createWorld("x"), "2026-03-21")).toThrow(/Falta saber dónde está la casa/);
  });

  it("girar la casa cambia qué ventana recibe el sol, y un muro compartido no recibe ninguno", () => {
    const w = house(), room = w.rooms[0];
    setSite(w, { north: 90 });
    expect(wallBearing(w.site!, "north")).toBe(90);
    // Ahora el "muro norte" mira al este: su ventana recibe el sol de la mañana.
    const rows = sunReport(w, "2026-03-21");
    expect(rows.find((r) => r.wall === "north")!.faces).toBe("este");
    expect(rows.find((r) => r.wall === "north")!.from!).toBeLessThan(420);
    expect(rows.find((r) => r.wall === "west")!.faces).toBe("norte");
    setSite(w, { north: 0 });
    attachRoom(w, { name: "Cuarto", width: 3000, depth: 3000, to: room.id, side: "east" });
    expect(sunReport(w, "2026-03-21", room.id).find((r) => r.wall === "east")!.hours).toBe(0);
  });
});

describe("lugar, orientación y consultas con palabras", () => {
  it("la ciudad y la orientación se dicen con cualquier cosa seleccionada", () => {
    const w = createWorld("Casa");
    addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400 });
    expect(runCommand(w, { kind: "world" }, "el muro norte mira al este").message).toMatch(/Primero dime dónde está la casa/);
    let r = runCommand(w, { kind: "room", roomId: w.rooms[0].id }, "estamos en Medellín");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/Lugar: Medellín \(latitud 6\.244, longitud -75\.581\)/);
    expect(w.site).toEqual({ place: "Medellín", latitude: 6.244, longitude: -75.581, utcOffset: -5, north: 0 });
    r = runCommand(w, { kind: "world" }, "el muro norte mira al suroeste");
    expect(r.message).toMatch(/el muro norte del modelo mira al suroeste \(225°\)\. El muro este mira al noroeste/);
    expect(w.site!.north).toBe(225);
    // Cambiar de ciudad conserva la orientación.
    runCommand(w, { kind: "world" }, "la casa queda en Cali");
    expect(w.site).toMatchObject({ place: "Cali", north: 225 });
    r = runCommand(w, { kind: "world" }, "latitud 10,4 longitud -75,5");
    expect(w.site).toMatchObject({ latitude: 10.4, longitude: -75.5, utcOffset: -5, north: 225 });
    expect(w.site!.place).toBeUndefined();
    expect(runCommand(w, { kind: "world" }, "estamos en Springfield").message).toMatch(/No conozco .* Ciudades que conozco: Bogotá/);
    // Crear habitaciones al lado de otra sigue funcionando: no es una orden de lugar.
    expect(runCommand(w, { kind: "world" }, "cocina de 2,8 x 2,4 al este de la sala").ok).toBe(true);
  });

  it("entiende a qué hora y en qué fecha se quiere ver el sol", () => {
    expect(parseSunQuery("agrega una repisa", 2026)).toBeNull();
    expect(parseSunQuery("sol a las 3 pm", 2026)).toEqual({ minutes: 900 });
    expect(parseSunQuery("muéstrame el sol a las 3", 2026)).toEqual({ minutes: 900 });
    expect(parseSunQuery("sol a las 9", 2026)).toEqual({ minutes: 540 });
    expect(parseSunQuery("sol el 21 de junio a las 4:30 de la tarde", 2026)).toEqual({ date: "2026-06-21", minutes: 990 });
    expect(parseSunQuery("sol en diciembre", 2026)).toEqual({ date: "2026-12-21" });
    expect(parseSunQuery("sol al mediodía", 2026)).toEqual({ minutes: 720 });
    expect(parseSunQuery("¿cómo es el sol de la tarde?", 2026)).toEqual({ minutes: 960 });
    expect(parseSunQuery("quita el sol", 2026)).toEqual({ off: true });
    expect(parseSunQuery("sol", 2026)).toEqual({});
  });
});
