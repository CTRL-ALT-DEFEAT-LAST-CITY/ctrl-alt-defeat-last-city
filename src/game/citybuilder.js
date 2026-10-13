// =============================================
// LAST CITY · INTERACTIVE CITY BUILDER
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// The city view: an isometric, canvas-rendered settlement the player lays out
// by hand. It is a presentation-and-strategy layer over the original economy,
// never a replacement for it:
//
//   * How MANY of an original building you own is still decided by
//     game.buildings[type] and the original purchase code. Placing one here
//     routes through the game's own buyBuilding() so prices, notifications,
//     statistics and saves behave exactly as they always did.
//
//   * Structures introduced by this update ("service" structures: roads,
//     farms, turrets, labs…) are owned per-plot and feed ONLY the new
//     secondary resources. They cannot change Salvage/sec, so no original
//     balance curve moves because of them.
//
//   * Everything drawn here is procedural. There are no sprite sheets to go
//     missing, the art scales to any zoom without blurring, and the whole
//     view is crisp on a high-DPI phone.
//
// Rendering runs on its own requestAnimationFrame loop that only turns over
// while the City tab is visible, and it degrades to a single static frame when
// the player (or their OS) asks for reduced motion.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    // ---------------------------------------------------------------
    // Reading the original game's globals
    //
    // game.js and player-ui.js declare their state with top-level `let`, which
    // lives in the global lexical environment and is NOT a property of window.
    // `window.game` is therefore permanently undefined and these accessors
    // read the bare identifiers instead.
    // ---------------------------------------------------------------

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function started() { try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; } }
    function mode() { try { return typeof currentGameMode !== "undefined" ? currentGameMode : "city"; } catch (_) { return "city"; } }
    function stageView() { try { return typeof currentStageView !== "undefined" ? currentStageView : 1; } catch (_) { return 1; } }
    function zonesTable() { try { return typeof ZONES !== "undefined" ? ZONES : null; } catch (_) { return null; } }
    function fmt(value) {
        return typeof global.formatNumber === "function" ? global.formatNumber(value) : String(Math.round(value));
    }

    // ---------------------------------------------------------------
    // Geometry
    //
    // A classic 2:1 isometric projection. TILE_W/TILE_H are the on-screen size
    // of one ground diamond at zoom 1.
    // ---------------------------------------------------------------

    const TILE_W = 72;
    const TILE_H = 36;
    const GRID = { minX: -12, maxX: 12, minY: -12, maxY: 12 };

    // Grid cell -> world-space pixel (before camera and zoom).
    function cellToWorld(x, y) {
        return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
    }

    // World-space pixel -> fractional grid cell. The inverse of cellToWorld.
    function worldToCell(wx, wy) {
        const a = wx / (TILE_W / 2);
        const b = wy / (TILE_H / 2);
        return { x: (a + b) / 2, y: (b - a) / 2 };
    }

    function inGrid(x, y) {
        return x >= GRID.minX && x <= GRID.maxX && y >= GRID.minY && y <= GRID.maxY;
    }

    // ---------------------------------------------------------------
    // Districts
    //
    // The map opens outward as the player unlocks zones, so a new city is a
    // readable plateau rather than an intimidating empty field. District 0 is
    // always available; 1-4 follow the original stage unlocks.
    // ---------------------------------------------------------------

    const DISTRICTS = [
        { id: 0, radius: 4,  name: "Ashfall Plateau",  stage: 1 },
        { id: 1, radius: 6,  name: "Depot Flats",      stage: 2 },
        { id: 2, radius: 8,  name: "Foundry Row",      stage: 3 },
        { id: 3, radius: 10, name: "Relay Heights",    stage: 4 },
        { id: 4, radius: 13, name: "Citadel Approach",  stage: 5 }
    ];

    // Chebyshev-style ring distance, which gives square districts that match
    // the diamond grid better than a Euclidean radius would.
    function cellRing(x, y) { return Math.max(Math.abs(x), Math.abs(y)); }

    function districtFor(x, y) {
        const ring = cellRing(x, y);
        for (const district of DISTRICTS) if (ring <= district.radius) return district;
        return null;
    }

    function districtUnlocked(district) {
        if (!district) return false;
        if (district.id === 0) return true;
        const g = liveGame();
        if (!g) return false;
        // Either the zone it belongs to is open, or the player explicitly
        // unlocked it (recorded in the save so it survives a stage reset).
        if (EX()?.state()?.city.districts[String(district.id)]) return true;
        return district.stage <= 1 || !!g["stage" + district.stage + "Unlocked"];
    }

    function cellBuildable(x, y) {
        return inGrid(x, y) && districtUnlocked(districtFor(x, y));
    }

    // ---------------------------------------------------------------
    // Themes
    //
    // One palette per zone, so travelling from Ashfall to the Citadel visibly
    // changes the world the city stands in. Colours are deliberately muted;
    // the structures carry the saturation.
    // ---------------------------------------------------------------

    const THEMES = {
        1: {
            name: "Ashfall", sky: ["#2a1d1b", "#4a2d22", "#7d4a2c"],
            ground: ["#3a2f27", "#44362c", "#4e3d31"], grass: "#4a4030",
            rock: "#2e2621", accent: "#ff8b35", haze: "rgba(255,139,53,.10)",
            weather: ["clear", "ash", "ash", "fog"], star: 0.25
        },
        2: {
            name: "Depot", sky: ["#141f1a", "#1f3326", "#375441"],
            ground: ["#2b3a2c", "#324431", "#3b5038"], grass: "#4a6b42",
            rock: "#26322a", accent: "#5bd69b", haze: "rgba(91,214,155,.08)",
            weather: ["clear", "clear", "rain", "fog"], star: 0.5
        },
        3: {
            name: "Foundry", sky: ["#241711", "#3d2416", "#6b3a1c"],
            ground: ["#342a26", "#3e322b", "#473931"], grass: "#4a3b2a",
            rock: "#2a2320", accent: "#ffc247", haze: "rgba(255,194,71,.10)",
            weather: ["clear", "ash", "clear", "ash"], star: 0.35
        },
        4: {
            name: "Relay", sky: ["#0f1626", "#182340", "#2a3a6b"],
            ground: ["#232c3d", "#2a3547", "#323f54"], grass: "#2f4a5c",
            rock: "#1d2432", accent: "#65baff", haze: "rgba(101,186,255,.12)",
            weather: ["clear", "rain", "clear", "clear"], star: 0.9
        },
        5: {
            name: "Citadel", sky: ["#130f26", "#241a44", "#3d2a6b"],
            ground: ["#272136", "#2f2840", "#38304c"], grass: "#3a3254",
            rock: "#1f1a2c", accent: "#aa8cff", haze: "rgba(170,140,255,.14)",
            weather: ["clear", "clear", "fog", "clear"], star: 1
        }
    };

    function theme() {
        const g = liveGame();
        let stage = 1;
        if (g) {
            if (g.stage5Unlocked) stage = 5;
            else if (g.stage4Unlocked) stage = 4;
            else if (g.stage3Unlocked) stage = 3;
            else if (g.stage2Unlocked) stage = 2;
        }
        // The city always shows the furthest zone reached, so the world
        // visibly evolves as the player progresses rather than flipping back
        // and forth with the zone tabs.
        return THEMES[stage] || THEMES[1];
    }

    // ---------------------------------------------------------------
    // Deterministic noise
    //
    // Ground variation, prop placement and citizen idling all need to look
    // random but stay identical across frames and reloads, so they are hashed
    // from coordinates rather than drawn from Math.random().
    // ---------------------------------------------------------------

    function hash2(x, y, salt = 0) {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // ---------------------------------------------------------------
    // Module state (runtime only — never saved)
    // ---------------------------------------------------------------

    const view = {
        canvas: null, ctx: null, dpr: 1, width: 0, height: 0,
        camera: { x: 0, y: -40, zoom: 1 },
        pointer: { x: 0, y: 0, inside: false, down: false, dragging: false,
                   downX: 0, downY: 0, movedPx: 0, cell: null, pointerId: null },
        pinch: null,
        tool: "inspect",
        selectedType: null,
        selectedPlot: 0,
        hoverCell: null,
        ghost: null,
        running: false,
        frame: 0,
        lastFrame: 0,
        time: 0,
        shake: 0,
        agents: [],
        particles: [],
        floats: [],
        props: [],
        propsKey: "",
        weather: { kind: "clear", until: 0, intensity: 0, target: 0 },
        skyline: null,
        skylineKey: "",
        needsStatic: true,
        panel: null,
        mounted: false,
        uiSignature: "",
        traySignature: "",
        inspectorSignature: "",
        banner: null,
        bannerUntil: 0
    };

    function exp() { return EX()?.state() || null; }
    function buildings() { return EX()?.CITY_BUILDINGS || {}; }
    function jobsTable() { return EX()?.CITY_JOBS || {}; }

    function plotAt(x, y) {
        const state = exp();
        if (!state) return null;
        for (const plot of state.city.plots) {
            const def = buildings()[plot.type];
            const size = def?.footprint || 1;
            if (x >= plot.x && x < plot.x + size && y >= plot.y && y < plot.y + size) return plot;
        }
        return null;
    }

    function roadAt(x, y) {
        const state = exp();
        if (!state) return false;
        for (const road of state.city.roads) if (road.x === x && road.y === y) return true;
        return false;
    }

    function plotById(id) {
        const state = exp();
        if (!state || !id) return null;
        return state.city.plots.find(plot => plot.id === id) || null;
    }

    // Can a footprint x footprint block be placed with its origin here?
    function areaFree(x, y, size) {
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const cx = x + dx, cy = y + dy;
                if (!cellBuildable(cx, cy)) return false;
                if (plotAt(cx, cy)) return false;
                if (roadAt(cx, cy)) return false;
            }
        }
        return true;
    }

    // ---------------------------------------------------------------
    // Camera
    // ---------------------------------------------------------------

    function clampCamera() {
        const camera = view.camera;
        camera.zoom = Math.min(2.4, Math.max(0.45, camera.zoom));
        const span = (GRID.maxX - GRID.minX + 2) * TILE_W;
        camera.x = Math.min(span, Math.max(-span, camera.x));
        camera.y = Math.min(span, Math.max(-span, camera.y));
    }

    function worldToScreen(wx, wy) {
        const camera = view.camera;
        return {
            x: (wx - camera.x) * camera.zoom + view.width / 2,
            y: (wy - camera.y) * camera.zoom + view.height / 2
        };
    }

    function screenToWorld(sx, sy) {
        const camera = view.camera;
        return {
            x: (sx - view.width / 2) / camera.zoom + camera.x,
            y: (sy - view.height / 2) / camera.zoom + camera.y
        };
    }

    function screenToCell(sx, sy) {
        const world = screenToWorld(sx, sy);
        const cell = worldToCell(world.x, world.y);
        return { x: Math.floor(cell.x + 0.5), y: Math.floor(cell.y + 0.5) };
    }

    function saveCamera() {
        const state = exp();
        if (!state) return;
        state.city.camera.x = view.camera.x;
        state.city.camera.y = view.camera.y;
        state.city.camera.zoom = view.camera.zoom;
    }

    function restoreCamera() {
        const state = exp();
        if (!state) return;
        view.camera.x = state.city.camera.x || 0;
        view.camera.y = Number.isFinite(state.city.camera.y) ? state.city.camera.y : -40;
        view.camera.zoom = state.city.camera.zoom || 1;
        clampCamera();
    }

    // Centre the camera on the built city, used by the "recentre" control and
    // the first time the view is opened.
    function focusCity(animate = true) {
        const state = exp();
        let sum = { x: 0, y: 0 }, count = 0;
        if (state) {
            for (const plot of state.city.plots) {
                const world = cellToWorld(plot.x, plot.y);
                sum.x += world.x; sum.y += world.y; count++;
            }
        }
        const target = count ? { x: sum.x / count, y: sum.y / count } : { x: 0, y: 0 };
        if (!animate || !EX()?.motionAllowed()) {
            view.camera.x = target.x;
            view.camera.y = target.y;
        } else {
            view.cameraTween = { from: { ...view.camera }, to: target, start: performance.now(), ms: 520 };
        }
        clampCamera();
        saveCamera();
    }

    function tweenCamera(now) {
        const tween = view.cameraTween;
        if (!tween) return;
        const progress = Math.min(1, (now - tween.start) / tween.ms);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        view.camera.x = tween.from.x + (tween.to.x - tween.from.x) * eased;
        view.camera.y = tween.from.y + (tween.to.y - tween.from.y) * eased;
        if (progress >= 1) { view.cameraTween = null; saveCamera(); }
    }

    // ---------------------------------------------------------------
    // Floating feedback
    //
    // Short-lived labels and particles anchored in world space, so they track
    // the city while the camera moves.
    // ---------------------------------------------------------------

    function floatText(wx, wy, text, color = "#ffc247") {
        if (!EX()?.motionAllowed()) return;
        if (view.floats.length > 24) view.floats.shift();
        view.floats.push({ x: wx, y: wy, text, color, born: performance.now(), ms: 1100 });
    }

    function burst(wx, wy, color, count = 10, speed = 60) {
        if (!EX()?.motionAllowed()) return;
        const quality = EX()?.quality() || "high";
        const scale = quality === "low" ? 0.35 : quality === "medium" ? 0.7 : 1;
        const total = Math.max(2, Math.round(count * scale));
        if (view.particles.length > 420) return;
        for (let i = 0; i < total; i++) {
            const angle = (i / total) * Math.PI * 2 + Math.random() * 0.4;
            const velocity = speed * (0.5 + Math.random() * 0.8);
            view.particles.push({
                x: wx, y: wy,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity * 0.55 - 30,
                life: 0, ms: 420 + Math.random() * 420,
                color, size: 1.4 + Math.random() * 2.2, gravity: 110
            });
        }
    }

    function banner(text, kind = "info") {
        view.banner = { text, kind };
        view.bannerUntil = performance.now() + 2400;
    }

    // ---------------------------------------------------------------
    // Placement
    //
    // Two kinds of structure, two cost paths:
    //
    //   core    — an original building. If the player already owns one that is
    //             not standing anywhere, placing it is free (it is the same
    //             building, now on the map). Otherwise the ORIGINAL purchase
    //             code runs, so the price, the notification, the statistics
    //             and the save are exactly the game's own.
    //
    //   service — new to this update. Priced by serviceCost(), paid in
    //             Salvage, and owned by the plot itself.
    // ---------------------------------------------------------------

    // Buy exactly one of an original building through the game's own code
    // path. buyBuilding() honours game.buyAmount, so it is pinned to 1 for the
    // duration and restored afterwards (including if it throws).
    function buyOneCoreBuilding(type) {
        const g = liveGame();
        if (!g || typeof global.buyBuilding !== "function") return false;
        const owned = g.buildings?.[type] || 0;
        const previousAmount = g.buyAmount;
        try {
            g.buyAmount = 1;
            global.buyBuilding(type);
        } finally {
            g.buyAmount = previousAmount;
        }
        return (g.buildings?.[type] || 0) > owned;
    }

    function placementCost(type) {
        const def = buildings()[type];
        if (!def) return { amount: Infinity, free: false, label: "" };
        if (def.kind === "core") {
            if (EX().unplacedCount(type) > 0) return { amount: 0, free: true, label: "Ready to place" };
            const cost = typeof global.getBuildingCost === "function" ? global.getBuildingCost(type) : Infinity;
            return { amount: cost, free: false, label: fmt(cost) + " Salvage" };
        }
        const cost = EX().serviceCost(type);
        return { amount: cost, free: false, label: Number.isFinite(cost) ? fmt(cost) + " Salvage" : "Limit reached" };
    }

    function canPlace(type, x, y) {
        const def = buildings()[type];
        const g = liveGame();
        if (!def || !g) return { ok: false, reason: "Unknown structure." };
        if (EX().busy()) return { ok: false, reason: "Finish what is open first." };
        const size = def.footprint || 1;
        if (!inGrid(x, y) || !inGrid(x + size - 1, y + size - 1)) return { ok: false, reason: "Outside the city map." };
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const district = districtFor(x + dx, y + dy);
                if (!districtUnlocked(district)) {
                    return { ok: false, reason: district ? "🔒 " + district.name + " is not open yet." : "Outside the city map." };
                }
            }
        }
        if (!areaFree(x, y, size)) {
            return { ok: false, reason: size > 1 ? "Needs a clear " + size + "×" + size + " area." : "That plot is taken." };
        }
        const state = exp();
        if (state && state.city.plots.length >= 240) return { ok: false, reason: "The city is full. Demolish something first." };

        const cost = placementCost(type);
        if (!cost.free) {
            if (!Number.isFinite(cost.amount)) return { ok: false, reason: def.name + " is at its build limit." };
            if ((g.salvage || 0) < cost.amount) {
                return { ok: false, reason: "Needs " + fmt(cost.amount) + " Salvage." };
            }
        }
        return { ok: true, cost };
    }

    function placeStructure(type, x, y) {
        const def = buildings()[type];
        // Roads are stored as their own flat cell list, not as plots. Selecting
        // the road from the build tray and tapping the map must therefore end
        // up in exactly the same place as the Roads tool, or the two would
        // disagree about what a road is.
        if (def && def.road) return placeRoad(x, y);
        const check = canPlace(type, x, y);
        if (!check.ok) {
            banner(check.reason, "bad");
            EX().sfx("uiDenied");
            return false;
        }
        const g = liveGame();
        const state = exp();

        if (def.kind === "core") {
            if (EX().unplacedCount(type) <= 0 && !buyOneCoreBuilding(type)) {
                banner("Purchase failed — not enough Salvage.", "bad");
                EX().sfx("uiDenied");
                return false;
            }
        } else {
            const cost = EX().serviceCost(type);
            if (!Number.isFinite(cost) || (g.salvage || 0) < cost) {
                banner("Needs " + fmt(cost) + " Salvage.", "bad");
                EX().sfx("uiDenied");
                return false;
            }
            g.salvage -= cost;
        }

        const now = Date.now();
        const buildMs = EX().motionAllowed() ? (def.buildMs || 3000) : 0;
        const plot = {
            id: state.city.nextPlotId++,
            type, x, y,
            level: 1,
            hp: 100,
            rotation: Math.floor(hash2(x, y, 7) * 4),
            builtAt: now,
            workers: 0,
            constructing: buildMs > 0 ? { until: now + buildMs, started: now, upgrade: false } : null,
            upgrading: false
        };
        state.city.plots.push(plot);
        state.city.built++;

        const world = cellToWorld(x, y);
        burst(world.x, world.y, def.palette?.[2] || "#ffc247", 14, 70);
        floatText(world.x, world.y - 20, def.icon + " " + def.name, "#5bd69b");
        EX().sfx("placeBuilding");
        banner(def.name + (buildMs ? " under construction" : " built"), "good");
        EX().logEvent(def.name + " added to the city.", "build");
        EX().emit("city:placed", { type, plot });
        view.selectedPlot = plot.id;
        view.needsStatic = true;
        maybeRecruitSurvivor();
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function placeRoad(x, y) {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return false;
        if (EX().busy()) return false;
        if (!cellBuildable(x, y)) { banner("That ground is not open yet.", "bad"); EX().sfx("uiDenied"); return false; }
        if (plotAt(x, y)) { banner("A structure is standing there.", "bad"); EX().sfx("uiDenied"); return false; }
        if (roadAt(x, y)) return false;
        if (state.city.roads.length >= 400) { banner("Road network is at its limit.", "bad"); return false; }
        const def = buildings().road;
        const cost = EX().serviceCost("road");
        if (!Number.isFinite(cost) || (g.salvage || 0) < cost) {
            banner("Roads cost " + fmt(cost) + " Salvage.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        g.salvage -= cost;
        state.city.roads.push({ x, y });
        const world = cellToWorld(x, y);
        burst(world.x, world.y, def?.palette?.[2] || "#4b525c", 5, 34);
        EX().sfx("constructionTick");
        view.needsStatic = true;
        rebuildRoadGraph();
        return true;
    }

    // ---------------------------------------------------------------
    // Upgrade / repair / demolish
    // ---------------------------------------------------------------

    function upgradeCost(plot) {
        const def = buildings()[plot.type];
        if (!def) return Infinity;
        const base = def.kind === "core"
            ? (typeof global.getBuildingCost === "function" ? global.getBuildingCost(plot.type) : 1000)
            : (def.cost || 500);
        const scaled = Math.max(50, base) * 0.6 * Math.pow(1.85, plot.level - 1);
        return Math.ceil(Math.min(1e15, scaled));
    }

    const MAX_PLOT_LEVEL = 8;

    function upgradePlot(id) {
        const plot = plotById(id);
        const g = liveGame();
        if (!plot || !g || EX().busy()) return false;
        const def = buildings()[plot.type];
        if (!def) return false;
        if (plot.constructing) { banner("Already working on it.", "bad"); return false; }
        if (plot.level >= MAX_PLOT_LEVEL) { banner(def.name + " is fully upgraded.", "bad"); EX().sfx("uiDenied"); return false; }
        const cost = upgradeCost(plot);
        if ((g.salvage || 0) < cost) {
            banner("Upgrade needs " + fmt(cost) + " Salvage.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        g.salvage -= cost;
        const now = Date.now();
        const ms = EX().motionAllowed() ? Math.round((def.buildMs || 3000) * 0.6) : 0;
        plot.level++;
        plot.hp = 100;
        if (ms > 0) {
            plot.constructing = { until: now + ms, started: now, upgrade: true };
            plot.upgrading = true;
        }
        const world = cellToWorld(plot.x, plot.y);
        burst(world.x, world.y, "#ffc247", 16, 80);
        floatText(world.x, world.y - 24, "Lv " + plot.level, "#ffc247");
        EX().sfx("constructionDone");
        banner(def.name + " upgraded to level " + plot.level, "good");
        EX().logEvent(def.name + " upgraded to level " + plot.level + ".", "build");
        EX().emit("city:upgraded", { plot });
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function repairCost(plot) {
        const def = buildings()[plot.type];
        const base = def?.kind === "core"
            ? (typeof global.getBuildingCost === "function" ? global.getBuildingCost(plot.type) : 400)
            : (def?.cost || 400);
        const missing = (100 - plot.hp) / 100;
        return Math.ceil(Math.max(20, base * 0.3 * missing));
    }

    function repairPlot(id) {
        const plot = plotById(id);
        const g = liveGame();
        if (!plot || !g || EX().busy()) return false;
        if (plot.hp >= 100) { banner("Nothing to repair there.", "bad"); return false; }
        const cost = repairCost(plot);
        if ((g.salvage || 0) < cost) {
            banner("Repairs need " + fmt(cost) + " Salvage.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        g.salvage -= cost;
        plot.hp = 100;
        const state = exp();
        if (state) state.city.repaired++;
        const world = cellToWorld(plot.x, plot.y);
        burst(world.x, world.y, "#5bd69b", 12, 56);
        floatText(world.x, world.y - 20, "Repaired", "#5bd69b");
        EX().sfx("repair");
        banner((buildings()[plot.type]?.name || "Structure") + " repaired", "good");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function repairAll() {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return;
        const damaged = state.city.plots.filter(plot => plot.hp < 100);
        if (!damaged.length) { banner("Every structure is intact.", "info"); return; }
        let spent = 0, fixed = 0;
        for (const plot of damaged) {
            const cost = repairCost(plot);
            if ((g.salvage || 0) < cost) break;
            g.salvage -= cost;
            spent += cost;
            plot.hp = 100;
            fixed++;
            state.city.repaired++;
        }
        if (!fixed) { banner("Not enough Salvage to repair anything.", "bad"); EX().sfx("uiDenied"); return; }
        EX().sfx("repair");
        banner("Repaired " + fixed + " structure" + (fixed === 1 ? "" : "s") + " for " + fmt(spent) + " Salvage", "good");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
    }

    // Demolishing an ORIGINAL building never destroys the purchase: it returns
    // to the build tray as "owned, unplaced", so the player can rearrange the
    // city freely without ever losing economy progress. Service structures are
    // refunded at half their current price.
    function demolishPlot(id) {
        const plot = plotById(id);
        const state = exp();
        const g = liveGame();
        if (!plot || !state || !g || EX().busy()) return false;
        const def = buildings()[plot.type];
        const index = state.city.plots.indexOf(plot);
        if (index < 0) return false;

        let refund = 0;
        if (def && def.kind === "service") {
            const owned = EX().serviceCount(plot.type);
            const lastPrice = Math.ceil((def.cost || 0) * Math.pow(def.growth || 1.2, Math.max(0, owned - 1)));
            refund = Math.floor(lastPrice * 0.5);
            g.salvage += refund;
        }

        state.city.plots.splice(index, 1);
        state.city.demolished++;
        // Free the survivors who worked here.
        for (const survivor of state.survivors.roster) {
            if (survivor.assignedTo === plot.id) { survivor.assignedTo = 0; survivor.role = "idle"; }
        }
        if (view.selectedPlot === plot.id) view.selectedPlot = 0;

        const world = cellToWorld(plot.x, plot.y);
        burst(world.x, world.y, "#8193a6", 16, 70);
        EX().sfx("demolish");
        banner(def?.kind === "core"
            ? (def.name + " returned to the build tray")
            : (def?.name || "Structure") + " cleared" + (refund ? " · +" + fmt(refund) + " Salvage" : ""), "info");
        view.needsStatic = true;
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function removeRoad(x, y) {
        const state = exp();
        if (!state) return false;
        const index = state.city.roads.findIndex(road => road.x === x && road.y === y);
        if (index < 0) return false;
        state.city.roads.splice(index, 1);
        EX().sfx("demolish");
        view.needsStatic = true;
        rebuildRoadGraph();
        EX().save();
        return true;
    }

    // ---------------------------------------------------------------
    // Districts
    // ---------------------------------------------------------------

    function districtUnlockCost(district) {
        return Math.ceil(2500 * Math.pow(6, district.id));
    }

    function unlockDistrict(id) {
        const district = DISTRICTS.find(entry => entry.id === id);
        const state = exp();
        const g = liveGame();
        if (!district || !state || !g) return false;
        if (districtUnlocked(district)) return false;
        const zones = zonesTable();
        if (district.stage > 1 && !g["stage" + district.stage + "Unlocked"]) {
            banner("🔒 Open " + (zones?.[district.stage]?.name || "the next zone") + " first.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        const cost = districtUnlockCost(district);
        if ((g.salvage || 0) < cost) {
            banner("Clearing " + district.name + " costs " + fmt(cost) + " Salvage.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        g.salvage -= cost;
        state.city.districts[String(district.id)] = true;
        banner(district.name + " cleared for building", "good");
        EX().logEvent(district.name + " opened for construction.", "good");
        EX().sfx("bigReward");
        view.needsStatic = true;
        view.propsKey = "";
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function nextLockedDistrict() {
        for (const district of DISTRICTS) if (!districtUnlocked(district)) return district;
        return null;
    }

    // ---------------------------------------------------------------
    // Survivors and jobs
    // ---------------------------------------------------------------

    const SURVIVOR_NAMES = [
        "Ada", "Bex", "Cole", "Dru", "Enno", "Fia", "Gale", "Hux", "Ira", "Jex",
        "Kira", "Lund", "Mira", "Nels", "Oshi", "Pell", "Quen", "Rask", "Sena",
        "Tove", "Ula", "Vero", "Wren", "Xan", "Yara", "Zeb", "Brin", "Cass",
        "Dala", "Esk", "Finn", "Gret", "Halo", "Ivo", "Juno", "Kell"
    ];

    // Population is the original game's number; the roster is the named face
    // of it. The roster can never exceed Population, and grows toward it as
    // the player builds shelters.
    function populationCap() {
        return typeof global.getPopulation === "function" ? Math.floor(global.getPopulation()) : 0;
    }

    function maybeRecruitSurvivor(force = false) {
        const state = exp();
        if (!state) return null;
        const cap = Math.min(120, populationCap());
        if (!force && state.survivors.roster.length >= cap) return null;
        if (state.survivors.roster.length >= 120) return null;
        const id = state.survivors.nextId++;
        const name = SURVIVOR_NAMES[Math.floor(hash2(id, 11, 3) * SURVIVOR_NAMES.length)] +
            " " + String.fromCharCode(65 + Math.floor(hash2(id, 29, 5) * 26)) + ".";
        const survivor = {
            id, name,
            role: "idle",
            assignedTo: 0,
            skill: 1 + Math.floor(hash2(id, 41, 7) * 4),
            morale: 70,
            recruitedAt: Date.now(),
            portrait: Math.floor(hash2(id, 53, 9) * 24)
        };
        state.survivors.roster.push(survivor);
        state.survivors.recruited++;
        spawnAgentFor(survivor);
        EX().emit("city:recruited", { survivor });
        return survivor;
    }

    // Keep the roster in step with Population, which can rise (new shelters)
    // or fall (a renewal). Called from the tick.
    function syncRoster() {
        const state = exp();
        if (!state) return;
        const cap = Math.min(120, populationCap());
        let guard = 0;
        while (state.survivors.roster.length < cap && guard++ < 4) {
            const survivor = maybeRecruitSurvivor();
            if (!survivor) break;
            if (state.survivors.roster.length <= 3) {
                EX().logEvent(survivor.name + " joined the settlement.", "good");
            }
        }
        while (state.survivors.roster.length > cap && state.survivors.roster.length > 0) {
            const removed = state.survivors.roster.pop();
            view.agents = view.agents.filter(agent => agent.survivorId !== removed.id);
        }
    }

    // Which job slots are open, per role.
    function openSlots() {
        const stats = EX().cityStats();
        const open = {};
        for (const [role, total] of Object.entries(stats.jobSlots || {})) {
            if (role === "idle") continue;
            open[role] = Math.max(0, total - (stats.jobsFilled?.[role] || 0));
        }
        return open;
    }

    function assignSurvivor(role) {
        const state = exp();
        if (!state || !jobsTable()[role] || role === "idle") return false;
        const open = openSlots();
        if ((open[role] || 0) <= 0) {
            banner("No open " + jobsTable()[role].name + " posts. Build or upgrade a structure that needs one.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        const survivor = state.survivors.roster.find(entry => entry.role === "idle");
        if (!survivor) {
            banner("Everyone already has a job. Build shelters to grow your population.", "bad");
            EX().sfx("uiDenied");
            return false;
        }
        // Attach them to a structure that actually offers this job, so the
        // citizen animation can walk them to their workplace.
        const host = state.city.plots.find(plot => {
            const def = buildings()[plot.type];
            if (!def || plot.constructing) return false;
            const capacity = (def.jobs?.[role] || 0) * plot.level;
            if (capacity <= 0) return false;
            const taken = state.survivors.roster.filter(entry => entry.assignedTo === plot.id).length;
            return taken < capacity;
        });
        survivor.role = role;
        survivor.assignedTo = host ? host.id : 0;
        survivor.morale = Math.min(100, survivor.morale + 6);
        EX().sfx("uiTap");
        banner(survivor.name + " assigned as " + jobsTable()[role].name, "good");
        const agent = view.agents.find(entry => entry.survivorId === survivor.id);
        if (agent) agent.retarget = true;
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    function unassignSurvivor(role) {
        const state = exp();
        if (!state) return false;
        const survivor = [...state.survivors.roster].reverse().find(entry => entry.role === role);
        if (!survivor) return false;
        survivor.role = "idle";
        survivor.assignedTo = 0;
        EX().sfx("uiBack");
        banner(survivor.name + " is unassigned", "info");
        const agent = view.agents.find(entry => entry.survivorId === survivor.id);
        if (agent) agent.retarget = true;
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    // Fill every open post with whoever is idle, best-skill first.
    function autoAssign() {
        const state = exp();
        if (!state) return;
        let assigned = 0;
        for (let guard = 0; guard < 200; guard++) {
            const open = openSlots();
            const role = Object.keys(open).find(key => open[key] > 0);
            if (!role) break;
            const idle = state.survivors.roster.filter(entry => entry.role === "idle");
            if (!idle.length) break;
            idle.sort((a, b) => b.skill - a.skill);
            const survivor = idle[0];
            const host = state.city.plots.find(plot => {
                const def = buildings()[plot.type];
                if (!def || plot.constructing) return false;
                const capacity = (def.jobs?.[role] || 0) * plot.level;
                if (capacity <= 0) return false;
                const taken = state.survivors.roster.filter(entry => entry.assignedTo === plot.id).length;
                return taken < capacity;
            });
            survivor.role = role;
            survivor.assignedTo = host ? host.id : 0;
            assigned++;
        }
        if (!assigned) { banner("Nothing to assign right now.", "info"); return; }
        for (const agent of view.agents) agent.retarget = true;
        EX().sfx("uiTap");
        banner("Assigned " + assigned + " survivor" + (assigned === 1 ? "" : "s"), "good");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
    }

    // ---------------------------------------------------------------
    // Road graph
    //
    // Citizens prefer to walk on roads. The graph is rebuilt only when roads
    // change, and a breadth-first search gives each citizen a path; with no
    // roads they walk straight lines between buildings instead, so the city
    // still looks alive before the first road is laid.
    // ---------------------------------------------------------------

    let roadGraph = { cells: new Set(), list: [] };

    function rebuildRoadGraph() {
        const state = exp();
        const cells = new Set();
        const list = [];
        if (state) {
            for (const road of state.city.roads) {
                cells.add(road.x + ":" + road.y);
                list.push(road);
            }
        }
        roadGraph = { cells, list };
    }

    const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    // Shortest road path between two road cells. Capped so a huge network can
    // never stall a frame.
    function roadPath(from, to) {
        const startKey = from.x + ":" + from.y;
        const goalKey = to.x + ":" + to.y;
        if (startKey === goalKey) return [from];
        if (!roadGraph.cells.has(startKey) || !roadGraph.cells.has(goalKey)) return null;
        const queue = [from];
        const cameFrom = new Map([[startKey, null]]);
        let visited = 0;
        while (queue.length && visited++ < 900) {
            const current = queue.shift();
            const currentKey = current.x + ":" + current.y;
            if (currentKey === goalKey) break;
            for (const [dx, dy] of STEPS) {
                const next = { x: current.x + dx, y: current.y + dy };
                const key = next.x + ":" + next.y;
                if (!roadGraph.cells.has(key) || cameFrom.has(key)) continue;
                cameFrom.set(key, current);
                queue.push(next);
            }
        }
        if (!cameFrom.has(goalKey)) return null;
        const path = [];
        let cursor = to;
        let guard = 0;
        while (cursor && guard++ < 900) {
            path.unshift(cursor);
            cursor = cameFrom.get(cursor.x + ":" + cursor.y);
        }
        return path;
    }

    // The road cell nearest a given cell, used to get a citizen on and off the
    // network at either end of a walk.
    function nearestRoad(x, y, limit = 6) {
        if (!roadGraph.list.length) return null;
        let best = null, bestDistance = Infinity;
        for (const road of roadGraph.list) {
            const distance = Math.abs(road.x - x) + Math.abs(road.y - y);
            if (distance < bestDistance) { bestDistance = distance; best = road; }
        }
        return bestDistance <= limit ? best : null;
    }

    // ---------------------------------------------------------------
    // Citizens
    //
    // One agent per rostered survivor, plus the player's assigned companion
    // pet. Agents live in world-space pixels and interpolate between grid
    // waypoints, so motion is smooth and independent of the simulation tick.
    // ---------------------------------------------------------------

    function spawnAgentFor(survivor) {
        const spawn = { x: 0, y: 0 };
        const state = exp();
        if (state?.city.plots.length) {
            const plot = state.city.plots[Math.floor(hash2(survivor.id, 61, 2) * state.city.plots.length)];
            spawn.x = plot.x; spawn.y = plot.y;
        }
        const world = cellToWorld(spawn.x, spawn.y);
        view.agents.push({
            survivorId: survivor.id,
            x: world.x, y: world.y,
            cell: { ...spawn },
            path: null, step: 0,
            speed: 26 + hash2(survivor.id, 73, 4) * 16,
            phase: hash2(survivor.id, 97, 6) * Math.PI * 2,
            waitUntil: 0,
            retarget: true,
            kind: "survivor"
        });
    }

    function syncAgents() {
        const state = exp();
        if (!state) { view.agents = []; return; }
        const wanted = new Set(state.survivors.roster.map(entry => entry.id));
        view.agents = view.agents.filter(agent => agent.kind !== "survivor" || wanted.has(agent.survivorId));
        const present = new Set(view.agents.filter(a => a.kind === "survivor").map(a => a.survivorId));
        // Cap the number of drawn citizens: a 120-strong roster does not need
        // 120 sprites to read as a busy settlement.
        const quality = EX().quality();
        const limit = quality === "low" ? 8 : quality === "medium" ? 16 : 28;
        for (const survivor of state.survivors.roster) {
            if (present.has(survivor.id)) continue;
            if (view.agents.filter(a => a.kind === "survivor").length >= limit) break;
            spawnAgentFor(survivor);
        }
        syncPetAgent();
    }

    function syncPetAgent() {
        const state = exp();
        const g = liveGame();
        view.agents = view.agents.filter(agent => agent.kind !== "pet");
        if (!state || !g) return;
        const petId = state.pets?.assignments?.city;
        if (!petId) return;
        if (!(g.adventure?.collection?.[petId] > 0)) return;
        let icon = "🐾";
        try {
            if (typeof ZONE_PETS !== "undefined" && typeof petInfo === "function") {
                const info = petInfo(petId);
                if (info && ZONE_PETS[info.stage]?.[info.rarity]) icon = ZONE_PETS[info.stage][info.rarity][1];
            }
        } catch (_) { /* decorative only */ }
        view.agents.push({
            kind: "pet", survivorId: -1, icon,
            x: 0, y: 0, cell: { x: 0, y: 0 },
            path: null, step: 0, speed: 34, phase: 0, waitUntil: 0, retarget: true
        });
    }

    // Pick somewhere for an agent to walk: their workplace if they have one,
    // otherwise a random structure or road.
    function chooseDestination(agent) {
        const state = exp();
        if (!state) return null;
        const survivor = agent.kind === "survivor"
            ? state.survivors.roster.find(entry => entry.id === agent.survivorId)
            : null;

        if (survivor?.assignedTo) {
            const workplace = plotById(survivor.assignedTo);
            if (workplace) {
                // Loiter around the workplace rather than standing on it.
                const offset = Math.floor(hash2(agent.survivorId, view.frame, 13) * 4);
                const [dx, dy] = STEPS[offset];
                const target = { x: workplace.x + dx, y: workplace.y + dy };
                if (inGrid(target.x, target.y)) return target;
                return { x: workplace.x, y: workplace.y };
            }
        }
        const candidates = [];
        for (const plot of state.city.plots) candidates.push({ x: plot.x, y: plot.y });
        for (const road of state.city.roads) candidates.push({ x: road.x, y: road.y });
        if (!candidates.length) return null;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const offset = STEPS[Math.floor(Math.random() * STEPS.length)];
        const target = { x: pick.x + offset[0], y: pick.y + offset[1] };
        return inGrid(target.x, target.y) ? target : pick;
    }

    function retargetAgent(agent, now) {
        const destination = chooseDestination(agent);
        agent.retarget = false;
        if (!destination) { agent.path = null; agent.waitUntil = now + 1500; return; }

        // Try to route along roads: current cell -> nearest road -> road near
        // the destination -> destination.
        const fromRoad = nearestRoad(agent.cell.x, agent.cell.y);
        const toRoad = nearestRoad(destination.x, destination.y);
        let path = null;
        if (fromRoad && toRoad) {
            const middle = roadPath(fromRoad, toRoad);
            if (middle) path = [{ ...agent.cell }, ...middle, destination];
        }
        if (!path) path = [{ ...agent.cell }, destination];
        agent.path = path;
        agent.step = 1;
        agent.waitUntil = 0;
    }

    function updateAgents(deltaSeconds, now) {
        const state = exp();
        if (!state) return;
        if (!state.settings.showNpcs) return;
        for (const agent of view.agents) {
            if (agent.waitUntil > now) continue;
            if (agent.retarget || !agent.path || agent.step >= agent.path.length) {
                retargetAgent(agent, now);
                if (!agent.path) continue;
            }
            const next = agent.path[agent.step];
            if (!next) { agent.retarget = true; continue; }
            const target = cellToWorld(next.x, next.y);
            const dx = target.x - agent.x;
            const dy = target.y - agent.y;
            const distance = Math.hypot(dx, dy);
            const onRoad = roadGraph.cells.has(next.x + ":" + next.y);
            const speed = agent.speed * (onRoad ? 1.45 : 1);
            if (distance <= speed * deltaSeconds) {
                agent.x = target.x;
                agent.y = target.y;
                agent.cell = { x: next.x, y: next.y };
                agent.step++;
                if (agent.step >= agent.path.length) {
                    // Pause at the destination, then pick a new one.
                    agent.waitUntil = now + 1200 + Math.random() * 4200;
                    agent.retarget = true;
                }
            } else {
                agent.x += (dx / distance) * speed * deltaSeconds;
                agent.y += (dy / distance) * speed * deltaSeconds;
            }
        }
    }

    // ---------------------------------------------------------------
    // Environmental props and hidden discoveries
    //
    // Scattered wreckage, crates and old terminals. Most are scenery; a few
    // are clickable and hand the narrative module a discovery. Positions are
    // hashed from the cell, so they never move between sessions.
    // ---------------------------------------------------------------

    const PROP_KINDS = [
        { id: "wreck",    glyph: "wreck",    clickable: false },
        { id: "rock",     glyph: "rock",     clickable: false },
        { id: "shrub",    glyph: "shrub",    clickable: false },
        { id: "crate",    glyph: "crate",    clickable: true, reward: "salvage" },
        { id: "terminal", glyph: "terminal", clickable: true, reward: "discovery" },
        { id: "cache",    glyph: "cache",    clickable: true, reward: "research" }
    ];

    function buildProps() {
        const state = exp();
        if (!state) { view.props = []; return; }
        const unlocked = DISTRICTS.filter(districtUnlocked).map(d => d.id).join(",");
        const key = unlocked + "|" + theme().name;
        if (key === view.propsKey) return;
        view.propsKey = key;
        const props = [];
        for (let x = GRID.minX; x <= GRID.maxX; x++) {
            for (let y = GRID.minY; y <= GRID.maxY; y++) {
                const district = districtFor(x, y);
                if (!district) continue;
                const roll = hash2(x, y, 31);
                // Sparse: roughly one prop every twelve cells.
                if (roll > 0.085) continue;
                const kind = PROP_KINDS[Math.floor(hash2(x, y, 37) * PROP_KINDS.length)];
                props.push({
                    x, y, kind: kind.id, clickable: kind.clickable, reward: kind.reward,
                    key: "p" + x + "_" + y,
                    jitter: { x: (hash2(x, y, 43) - 0.5) * TILE_W * 0.3, y: (hash2(x, y, 47) - 0.5) * TILE_H * 0.3 }
                });
            }
        }
        view.props = props;
    }

    function propCollected(prop) {
        const state = exp();
        return !!state?.narrative.props[prop.key];
    }

    function collectProp(prop) {
        const state = exp();
        const g = liveGame();
        if (!state || !g || propCollected(prop)) return false;
        state.narrative.props[prop.key] = true;
        const world = cellToWorld(prop.x, prop.y);
        let message = "";
        if (prop.reward === "salvage") {
            const amount = Math.max(60, (typeof global.getSalvagePerSecond === "function" ? global.getSalvagePerSecond() : 10) * 18);
            g.salvage += amount;
            g.totalSalvage += amount;
            g.lifetimeSalvage += amount;
            message = "+" + fmt(amount) + " Salvage";
            floatText(world.x, world.y - 16, message, "#ffc247");
            EX().sfx("resourceGain");
        } else if (prop.reward === "research") {
            const amount = 6 + Math.floor(hash2(prop.x, prop.y, 59) * 10);
            state.research.points += amount;
            state.research.lifetimePoints += amount;
            message = "+" + amount + " Research";
            floatText(world.x, world.y - 16, message, "#65baff");
            EX().sfx("research");
        } else {
            message = "Recovered a data fragment";
            floatText(world.x, world.y - 16, "Data fragment", "#aa8cff");
            EX().sfx("discovery");
            EX().emit("city:discovery", { prop });
        }
        burst(world.x, world.y, "#ffc247", 12, 60);
        banner(message, "good");
        EX().logEvent("Searched the ruins: " + message.toLowerCase() + ".", "good");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        return true;
    }

    // ---------------------------------------------------------------
    // Day/night and weather
    //
    // One full day takes eight real minutes. Both are presentation only: they
    // never change production, so a player who turns them off is not giving
    // anything up.
    // ---------------------------------------------------------------

    const DAY_MS = 8 * 60 * 1000;

    function dayPhase() {
        const state = exp();
        if (!state || !state.settings.dayNight) return 0.3;   // permanent late afternoon
        return ((Date.now() % DAY_MS) / DAY_MS);
    }

    // 0 = full day, 1 = full night.
    function nightAmount() {
        const phase = dayPhase();
        // Smooth dusk/dawn either side of midnight at phase 0.75.
        return Math.pow(Math.max(0, Math.cos((phase - 0.75) * Math.PI * 2)) , 1.4);
    }

    function updateWeather(now) {
        const state = exp();
        if (!state) return;
        if (!state.settings.weather) {
            view.weather.target = 0;
            view.weather.kind = "clear";
        } else if (now > view.weather.until) {
            const options = theme().weather;
            view.weather.kind = options[Math.floor(Math.random() * options.length)];
            view.weather.until = now + 45000 + Math.random() * 90000;
            view.weather.target = view.weather.kind === "clear" ? 0 : 0.55 + Math.random() * 0.45;
            if (view.weather.kind === "rain" && Math.random() < 0.5) EX().sfx("thunder");
        }
        // Ease intensity so weather rolls in rather than snapping on.
        view.weather.intensity += (view.weather.target - view.weather.intensity) * 0.02;
    }

    // ---------------------------------------------------------------
    // Particles
    // ---------------------------------------------------------------

    function updateParticles(deltaSeconds) {
        for (let i = view.particles.length - 1; i >= 0; i--) {
            const particle = view.particles[i];
            particle.life += deltaSeconds * 1000;
            if (particle.life >= particle.ms) { view.particles.splice(i, 1); continue; }
            particle.x += particle.vx * deltaSeconds;
            particle.y += particle.vy * deltaSeconds;
            particle.vy += particle.gravity * deltaSeconds;
        }
        const now = performance.now();
        for (let i = view.floats.length - 1; i >= 0; i--) {
            if (now - view.floats[i].born >= view.floats[i].ms) view.floats.splice(i, 1);
        }
    }

    // Construction dust and chimney smoke, emitted from the structures
    // themselves so the city looks like it is working.
    function emitAmbientParticles(now) {
        const state = exp();
        if (!state || !EX().motionAllowed()) return;
        const quality = EX().quality();
        if (quality === "low") return;
        if (view.particles.length > 260) return;
        for (const plot of state.city.plots) {
            const def = buildings()[plot.type];
            if (!def) continue;
            if (plot.constructing) {
                if (Math.random() < 0.08) {
                    const world = cellToWorld(plot.x, plot.y);
                    view.particles.push({
                        x: world.x + (Math.random() - 0.5) * 30, y: world.y,
                        vx: (Math.random() - 0.5) * 12, vy: -16 - Math.random() * 14,
                        life: 0, ms: 900, color: "rgba(200,190,170,.5)",
                        size: 2 + Math.random() * 3, gravity: -4
                    });
                }
                continue;
            }
            const smokes = plot.type === "power" || plot.type === "workshop" || plot.type === "lab";
            if (smokes && Math.random() < 0.05) {
                const world = cellToWorld(plot.x, plot.y);
                view.particles.push({
                    x: world.x + 6, y: world.y - 34 * plot.level * 0.3 - 20,
                    vx: 4 + Math.random() * 6, vy: -12 - Math.random() * 10,
                    life: 0, ms: 1600, color: "rgba(170,175,185,.33)",
                    size: 3 + Math.random() * 4, gravity: -6
                });
            }
        }
    }

    // ---------------------------------------------------------------
    // Simulation tick (1/s, driven by the expansion layer)
    // ---------------------------------------------------------------

    function tick(elapsedMs, stamp) {
        const state = exp();
        if (!state) return;
        state.city.lastTick = stamp;

        // Finish construction. Done here rather than in the render loop so it
        // still completes while the player is on another tab.
        let finished = 0;
        for (const plot of state.city.plots) {
            if (plot.constructing && plot.constructing.until <= stamp) {
                plot.constructing = null;
                plot.upgrading = false;
                finished++;
                const world = cellToWorld(plot.x, plot.y);
                burst(world.x, world.y, "#5bd69b", 12, 50);
            }
        }
        if (finished) {
            EX().sfx("constructionDone");
            if (typeof global.updateGame === "function") global.updateGame();
            EX().save();
        }

        syncRoster();
        syncAgents();

        // Morale drifts toward a target set by food, security and clinics.
        const stats = EX().cityStats();
        const target = Math.max(10, Math.min(100,
            60 + (stats.fed ? 14 : -26) + (stats.powered ? 6 : -14) +
            Math.min(16, stats.security * 0.4) + Math.min(18, stats.moraleSupport * 0.4)));
        for (const survivor of state.survivors.roster) {
            survivor.morale += (target - survivor.morale) * 0.05;
            survivor.morale = Math.max(0, Math.min(100, survivor.morale));
        }

        emitAmbientParticles(stamp);
    }

    // Damage the city, called by the combat module when a raid gets through.
    function applyRaidDamage(amount) {
        const state = exp();
        if (!state || !state.city.plots.length) return 0;
        let remaining = Math.max(0, amount);
        let hits = 0;
        // Walls and turrets take the hit first — that is what they are for.
        const order = [...state.city.plots].sort((a, b) => {
            const weight = plot => (buildings()[plot.type]?.combatValue ? 0 : 1);
            return weight(a) - weight(b);
        });
        for (const plot of order) {
            if (remaining <= 0) break;
            if (plot.hp <= 0) continue;
            const take = Math.min(plot.hp, remaining, 45);
            plot.hp -= take;
            remaining -= take;
            hits++;
            const world = cellToWorld(plot.x, plot.y);
            burst(world.x, world.y, "#ff8b35", 8, 60);
        }
        if (hits) {
            EX().logEvent("Raid damaged " + hits + " structure" + (hits === 1 ? "" : "s") + ". Repair them in the City tab.", "bad");
            EX().save();
        }
        return hits;
    }

    // ---------------------------------------------------------------
    // Drawing helpers
    //
    // Everything is drawn as isometric prisms built from three shaded faces,
    // then detailed per roof style. No bitmaps, so the city is sharp at every
    // zoom level and on every pixel density.
    // ---------------------------------------------------------------

    function shade(hex, amount) {
        const value = String(hex || "#888888").replace("#", "");
        const full = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
        const num = parseInt(full, 16);
        if (!Number.isFinite(num)) return hex;
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        if (amount >= 0) {
            r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
        } else {
            r *= 1 + amount; g *= 1 + amount; b *= 1 + amount;
        }
        return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
    }

    function blockCenter(plot, size) {
        return cellToWorld(plot.x + (size - 1) / 2, plot.y + (size - 1) / 2);
    }

    function diamond(ctx, cx, cy, hw, hh) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - hh);
        ctx.lineTo(cx + hw, cy);
        ctx.lineTo(cx, cy + hh);
        ctx.lineTo(cx - hw, cy);
        ctx.closePath();
    }

    // An isometric box. `height` is in screen pixels at the current scale.
    function prism(ctx, cx, cy, hw, hh, height, palette, options = {}) {
        const top = cy - height;
        // Left face
        ctx.fillStyle = options.left || palette[0];
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy);
        ctx.lineTo(cx, cy + hh);
        ctx.lineTo(cx, cy + hh - height);
        ctx.lineTo(cx - hw, cy - height);
        ctx.closePath();
        ctx.fill();
        // Right face
        ctx.fillStyle = options.right || palette[1];
        ctx.beginPath();
        ctx.moveTo(cx, cy + hh);
        ctx.lineTo(cx + hw, cy);
        ctx.lineTo(cx + hw, cy - height);
        ctx.lineTo(cx, cy + hh - height);
        ctx.closePath();
        ctx.fill();
        // Top face
        ctx.fillStyle = options.top || palette[2];
        diamond(ctx, cx, top, hw, hh);
        ctx.fill();
        return top;
    }

    function litWindows(ctx, cx, cy, hw, hh, height, scale, night, seed, accent) {
        if (height < 10 * scale) return;
        const rows = Math.max(1, Math.floor(height / (11 * scale)));
        const columns = Math.max(1, Math.floor(hw / (9 * scale)));
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const on = hash2(seed + row * 31, column * 17, 101) < (night > 0.35 ? 0.72 : 0.12);
                if (!on) continue;
                ctx.fillStyle = night > 0.35
                    ? "rgba(255,214,140," + (0.5 + night * 0.45).toFixed(2) + ")"
                    : "rgba(120,160,200,.28)";
                const px = cx - hw * 0.62 + column * (hw / columns) * 0.95;
                const py = cy - height + 6 * scale + row * (height / rows) * 0.9;
                ctx.fillRect(px, py + hh * 0.35, Math.max(1.4, 3.6 * scale), Math.max(1.6, 4.4 * scale));
                const rpx = cx + hw * 0.1 + column * (hw / columns) * 0.8;
                ctx.fillRect(rpx, py + hh * 0.1, Math.max(1.4, 3.6 * scale), Math.max(1.6, 4.4 * scale));
            }
        }
        if (night > 0.5 && accent) {
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.5 * night;
            ctx.fillRect(cx - 1.5 * scale, cy - height - 3 * scale, 3 * scale, 3 * scale);
            ctx.globalAlpha = 1;
        }
    }

    // The per-type silhouettes. Each receives the footprint diamond and draws
    // its own body, so a turret reads as a turret and a farm as a farm even at
    // low zoom.
    function drawStructure(ctx, plot, def, scale, night, time) {
        const size = def.footprint || 1;
        const center = blockCenter(plot, size);
        const screen = worldToScreen(center.x, center.y);
        const hw = (size * TILE_W / 2) * view.camera.zoom * 0.92;
        const hh = (size * TILE_H / 2) * view.camera.zoom * 0.92;
        const palette = def.palette || ["#444", "#666", "#888"];
        const levelBoost = 1 + (plot.level - 1) * 0.16;
        const health = Math.max(0, Math.min(1, plot.hp / 100));
        const seed = plot.x * 7 + plot.y * 13 + plot.id;
        const accent = theme().accent;
        const roof = def.roof || "flat";

        // Ground shadow — sells the sense that the building sits on the plot.
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#000";
        diamond(ctx, screen.x + 3 * scale, screen.y + 3 * scale, hw * 0.96, hh * 0.96);
        ctx.fill();
        ctx.restore();

        // Construction site: scaffold, tarp and a progress ring.
        if (plot.constructing) {
            const span = Math.max(1, plot.constructing.until - plot.constructing.started);
            const progress = Math.max(0, Math.min(1, (Date.now() - plot.constructing.started) / span));
            const height = 10 * scale + 46 * scale * progress * levelBoost;
            prism(ctx, screen.x, screen.y, hw * 0.8, hh * 0.8, height, ["#2c2a26", "#3a3730", "#4a463c"]);
            // Scaffolding uprights
            ctx.strokeStyle = "rgba(255,194,71,.65)";
            ctx.lineWidth = Math.max(1, 1.6 * scale);
            for (const sx of [-hw * 0.7, 0, hw * 0.7]) {
                ctx.beginPath();
                ctx.moveTo(screen.x + sx, screen.y + hh * 0.3);
                ctx.lineTo(screen.x + sx, screen.y - height - 6 * scale);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(screen.x - hw * 0.8, screen.y - height * 0.55);
            ctx.lineTo(screen.x + hw * 0.8, screen.y - height * 0.55 - hh * 0.2);
            ctx.stroke();
            // Crane arm, swinging while it works
            const swing = Math.sin(time * 0.0012 + seed) * 0.35;
            ctx.save();
            ctx.translate(screen.x, screen.y - height - 8 * scale);
            ctx.rotate(swing * 0.4);
            ctx.strokeStyle = "rgba(255,160,90,.8)";
            ctx.lineWidth = Math.max(1, 2 * scale);
            ctx.beginPath();
            ctx.moveTo(-hw * 0.5, 0);
            ctx.lineTo(hw * 0.6, -6 * scale);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(hw * 0.5, -5 * scale);
            ctx.lineTo(hw * 0.5, 10 * scale);
            ctx.stroke();
            ctx.restore();
            // Progress ring
            const radius = Math.max(9, 13 * scale);
            ctx.save();
            ctx.translate(screen.x, screen.y - height - 22 * scale);
            ctx.strokeStyle = "rgba(0,0,0,.55)";
            ctx.lineWidth = Math.max(2.5, 4 * scale);
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = plot.constructing.upgrade ? "#ffc247" : "#5bd69b";
            ctx.beginPath();
            ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
            ctx.restore();
            return;
        }

        const baseHeight = {
            tent: 22, pitched: 30, flat: 34, industrial: 40, tower: 68,
            greenhouse: 20, dome: 24, turret: 34, wall: 16, lab: 38, antenna: 30
        }[roof] || 30;
        const height = baseHeight * scale * levelBoost;

        // Damaged buildings lean and darken.
        ctx.save();
        if (health < 1) {
            ctx.translate(screen.x, screen.y);
            ctx.rotate((1 - health) * 0.05);
            ctx.translate(-screen.x, -screen.y);
        }
        const dim = health < 1 ? -0.3 * (1 - health) : 0;
        const body = palette.map(color => shade(color, dim));

        if (roof === "wall") {
            prism(ctx, screen.x, screen.y, hw * 0.92, hh * 0.92, height, body);
            ctx.fillStyle = shade(body[2], -0.18);
            for (let i = -1; i <= 1; i++) {
                ctx.fillRect(screen.x + i * hw * 0.5 - 2 * scale, screen.y - height - hh * 0.2, 4 * scale, 5 * scale);
            }
        } else if (roof === "tent") {
            // Canvas tent: a low prism with a triangular cap.
            const top = prism(ctx, screen.x, screen.y, hw * 0.78, hh * 0.78, height * 0.45, body);
            ctx.fillStyle = shade(palette[2], 0.08 + dim);
            ctx.beginPath();
            ctx.moveTo(screen.x - hw * 0.8, top + hh * 0.1);
            ctx.lineTo(screen.x, top - height * 0.75);
            ctx.lineTo(screen.x + hw * 0.8, top + hh * 0.1);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,.25)";
            ctx.beginPath();
            ctx.moveTo(screen.x, top - height * 0.75);
            ctx.lineTo(screen.x + hw * 0.8, top + hh * 0.1);
            ctx.lineTo(screen.x, top + hh * 0.5);
            ctx.closePath();
            ctx.fill();
            // Campfire glow at night
            if (night > 0.3) {
                const flicker = 0.5 + Math.sin(time * 0.008 + seed) * 0.2;
                const glow = ctx.createRadialGradient(screen.x + hw * 0.5, screen.y + hh * 0.2, 0, screen.x + hw * 0.5, screen.y + hh * 0.2, 18 * scale);
                glow.addColorStop(0, "rgba(255,150,60," + (0.55 * night * flicker).toFixed(2) + ")");
                glow.addColorStop(1, "rgba(255,150,60,0)");
                ctx.fillStyle = glow;
                ctx.fillRect(screen.x + hw * 0.5 - 20 * scale, screen.y + hh * 0.2 - 20 * scale, 40 * scale, 40 * scale);
            }
        } else if (roof === "pitched") {
            const top = prism(ctx, screen.x, screen.y, hw * 0.84, hh * 0.84, height, body);
            ctx.fillStyle = shade(palette[2], 0.12 + dim);
            ctx.beginPath();
            ctx.moveTo(screen.x - hw * 0.86, top);
            ctx.lineTo(screen.x, top - hh - height * 0.3);
            ctx.lineTo(screen.x + hw * 0.86, top);
            ctx.lineTo(screen.x, top + hh);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,.22)";
            ctx.beginPath();
            ctx.moveTo(screen.x, top - hh - height * 0.3);
            ctx.lineTo(screen.x + hw * 0.86, top);
            ctx.lineTo(screen.x, top + hh);
            ctx.closePath();
            ctx.fill();
            litWindows(ctx, screen.x, screen.y, hw * 0.84, hh * 0.84, height, scale, night, seed, accent);
        } else if (roof === "tower") {
            // Stepped tower: three shrinking prisms.
            let currentY = screen.y, currentHw = hw * 0.9, currentHh = hh * 0.9;
            for (let tier = 0; tier < 3; tier++) {
                const tierHeight = height * (0.5 - tier * 0.11);
                const top = prism(ctx, screen.x, currentY, currentHw, currentHh, tierHeight,
                    [shade(body[0], tier * 0.05), shade(body[1], tier * 0.05), shade(body[2], tier * 0.06)]);
                litWindows(ctx, screen.x, currentY, currentHw, currentHh, tierHeight, scale, night, seed + tier * 13, accent);
                currentY = top;
                currentHw *= 0.68; currentHh *= 0.68;
            }
            // Aerial with a blinking beacon
            ctx.strokeStyle = shade(palette[2], 0.3);
            ctx.lineWidth = Math.max(1, 1.8 * scale);
            ctx.beginPath();
            ctx.moveTo(screen.x, currentY);
            ctx.lineTo(screen.x, currentY - 16 * scale);
            ctx.stroke();
            const blink = (Math.sin(time * 0.004 + seed) + 1) / 2;
            ctx.fillStyle = "rgba(255,90,70," + (0.35 + blink * 0.65).toFixed(2) + ")";
            ctx.beginPath();
            ctx.arc(screen.x, currentY - 17 * scale, Math.max(1.5, 2.6 * scale), 0, Math.PI * 2);
            ctx.fill();
        } else if (roof === "industrial") {
            const top = prism(ctx, screen.x, screen.y, hw * 0.9, hh * 0.9, height, body);
            // Sawtooth roof
            ctx.fillStyle = shade(palette[2], 0.1 + dim);
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(screen.x - hw * 0.8 + i * hw * 0.55, top + hh * 0.2);
                ctx.lineTo(screen.x - hw * 0.5 + i * hw * 0.55, top - 9 * scale);
                ctx.lineTo(screen.x - hw * 0.2 + i * hw * 0.55, top + hh * 0.05);
                ctx.closePath();
                ctx.fill();
            }
            // Chimney
            ctx.fillStyle = shade(palette[0], -0.1);
            ctx.fillRect(screen.x + hw * 0.4, top - 24 * scale, 7 * scale, 26 * scale);
            ctx.fillStyle = shade(palette[2], 0.2);
            ctx.fillRect(screen.x + hw * 0.4, top - 26 * scale, 7 * scale, 3 * scale);
            litWindows(ctx, screen.x, screen.y, hw * 0.9, hh * 0.9, height, scale, night, seed, accent);
        } else if (roof === "greenhouse") {
            prism(ctx, screen.x, screen.y, hw * 0.9, hh * 0.9, height * 0.4, body);
            // Glazed barrel roof
            const top = screen.y - height * 0.4;
            const gradient = ctx.createLinearGradient(screen.x - hw, top - hh, screen.x + hw, top + hh);
            gradient.addColorStop(0, "rgba(150,230,170,.55)");
            gradient.addColorStop(0.5, "rgba(210,255,225,.75)");
            gradient.addColorStop(1, "rgba(110,190,140,.5)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(screen.x - hw * 0.9, top);
            ctx.quadraticCurveTo(screen.x, top - height * 0.85, screen.x + hw * 0.9, top);
            ctx.lineTo(screen.x, top + hh * 0.9);
            ctx.closePath();
            ctx.fill();
            // Crop rows
            ctx.strokeStyle = "rgba(60,120,60,.6)";
            ctx.lineWidth = Math.max(1, 1.2 * scale);
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(screen.x + i * hw * 0.3, top + hh * 0.2);
                ctx.lineTo(screen.x + i * hw * 0.3 + hw * 0.2, top - height * 0.25);
                ctx.stroke();
            }
        } else if (roof === "dome") {
            prism(ctx, screen.x, screen.y, hw * 0.78, hh * 0.78, height * 0.5, body);
            const top = screen.y - height * 0.5;
            ctx.fillStyle = shade(palette[2], 0.14 + dim);
            ctx.beginPath();
            ctx.ellipse(screen.x, top, hw * 0.8, hh * 1.5, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            // Water surface, rippling
            ctx.fillStyle = "rgba(110,190,220,.45)";
            ctx.beginPath();
            ctx.ellipse(screen.x, top - 1 * scale, hw * 0.52, hh * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(220,245,255,.4)";
            ctx.lineWidth = Math.max(0.8, 1 * scale);
            const ripple = (Math.sin(time * 0.003 + seed) + 1) / 2;
            ctx.beginPath();
            ctx.ellipse(screen.x, top - 1 * scale, hw * 0.2 + hw * 0.3 * ripple, (hh * 0.2 + hh * 0.3 * ripple) * 0.9, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (roof === "turret") {
            prism(ctx, screen.x, screen.y, hw * 0.72, hh * 0.72, height * 0.55, body);
            const top = screen.y - height * 0.55;
            // Rotating gun housing
            ctx.save();
            ctx.translate(screen.x, top);
            const sweep = Math.sin(time * 0.0009 + seed) * 0.9;
            ctx.fillStyle = shade(palette[2], 0.1);
            diamond(ctx, 0, 0, hw * 0.5, hh * 0.5);
            ctx.fill();
            ctx.strokeStyle = shade(palette[2], 0.35);
            ctx.lineWidth = Math.max(1.6, 3 * scale);
            ctx.beginPath();
            ctx.moveTo(0, -2 * scale);
            ctx.lineTo(Math.cos(sweep) * hw * 0.85, -2 * scale + Math.sin(sweep) * hh * 0.7);
            ctx.stroke();
            ctx.restore();
            if (night > 0.3) {
                ctx.fillStyle = "rgba(255,90,90," + (0.4 + night * 0.4).toFixed(2) + ")";
                ctx.beginPath();
                ctx.arc(screen.x, top - 4 * scale, Math.max(1.3, 2.2 * scale), 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (roof === "lab") {
            const top = prism(ctx, screen.x, screen.y, hw * 0.88, hh * 0.88, height, body);
            // Glass upper storey
            ctx.fillStyle = "rgba(120,180,230,.4)";
            diamond(ctx, screen.x, top - 10 * scale, hw * 0.6, hh * 0.6);
            ctx.fill();
            ctx.strokeStyle = "rgba(190,225,255,.6)";
            ctx.lineWidth = Math.max(0.8, 1.1 * scale);
            ctx.stroke();
            // Pulsing data column
            const pulse = (Math.sin(time * 0.005 + seed) + 1) / 2;
            ctx.fillStyle = "rgba(101,186,255," + (0.3 + pulse * 0.5).toFixed(2) + ")";
            ctx.fillRect(screen.x - 2 * scale, top - 26 * scale, 4 * scale, 18 * scale);
            litWindows(ctx, screen.x, screen.y, hw * 0.88, hh * 0.88, height, scale, night, seed, accent);
        } else if (roof === "antenna") {
            prism(ctx, screen.x, screen.y, hw * 0.6, hh * 0.6, height * 0.4, body);
            const top = screen.y - height * 0.4;
            // Lattice mast
            ctx.strokeStyle = shade(palette[2], 0.25);
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            const mast = 40 * scale * levelBoost;
            ctx.beginPath();
            ctx.moveTo(screen.x - 5 * scale, top);
            ctx.lineTo(screen.x, top - mast);
            ctx.lineTo(screen.x + 5 * scale, top);
            ctx.stroke();
            for (let i = 1; i < 4; i++) {
                const y = top - (mast / 4) * i;
                const width = 5 * scale * (1 - i / 4.5);
                ctx.beginPath();
                ctx.moveTo(screen.x - width, y);
                ctx.lineTo(screen.x + width, y);
                ctx.stroke();
            }
            // Sweeping signal arc
            const sweep = (time * 0.0015 + seed) % (Math.PI * 2);
            ctx.strokeStyle = "rgba(170,140,255,.55)";
            ctx.lineWidth = Math.max(1, 1.8 * scale);
            ctx.beginPath();
            ctx.arc(screen.x, top - mast, 10 * scale, sweep, sweep + 1.1);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,120,110,.9)";
            ctx.beginPath();
            ctx.arc(screen.x, top - mast - 2 * scale, Math.max(1.2, 2 * scale), 0, Math.PI * 2);
            ctx.fill();
        } else {
            // flat
            const top = prism(ctx, screen.x, screen.y, hw * 0.88, hh * 0.88, height, body);
            ctx.fillStyle = shade(palette[2], -0.12);
            diamond(ctx, screen.x, top, hw * 0.6, hh * 0.6);
            ctx.fill();
            // Rooftop units
            ctx.fillStyle = shade(palette[0], 0.1);
            ctx.fillRect(screen.x - hw * 0.3, top - 7 * scale, 10 * scale, 7 * scale);
            litWindows(ctx, screen.x, screen.y, hw * 0.88, hh * 0.88, height, scale, night, seed, accent);
        }

        ctx.restore();

        // Damage smoke and cracks
        if (health < 0.9) {
            ctx.save();
            ctx.globalAlpha = 0.5 * (1 - health);
            ctx.strokeStyle = "#1a0f0c";
            ctx.lineWidth = Math.max(1, 1.4 * scale);
            ctx.beginPath();
            ctx.moveTo(screen.x - hw * 0.3, screen.y - height * 0.2);
            ctx.lineTo(screen.x - hw * 0.1, screen.y - height * 0.5);
            ctx.lineTo(screen.x + hw * 0.1, screen.y - height * 0.3);
            ctx.stroke();
            ctx.restore();
        }

        // Level pips
        if (plot.level > 1 && view.camera.zoom > 0.7) {
            const pips = Math.min(plot.level, MAX_PLOT_LEVEL);
            for (let i = 0; i < pips; i++) {
                ctx.fillStyle = "#ffc247";
                ctx.fillRect(screen.x - pips * 2.2 * scale + i * 4.4 * scale, screen.y + hh * 0.55, 3 * scale, 3 * scale);
            }
        }

        // Unfilled-jobs marker, so a player can see at a glance which
        // buildings are standing idle.
        const state = exp();
        if (state && view.camera.zoom > 0.65 && Object.keys(def.jobs || {}).length) {
            const need = Object.entries(def.jobs).reduce((sum, [, count]) => sum + count * plot.level, 0);
            const have = state.survivors.roster.filter(entry => entry.assignedTo === plot.id).length;
            if (have < need) {
                const bob = Math.sin(time * 0.004 + seed) * 2 * scale;
                ctx.fillStyle = "rgba(255,194,71,.92)";
                ctx.font = Math.round(13 * scale) + "px Inter, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("!", screen.x + hw * 0.7, screen.y - height - 10 * scale + bob);
            }
        }

        // Selection ring
        if (view.selectedPlot === plot.id) {
            ctx.strokeStyle = "#5eeaff";
            ctx.lineWidth = Math.max(1.5, 2.2 * scale);
            diamond(ctx, screen.x, screen.y, hw, hh);
            ctx.stroke();
        }
    }

    function drawProp(ctx, prop, scale, night, time) {
        const world = cellToWorld(prop.x, prop.y);
        const screen = worldToScreen(world.x + prop.jitter.x, world.y + prop.jitter.y);
        const collected = propCollected(prop);
        const size = 7 * scale;
        ctx.save();
        if (prop.kind === "rock") {
            ctx.fillStyle = theme().rock;
            ctx.beginPath();
            ctx.ellipse(screen.x, screen.y, size * 1.1, size * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = shade(theme().rock, 0.12);
            ctx.beginPath();
            ctx.ellipse(screen.x - size * 0.2, screen.y - size * 0.25, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (prop.kind === "shrub") {
            ctx.fillStyle = theme().grass;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.ellipse(screen.x + (i - 1) * size * 0.5, screen.y - size * 0.2, size * 0.5, size * 0.45, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (prop.kind === "wreck") {
            ctx.fillStyle = "#3a3230";
            ctx.fillRect(screen.x - size, screen.y - size * 0.7, size * 2, size * 0.9);
            ctx.fillStyle = "#4d423d";
            ctx.fillRect(screen.x - size * 0.6, screen.y - size * 1.2, size * 1.1, size * 0.6);
            ctx.fillStyle = "#211b19";
            ctx.beginPath();
            ctx.arc(screen.x - size * 0.6, screen.y + size * 0.2, size * 0.3, 0, Math.PI * 2);
            ctx.arc(screen.x + size * 0.6, screen.y + size * 0.2, size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        } else if (prop.kind === "crate") {
            ctx.globalAlpha = collected ? 0.35 : 1;
            prism(ctx, screen.x, screen.y, size, size * 0.5, size * 1.1, ["#5a4426", "#7a5d33", "#9c7840"]);
            if (!collected) {
                ctx.strokeStyle = "rgba(255,194,71,.8)";
                ctx.lineWidth = Math.max(1, 1.2 * scale);
                diamond(ctx, screen.x, screen.y, size * 1.3, size * 0.7);
                ctx.stroke();
            }
        } else if (prop.kind === "terminal") {
            ctx.globalAlpha = collected ? 0.35 : 1;
            prism(ctx, screen.x, screen.y, size * 0.7, size * 0.35, size * 1.5, ["#243040", "#2f4055", "#3d5570"]);
            const blink = (Math.sin(time * 0.006 + prop.x) + 1) / 2;
            ctx.fillStyle = collected ? "rgba(120,140,160,.5)" : "rgba(101,186,255," + (0.4 + blink * 0.6).toFixed(2) + ")";
            ctx.fillRect(screen.x - size * 0.3, screen.y - size * 1.5, size * 0.6, size * 0.5);
        } else {
            ctx.globalAlpha = collected ? 0.35 : 1;
            prism(ctx, screen.x, screen.y, size * 0.8, size * 0.4, size * 0.8, ["#3a2d4a", "#4c3b61", "#634f7d"]);
            if (!collected) {
                const pulse = (Math.sin(time * 0.004 + prop.y) + 1) / 2;
                ctx.fillStyle = "rgba(170,140,255," + (0.35 + pulse * 0.5).toFixed(2) + ")";
                ctx.beginPath();
                ctx.arc(screen.x, screen.y - size * 1.1, size * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function drawAgent(ctx, agent, scale, night, time) {
        const state = exp();
        const screen = worldToScreen(agent.x, agent.y);
        const bob = Math.sin(time * 0.006 + agent.phase) * 1.6 * scale;
        if (agent.kind === "pet") {
            ctx.font = Math.round(15 * scale) + "px serif";
            ctx.textAlign = "center";
            ctx.fillText(agent.icon, screen.x, screen.y + bob);
            return;
        }
        const survivor = state?.survivors.roster.find(entry => entry.id === agent.survivorId);
        const role = survivor && jobsTable()[survivor.role] ? survivor.role : "idle";
        const color = jobsTable()[role]?.color || "#7d8794";
        const height = 11 * scale;
        // Shadow
        ctx.fillStyle = "rgba(0,0,0,.33)";
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + 2 * scale, 3.4 * scale, 1.7 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = color;
        ctx.fillRect(screen.x - 1.9 * scale, screen.y - height + bob, 3.8 * scale, height * 0.72);
        // Head
        ctx.fillStyle = shade(color, 0.26);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - height - 1.4 * scale + bob, 2.2 * scale, 0, Math.PI * 2);
        ctx.fill();
        // Lamp at night, so citizens stay visible after dark
        if (night > 0.45) {
            const glow = ctx.createRadialGradient(screen.x, screen.y - height * 0.6, 0, screen.x, screen.y - height * 0.6, 13 * scale);
            glow.addColorStop(0, "rgba(255,210,140," + (0.3 * night).toFixed(2) + ")");
            glow.addColorStop(1, "rgba(255,210,140,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(screen.x - 14 * scale, screen.y - height * 0.6 - 14 * scale, 28 * scale, 28 * scale);
        }
    }

    // ---------------------------------------------------------------
    // Scene
    // ---------------------------------------------------------------

    // The distant skyline is the one thing that is cached: it is parallaxed
    // but never changes shape, so it is drawn once per theme and size.
    function buildSkyline() {
        const key = theme().name + ":" + Math.round(view.width) + "x" + Math.round(view.height);
        if (key === view.skylineKey && view.skyline) return;
        const width = Math.max(320, Math.round(view.width));
        const height = Math.max(120, Math.round(view.height * 0.45));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const current = theme();
        // Three parallax bands, each darker and taller than the last.
        for (let band = 0; band < 3; band++) {
            const alpha = 0.26 + band * 0.22;
            ctx.fillStyle = "rgba(8,12,20," + alpha.toFixed(2) + ")";
            let x = -40;
            let index = 0;
            while (x < width + 40) {
                const w = 24 + hash2(band * 31 + index, 3, 17) * 54;
                const h = (18 + hash2(band * 17 + index, 7, 23) * 70) * (1 + band * 0.45);
                ctx.fillRect(x, height - h, w, h);
                // Occasional lit window strip
                if (hash2(index, band, 29) < 0.3) {
                    ctx.fillStyle = "rgba(255,190,110,.1)";
                    ctx.fillRect(x + w * 0.3, height - h * 0.8, Math.max(1, w * 0.15), h * 0.5);
                    ctx.fillStyle = "rgba(8,12,20," + alpha.toFixed(2) + ")";
                }
                x += w + 6 + hash2(index, band, 11) * 18;
                index++;
            }
        }
        // A broken overpass silhouette for the foreground band
        ctx.strokeStyle = "rgba(10,14,22,.75)";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-20, height - 30);
        ctx.lineTo(width * 0.42, height - 44);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(width * 0.58, height - 52);
        ctx.lineTo(width + 20, height - 34);
        ctx.stroke();
        void current;
        view.skyline = canvas;
        view.skylineKey = key;
    }

    function drawSky(ctx, night) {
        const current = theme();
        const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
        const mix = (color, amount) => shade(color, -amount * 0.55);
        gradient.addColorStop(0, mix(current.sky[0], night));
        gradient.addColorStop(0.55, mix(current.sky[1], night * 0.8));
        gradient.addColorStop(1, mix(current.sky[2], night * 0.6));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, view.width, view.height);

        // Stars, fading in after dusk.
        if (night > 0.15) {
            const count = Math.round(70 * current.star);
            ctx.save();
            for (let i = 0; i < count; i++) {
                const sx = hash2(i, 5, 61) * view.width;
                const sy = hash2(i, 9, 67) * view.height * 0.5;
                const twinkle = 0.4 + 0.6 * ((Math.sin(view.time * 0.001 + i) + 1) / 2);
                ctx.globalAlpha = (night - 0.15) * twinkle * 0.9;
                ctx.fillStyle = "#e8f2ff";
                ctx.fillRect(sx, sy, 1.4, 1.4);
            }
            ctx.restore();
        }

        // Sun / moon, tracking the day phase.
        const phase = dayPhase();
        const arc = (phase - 0.25) * Math.PI * 2;
        const bodyX = view.width * (0.5 + Math.cos(arc + Math.PI) * 0.42);
        const bodyY = view.height * 0.42 - Math.sin(arc + Math.PI) * view.height * 0.3;
        const isMoon = night > 0.5;
        const radius = isMoon ? 13 : 19;
        const glow = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, radius * 5);
        glow.addColorStop(0, isMoon ? "rgba(200,220,255,.55)" : "rgba(255,210,150,.6)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(bodyX - radius * 5, bodyY - radius * 5, radius * 10, radius * 10);
        ctx.fillStyle = isMoon ? "#dce6ff" : "#ffd9a0";
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Parallax skyline
        buildSkyline();
        if (view.skyline) {
            const offsetX = -view.camera.x * 0.06;
            const offsetY = view.height - view.skyline.height - view.camera.y * 0.03 + 40;
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.drawImage(view.skyline, offsetX % view.skyline.width, offsetY);
            ctx.drawImage(view.skyline, (offsetX % view.skyline.width) + view.skyline.width, offsetY);
            ctx.drawImage(view.skyline, (offsetX % view.skyline.width) - view.skyline.width, offsetY);
            ctx.restore();
        }

        // Atmospheric haze over the horizon
        ctx.fillStyle = current.haze;
        ctx.fillRect(0, view.height * 0.3, view.width, view.height * 0.45);
    }

    // Only the cells that can actually be seen are drawn, so the cost of a
    // frame is bounded by the viewport rather than by the size of the map.
    function visibleCellRange() {
        const corners = [
            screenToWorld(0, 0), screenToWorld(view.width, 0),
            screenToWorld(0, view.height), screenToWorld(view.width, view.height)
        ].map(point => worldToCell(point.x, point.y));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cell of corners) {
            minX = Math.min(minX, cell.x); maxX = Math.max(maxX, cell.x);
            minY = Math.min(minY, cell.y); maxY = Math.max(maxY, cell.y);
        }
        return {
            minX: Math.max(GRID.minX, Math.floor(minX) - 2),
            maxX: Math.min(GRID.maxX, Math.ceil(maxX) + 2),
            minY: Math.max(GRID.minY, Math.floor(minY) - 2),
            maxY: Math.min(GRID.maxY, Math.ceil(maxY) + 2)
        };
    }

    function drawGround(ctx, scale, night) {
        const state = exp();
        const current = theme();
        const range = visibleCellRange();
        const hw = (TILE_W / 2) * view.camera.zoom;
        const hh = (TILE_H / 2) * view.camera.zoom;
        const showGrid = state?.settings.showGrid !== false && view.camera.zoom > 0.6;

        for (let x = range.minX; x <= range.maxX; x++) {
            for (let y = range.minY; y <= range.maxY; y++) {
                const district = districtFor(x, y);
                if (!district) continue;
                const world = cellToWorld(x, y);
                const screen = worldToScreen(world.x, world.y);
                if (screen.x < -hw * 2 || screen.x > view.width + hw * 2) continue;
                if (screen.y < -hh * 4 || screen.y > view.height + hh * 6) continue;

                const unlocked = districtUnlocked(district);
                const variant = Math.floor(hash2(x, y, 3) * current.ground.length);
                let fill = current.ground[variant];
                if (hash2(x, y, 13) < 0.12) fill = current.grass;
                // A gentle per-tile lift/dip widens the tonal range so the
                // ground reads as terrain rather than one flat colour.
                fill = shade(fill, (hash2(x, y, 23) - 0.5) * 0.14);
                if (!unlocked) fill = shade(fill, -0.45);

                ctx.fillStyle = night > 0 ? shade(fill, -night * 0.38) : fill;
                diamond(ctx, screen.x, screen.y, hw, hh);
                ctx.fill();

                if (roadAt(x, y)) {
                    // Paved surface, lifted clearly off the ground colour so a
                    // road network reads at a glance even at low zoom.
                    ctx.fillStyle = shade("#5a626e", -night * 0.34);
                    diamond(ctx, screen.x, screen.y, hw, hh);
                    ctx.fill();
                    ctx.fillStyle = shade("#464d57", -night * 0.34);
                    diamond(ctx, screen.x, screen.y, hw * 0.82, hh * 0.82);
                    ctx.fill();
                    // Connection-aware markings: a stub is drawn toward every
                    // neighbouring road, so a straight run reads as a
                    // continuous line and a junction reads as a junction.
                    const links = [
                        [1, 0, roadAt(x + 1, y)], [-1, 0, roadAt(x - 1, y)],
                        [0, 1, roadAt(x, y + 1)], [0, -1, roadAt(x, y - 1)]
                    ].filter(entry => entry[2]);
                    ctx.strokeStyle = "rgba(236,222,166,.42)";
                    ctx.lineWidth = Math.max(1, 1.3 * scale);
                    ctx.setLineDash([Math.max(2, 4 * scale), Math.max(2, 4 * scale)]);
                    if (links.length) {
                        for (const [dx, dy] of links) {
                            // Half a tile toward the neighbour, in iso space.
                            const ex = (dx - dy) * (TILE_W / 2) * view.camera.zoom * 0.5;
                            const ey = (dx + dy) * (TILE_H / 2) * view.camera.zoom * 0.5;
                            ctx.beginPath();
                            ctx.moveTo(screen.x, screen.y);
                            ctx.lineTo(screen.x + ex, screen.y + ey);
                            ctx.stroke();
                        }
                    } else {
                        ctx.beginPath();
                        ctx.moveTo(screen.x - hw * 0.4, screen.y);
                        ctx.lineTo(screen.x + hw * 0.4, screen.y);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]);
                    // Kerb
                    ctx.strokeStyle = "rgba(255,255,255,.07)";
                    ctx.lineWidth = 1;
                    diamond(ctx, screen.x, screen.y, hw, hh);
                    ctx.stroke();
                } else if (showGrid) {
                    ctx.strokeStyle = unlocked ? "rgba(255,255,255,.055)" : "rgba(255,255,255,.02)";
                    ctx.lineWidth = 1;
                    diamond(ctx, screen.x, screen.y, hw, hh);
                    ctx.stroke();
                }

                // A dashed edge marks where the next district begins.
                if (unlocked && cellRing(x, y) === district.radius) {
                    ctx.strokeStyle = "rgba(255,194,71,.16)";
                    ctx.lineWidth = Math.max(1, 1.4 * scale);
                    diamond(ctx, screen.x, screen.y, hw, hh);
                    ctx.stroke();
                }
            }
        }
    }

    function drawPlacementOverlay(ctx, scale) {
        const cell = view.hoverCell;
        if (!cell) return;
        const hw = (TILE_W / 2) * view.camera.zoom;
        const hh = (TILE_H / 2) * view.camera.zoom;

        if (view.tool === "build" && view.selectedType) {
            const def = buildings()[view.selectedType];
            if (!def) return;
            const size = def.footprint || 1;
            const check = canPlace(view.selectedType, cell.x, cell.y);
            for (let dx = 0; dx < size; dx++) {
                for (let dy = 0; dy < size; dy++) {
                    const world = cellToWorld(cell.x + dx, cell.y + dy);
                    const screen = worldToScreen(world.x, world.y);
                    ctx.fillStyle = check.ok ? "rgba(91,214,155,.3)" : "rgba(255,110,90,.3)";
                    diamond(ctx, screen.x, screen.y, hw * 0.95, hh * 0.95);
                    ctx.fill();
                    ctx.strokeStyle = check.ok ? "rgba(91,214,155,.85)" : "rgba(255,110,90,.85)";
                    ctx.lineWidth = Math.max(1, 1.6 * scale);
                    ctx.stroke();
                }
            }
            // Ghost of the structure itself, so the player sees the silhouette
            // before committing.
            ctx.save();
            ctx.globalAlpha = 0.55;
            drawStructure(ctx, {
                id: -1, type: view.selectedType, x: cell.x, y: cell.y,
                level: 1, hp: 100, rotation: 0, constructing: null
            }, def, scale, nightAmount(), view.time);
            ctx.restore();
        } else {
            const world = cellToWorld(cell.x, cell.y);
            const screen = worldToScreen(world.x, world.y);
            const color = view.tool === "demolish" ? "rgba(255,110,90,.6)"
                : view.tool === "road" ? "rgba(120,170,255,.55)"
                : view.tool === "repair" ? "rgba(91,214,155,.55)"
                : "rgba(94,234,255,.5)";
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1.2, 1.8 * scale);
            diamond(ctx, screen.x, screen.y, hw * 0.96, hh * 0.96);
            ctx.stroke();
        }
    }

    function drawWeather(ctx) {
        const intensity = view.weather.intensity;
        if (intensity <= 0.02) return;
        const quality = EX().quality();
        const kind = view.weather.kind;
        const count = Math.round((quality === "low" ? 40 : quality === "medium" ? 90 : 170) * intensity);
        ctx.save();
        if (kind === "rain") {
            ctx.strokeStyle = "rgba(170,205,235,.4)";
            ctx.lineWidth = 1.1;
            for (let i = 0; i < count; i++) {
                const seed = hash2(i, 1, 71);
                const x = (seed * view.width + view.time * 0.35 * (0.6 + seed)) % view.width;
                const y = (hash2(i, 2, 73) * view.height + view.time * 0.9 * (0.7 + seed)) % view.height;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - 3, y + 13);
                ctx.stroke();
            }
            ctx.fillStyle = "rgba(40,60,80,.16)";
            ctx.fillRect(0, 0, view.width, view.height);
        } else if (kind === "ash") {
            for (let i = 0; i < count; i++) {
                const seed = hash2(i, 3, 79);
                const x = (seed * view.width + Math.sin(view.time * 0.0006 + i) * 28 + view.time * 0.02) % view.width;
                const y = (hash2(i, 4, 83) * view.height + view.time * 0.045 * (0.5 + seed)) % view.height;
                ctx.fillStyle = "rgba(226,214,196," + (0.12 + seed * 0.3).toFixed(2) + ")";
                ctx.fillRect(x, y, 1.8 + seed * 1.6, 1.8 + seed * 1.6);
            }
            ctx.fillStyle = "rgba(120,90,60,.1)";
            ctx.fillRect(0, 0, view.width, view.height);
        } else if (kind === "fog") {
            const gradient = ctx.createLinearGradient(0, view.height * 0.35, 0, view.height);
            gradient.addColorStop(0, "rgba(190,200,210,0)");
            gradient.addColorStop(1, "rgba(190,200,210," + (0.3 * intensity).toFixed(2) + ")");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, view.height * 0.35, view.width, view.height * 0.65);
        }
        ctx.restore();
    }

    function drawNightAndVignette(ctx, night) {
        if (night > 0.02) {
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "rgba(10,16,34," + (night * 0.42).toFixed(3) + ")";
            ctx.fillRect(0, 0, view.width, view.height);
            ctx.restore();
        }
        const vignette = ctx.createRadialGradient(
            view.width / 2, view.height / 2, Math.min(view.width, view.height) * 0.35,
            view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.78
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,.42)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, view.width, view.height);
    }

    function drawBanner(ctx) {
        if (!view.banner || performance.now() > view.bannerUntil) { view.banner = null; return; }
        const remaining = view.bannerUntil - performance.now();
        const alpha = Math.min(1, remaining / 400);
        const colors = { good: "#5bd69b", bad: "#ff8b35", info: "#65baff" };
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "600 13px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        const text = view.banner.text;
        const width = ctx.measureText(text).width + 28;
        const x = view.width / 2;
        const y = 22;
        ctx.fillStyle = "rgba(6,10,16,.82)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - width / 2, y - 14, width, 26, 13);
        else ctx.rect(x - width / 2, y - 14, width, 26);
        ctx.fill();
        ctx.strokeStyle = colors[view.banner.kind] || colors.info;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#f5f7fa";
        ctx.fillText(text, x, y + 4);
        ctx.restore();
    }

    // ---------------------------------------------------------------
    // Frame
    // ---------------------------------------------------------------

    function resizeCanvas() {
        if (!view.canvas) return;
        const rect = view.canvas.getBoundingClientRect();
        const width = Math.max(240, Math.round(rect.width));
        const height = Math.max(200, Math.round(rect.height));
        const dpr = Math.min(2, global.devicePixelRatio || 1);
        if (view.width === width && view.height === height && view.dpr === dpr) return;
        view.width = width;
        view.height = height;
        view.dpr = dpr;
        view.canvas.width = Math.round(width * dpr);
        view.canvas.height = Math.round(height * dpr);
        view.skylineKey = "";
        view.needsStatic = true;
    }

    function drawFrame(now) {
        const ctx = view.ctx;
        if (!ctx || !view.canvas) return;
        resizeCanvas();
        const delta = view.lastFrame ? Math.min(0.1, (now - view.lastFrame) / 1000) : 0.016;
        view.lastFrame = now;
        view.time = now;
        view.frame++;

        tweenCamera(now);
        updateWeather(Date.now());
        if (EX().motionAllowed()) {
            updateAgents(delta, now);
            updateParticles(delta);
        }

        const scale = Math.max(0.5, Math.min(2.2, view.camera.zoom));
        const night = nightAmount();

        ctx.save();
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

        // Camera shake, used by raids.
        if (view.shake > 0.1) {
            const state = exp();
            if (state?.settings.cameraShake && EX().motionAllowed()) {
                ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake);
            }
            view.shake *= 0.9;
        }

        drawSky(ctx, night);
        drawGround(ctx, scale, night);

        buildProps();
        const state = exp();

        // One depth-sorted pass over everything that stands on the ground, so
        // a citizen in front of a tower is drawn in front of it.
        const drawables = [];
        for (const prop of view.props) {
            if (!districtUnlocked(districtFor(prop.x, prop.y))) continue;
            drawables.push({ depth: prop.x + prop.y - 0.1, kind: "prop", ref: prop });
        }
        if (state) {
            for (const plot of state.city.plots) {
                const def = buildings()[plot.type];
                if (!def) continue;
                const size = def.footprint || 1;
                drawables.push({ depth: plot.x + plot.y + (size - 1), kind: "plot", ref: plot, def });
            }
            if (state.settings.showNpcs) {
                for (const agent of view.agents) {
                    const cell = worldToCell(agent.x, agent.y);
                    drawables.push({ depth: cell.x + cell.y + 0.4, kind: "agent", ref: agent });
                }
            }
        }
        drawables.sort((a, b) => a.depth - b.depth);
        for (const item of drawables) {
            if (item.kind === "prop") drawProp(ctx, item.ref, scale, night, now);
            else if (item.kind === "plot") drawStructure(ctx, item.ref, item.def, scale, night, now);
            else drawAgent(ctx, item.ref, scale, night, now);
        }

        // Particles
        for (const particle of view.particles) {
            const screen = worldToScreen(particle.x, particle.y);
            const alpha = 1 - particle.life / particle.ms;
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = particle.color;
            ctx.fillRect(screen.x, screen.y, particle.size * scale, particle.size * scale);
        }
        ctx.globalAlpha = 1;

        drawPlacementOverlay(ctx, scale);

        // Floating labels
        for (const float of view.floats) {
            const screen = worldToScreen(float.x, float.y);
            const progress = (performance.now() - float.born) / float.ms;
            ctx.globalAlpha = Math.max(0, 1 - progress);
            ctx.font = "600 " + Math.round(12 * scale) + "px Inter, Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(0,0,0,.6)";
            ctx.fillText(float.text, screen.x + 1, screen.y - progress * 26 + 1);
            ctx.fillStyle = float.color;
            ctx.fillText(float.text, screen.x, screen.y - progress * 26);
        }
        ctx.globalAlpha = 1;

        drawWeather(ctx);
        drawNightAndVignette(ctx, night);
        drawBanner(ctx);

        ctx.restore();
    }

    function loop(now) {
        if (!view.running) return;
        drawFrame(now);
        if (EX().motionAllowed()) {
            view.raf = global.requestAnimationFrame(loop);
        } else {
            // Reduced motion: draw on demand only.
            view.raf = null;
        }
    }

    function startLoop() {
        if (view.running) return;
        view.running = true;
        view.lastFrame = 0;
        view.raf = global.requestAnimationFrame(loop);
    }

    function stopLoop() {
        view.running = false;
        if (view.raf) global.cancelAnimationFrame(view.raf);
        view.raf = null;
    }

    // Used in reduced-motion mode and after any state change.
    function requestFrame() {
        if (!view.ctx) return;
        if (view.running && EX().motionAllowed()) return;
        global.requestAnimationFrame(now => drawFrame(now));
    }

    // ---------------------------------------------------------------
    // Input
    //
    // One pointer-event path serves mouse, pen and touch. A press that moves
    // more than a few pixels becomes a camera pan; a press that does not
    // becomes a tap on the cell under it, which is what makes the same code
    // feel right on a phone and on a desktop.
    // ---------------------------------------------------------------

    const DRAG_THRESHOLD = 7;
    const activePointers = new Map();

    function canvasPoint(event) {
        const rect = view.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerDown(event) {
        if (!view.canvas) return;
        const point = canvasPoint(event);
        activePointers.set(event.pointerId, point);
        if (activePointers.size === 2) {
            // Start a pinch: remember the span and the midpoint.
            const points = [...activePointers.values()];
            view.pinch = {
                distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
                zoom: view.camera.zoom
            };
            view.pointer.down = false;
            return;
        }
        view.pointer.down = true;
        view.pointer.dragging = false;
        view.pointer.downX = point.x;
        view.pointer.downY = point.y;
        view.pointer.movedPx = 0;
        view.pointer.pointerId = event.pointerId;
        view.canvas.setPointerCapture?.(event.pointerId);
        requestFrame();
    }

    function onPointerMove(event) {
        if (!view.canvas) return;
        const point = canvasPoint(event);
        view.pointer.x = point.x;
        view.pointer.y = point.y;
        view.pointer.inside = true;

        if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, point);

        if (view.pinch && activePointers.size >= 2) {
            const points = [...activePointers.values()];
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (view.pinch.distance > 0) {
                view.camera.zoom = view.pinch.zoom * (distance / view.pinch.distance);
                clampCamera();
                saveCamera();
            }
            requestFrame();
            return;
        }

        const cell = screenToCell(point.x, point.y);
        view.hoverCell = inGrid(cell.x, cell.y) ? cell : null;

        if (view.pointer.down && view.pointer.pointerId === event.pointerId) {
            const dx = point.x - view.pointer.downX;
            const dy = point.y - view.pointer.downY;
            view.pointer.movedPx = Math.hypot(dx, dy);
            if (view.pointer.movedPx > DRAG_THRESHOLD) {
                if (!view.pointer.dragging) {
                    view.pointer.dragging = true;
                    view.canvas.classList.add("city-panning");
                }
                view.camera.x -= (point.x - (view.lastPanX ?? view.pointer.downX)) / view.camera.zoom;
                view.camera.y -= (point.y - (view.lastPanY ?? view.pointer.downY)) / view.camera.zoom;
                clampCamera();
                view.cameraTween = null;
            }
            view.lastPanX = point.x;
            view.lastPanY = point.y;
        }
        requestFrame();
    }

    function onPointerUp(event) {
        activePointers.delete(event.pointerId);
        if (activePointers.size < 2) view.pinch = null;
        if (!view.canvas) return;
        view.canvas.releasePointerCapture?.(event.pointerId);
        view.canvas.classList.remove("city-panning");

        const wasDragging = view.pointer.dragging;
        view.pointer.down = false;
        view.pointer.dragging = false;
        view.lastPanX = null;
        view.lastPanY = null;

        if (wasDragging) { saveCamera(); requestFrame(); return; }

        const point = canvasPoint(event);
        const cell = screenToCell(point.x, point.y);
        if (!inGrid(cell.x, cell.y)) return;
        handleCellTap(cell.x, cell.y);
        requestFrame();
    }

    function onPointerLeave() {
        view.pointer.inside = false;
        view.hoverCell = null;
        view.pointer.down = false;
        view.pointer.dragging = false;
        view.lastPanX = null;
        view.lastPanY = null;
        requestFrame();
    }

    function onWheel(event) {
        if (!view.canvas) return;
        event.preventDefault();
        const point = canvasPoint(event);
        const before = screenToWorld(point.x, point.y);
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        view.camera.zoom *= factor;
        clampCamera();
        const after = screenToWorld(point.x, point.y);
        // Keep the world point under the cursor fixed while zooming.
        view.camera.x += before.x - after.x;
        view.camera.y += before.y - after.y;
        clampCamera();
        saveCamera();
        requestFrame();
    }

    // The single place a tap on the map is interpreted.
    function handleCellTap(x, y) {
        const state = exp();
        if (!state) return;
        if (!started()) { banner("Press PLAY to begin.", "info"); return; }

        // A clickable prop always wins: it is the discoverable layer.
        const prop = view.props.find(entry => entry.x === x && entry.y === y && entry.clickable && !propCollected(entry));
        if (prop && view.tool === "inspect") { collectProp(prop); return; }

        if (view.tool === "build" && view.selectedType) {
            const placed = placeStructure(view.selectedType, x, y);
            if (placed) {
                // Roads and walls are laid in runs, so the tool stays armed;
                // anything else returns to inspect to avoid double-building.
                const def = buildings()[view.selectedType];
                if (def?.kind !== "service" || (def.footprint || 1) > 1) {
                    if (EX().unplacedCount(view.selectedType) <= 0 && def?.kind === "core") setTool("inspect");
                }
                renderTray();
                renderInspector();
            }
            return;
        }
        if (view.tool === "road") {
            if (roadAt(x, y)) removeRoad(x, y);
            else placeRoad(x, y);
            return;
        }
        if (view.tool === "demolish") {
            const plot = plotAt(x, y);
            if (plot) { demolishPlot(plot.id); renderTray(); renderInspector(); return; }
            if (roadAt(x, y)) { removeRoad(x, y); return; }
            banner("Nothing to clear there.", "info");
            return;
        }
        if (view.tool === "repair") {
            const plot = plotAt(x, y);
            if (plot && plot.hp < 100) { repairPlot(plot.id); renderInspector(); return; }
            banner(plot ? "That structure is intact." : "Nothing to repair there.", "info");
            return;
        }

        // inspect
        const plot = plotAt(x, y);
        if (plot) {
            view.selectedPlot = plot.id;
            EX().sfx("uiTap");
            renderInspector();
            return;
        }
        const district = districtFor(x, y);
        if (district && !districtUnlocked(district)) {
            banner("🔒 " + district.name + " · " + fmt(districtUnlockCost(district)) + " Salvage to clear", "info");
            view.selectedPlot = 0;
            renderInspector();
            return;
        }
        view.selectedPlot = 0;
        renderInspector();
    }

    function onKeyDown(event) {
        if (mode() !== "build" || !view.canvas) return;
        const target = event.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
        const step = 48 / view.camera.zoom;
        let handled = true;
        switch (event.key) {
            case "ArrowLeft":  view.camera.x -= step; break;
            case "ArrowRight": view.camera.x += step; break;
            case "ArrowUp":    view.camera.y -= step; break;
            case "ArrowDown":  view.camera.y += step; break;
            case "+": case "=": view.camera.zoom *= 1.15; break;
            case "-": case "_": view.camera.zoom /= 1.15; break;
            case "Escape":
                if (view.tool !== "inspect") { setTool("inspect"); }
                else { view.selectedPlot = 0; renderInspector(); }
                break;
            case "Home": focusCity(); break;
            default: handled = false;
        }
        if (!handled) return;
        event.preventDefault();
        clampCamera();
        saveCamera();
        requestFrame();
    }

    // ---------------------------------------------------------------
    // Drag and drop from the build tray
    //
    // Implemented with pointer events rather than HTML5 drag-and-drop, because
    // the latter does not fire on touch devices.
    // ---------------------------------------------------------------

    function startTrayDrag(event, type) {
        const def = buildings()[type];
        if (!def) return;
        setTool("build", type);
        view.ghost = { type, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        const chip = document.getElementById("cityDragChip");
        if (chip) {
            chip.hidden = false;
            chip.textContent = def.icon + " " + def.name;
            chip.style.left = event.clientX + "px";
            chip.style.top = event.clientY + "px";
        }
        global.addEventListener("pointermove", onTrayDragMove);
        global.addEventListener("pointerup", onTrayDragEnd);
        global.addEventListener("pointercancel", onTrayDragEnd);
    }

    function onTrayDragMove(event) {
        if (!view.ghost) return;
        view.ghost.x = event.clientX;
        view.ghost.y = event.clientY;
        const chip = document.getElementById("cityDragChip");
        if (chip) {
            chip.style.left = event.clientX + "px";
            chip.style.top = event.clientY + "px";
        }
        // Live preview on the map while the finger is over the canvas.
        if (view.canvas) {
            const rect = view.canvas.getBoundingClientRect();
            if (event.clientX >= rect.left && event.clientX <= rect.right &&
                event.clientY >= rect.top && event.clientY <= rect.bottom) {
                const cell = screenToCell(event.clientX - rect.left, event.clientY - rect.top);
                view.hoverCell = inGrid(cell.x, cell.y) ? cell : null;
                requestFrame();
            } else if (view.hoverCell) {
                view.hoverCell = null;
                requestFrame();
            }
        }
    }

    function onTrayDragEnd(event) {
        global.removeEventListener("pointermove", onTrayDragMove);
        global.removeEventListener("pointerup", onTrayDragEnd);
        global.removeEventListener("pointercancel", onTrayDragEnd);
        const chip = document.getElementById("cityDragChip");
        if (chip) chip.hidden = true;
        const ghost = view.ghost;
        view.ghost = null;
        if (!ghost || !view.canvas) return;
        const rect = view.canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) {
            // Dropped outside the map: keep the tool armed so a tap still works.
            return;
        }
        const cell = screenToCell(event.clientX - rect.left, event.clientY - rect.top);
        if (!inGrid(cell.x, cell.y)) return;
        if (placeStructure(ghost.type, cell.x, cell.y)) {
            renderTray();
            renderInspector();
        }
        requestFrame();
    }

    function setTool(tool, type = null) {
        view.tool = tool;
        view.selectedType = tool === "build" ? type : null;
        const state = exp();
        if (state) state.settings.cityTool = tool;
        renderToolbar();
        renderTray();
        requestFrame();
    }

    // ---------------------------------------------------------------
    // Panel UI
    //
    // Mounted once, then updated in place. Each sub-render compares a
    // signature string before touching innerHTML, so a one-second game tick
    // never steals focus from a button the player is using.
    // ---------------------------------------------------------------

    const TOOLS = [
        { id: "inspect",  icon: "⌖", label: "Inspect", hint: "Tap a structure for details, or search wreckage." },
        { id: "road",     icon: "⌗", label: "Roads",   hint: "Tap to lay a road, tap a road to remove it." },
        { id: "repair",   icon: "✚", label: "Repair",  hint: "Tap a damaged structure to repair it." },
        { id: "demolish", icon: "⌫", label: "Clear",   hint: "Clear a plot. Original buildings return to the tray." }
    ];

    function mount() {
        const panel = document.getElementById("cityBuilderPanel");
        if (!panel || view.mounted) return;
        panel.innerHTML =
            '<div class="city-shell">' +
              '<div class="city-stage">' +
                '<canvas id="cityCanvas" aria-label="Your city. Drag to pan, scroll or pinch to zoom, tap a structure to inspect it." role="img" tabindex="0"></canvas>' +
                '<div class="city-overlay city-overlay-left">' +
                  '<p class="city-zone-name" id="cityZoneName">Ashfall Plateau</p>' +
                  '<p class="city-clock"><span id="cityClock">—</span><span id="cityWeather">clear</span></p>' +
                '</div>' +
                '<div class="city-overlay city-overlay-right">' +
                  '<button type="button" id="cityZoomIn"  class="city-round" aria-label="Zoom in">+</button>' +
                  '<button type="button" id="cityZoomOut" class="city-round" aria-label="Zoom out">−</button>' +
                  '<button type="button" id="cityRecenter" class="city-round" aria-label="Centre on the city">⌂</button>' +
                  '<button type="button" id="cityGridToggle" class="city-round" aria-label="Toggle the build grid">⌗</button>' +
                '</div>' +
                '<p class="city-hint" id="cityToolHint"></p>' +
              '</div>' +
              '<aside class="city-side">' +
                '<div class="city-toolbar" id="cityToolbar" role="group" aria-label="City tools"></div>' +
                '<section class="city-block"><header><h3>Build</h3><span id="cityWallet">0 Salvage</span></header>' +
                  '<div id="cityTray" class="city-tray"></div></section>' +
                '<section class="city-block" id="cityInspectorBlock"><header><h3>Details</h3></header>' +
                  '<div id="cityInspector" class="city-inspector"></div></section>' +
                '<section class="city-block"><header><h3>Jobs</h3>' +
                  '<button type="button" id="cityAutoAssign" class="city-mini">Auto-assign</button></header>' +
                  '<div id="cityJobs" class="city-jobs"></div></section>' +
                '<section class="city-block"><header><h3>Districts</h3></header>' +
                  '<div id="cityDistricts" class="city-districts"></div></section>' +
              '</aside>' +
            '</div>' +
            '<div id="cityDragChip" class="city-drag-chip" hidden aria-hidden="true"></div>';

        view.panel = panel;
        view.canvas = document.getElementById("cityCanvas");
        view.ctx = view.canvas?.getContext("2d") || null;
        view.mounted = true;

        if (view.canvas) {
            view.canvas.addEventListener("pointerdown", onPointerDown);
            view.canvas.addEventListener("pointermove", onPointerMove);
            view.canvas.addEventListener("pointerup", onPointerUp);
            view.canvas.addEventListener("pointercancel", onPointerUp);
            view.canvas.addEventListener("pointerleave", onPointerLeave);
            view.canvas.addEventListener("wheel", onWheel, { passive: false });
            // Stop the browser from turning a drag into a scroll or a
            // long-press into a selection on touch devices.
            view.canvas.style.touchAction = "none";
            view.canvas.addEventListener("contextmenu", event => event.preventDefault());
        }

        document.getElementById("cityZoomIn")?.addEventListener("click", () => {
            view.camera.zoom *= 1.2; clampCamera(); saveCamera(); EX().sfx("uiTap"); requestFrame();
        });
        document.getElementById("cityZoomOut")?.addEventListener("click", () => {
            view.camera.zoom /= 1.2; clampCamera(); saveCamera(); EX().sfx("uiTap"); requestFrame();
        });
        document.getElementById("cityRecenter")?.addEventListener("click", () => {
            focusCity(); EX().sfx("cameraWhoosh"); requestFrame();
        });
        document.getElementById("cityGridToggle")?.addEventListener("click", () => {
            const state = exp();
            if (!state) return;
            state.settings.showGrid = !state.settings.showGrid;
            EX().sfx("uiTap");
            EX().save();
            requestFrame();
        });
        document.getElementById("cityAutoAssign")?.addEventListener("click", () => {
            autoAssign();
            renderJobs();
        });

        // Delegated handlers: the tray, inspector, jobs and districts are all
        // re-rendered, so their buttons are bound by data attribute instead of
        // individually.
        panel.addEventListener("click", event => {
            const action = event.target.closest?.("[data-city-action]");
            if (!action) return;
            const kind = action.dataset.cityAction;
            const value = action.dataset.cityValue;
            if (kind === "tool") setTool(value);
            else if (kind === "select-build") {
                if (buildings()[value]?.road) {
                    // The road entry simply switches to the Roads tool, which
                    // is the one that lays runs and removes them again.
                    setTool(view.tool === "road" ? "inspect" : "road");
                    EX().sfx("uiTap");
                } else if (view.selectedType === value && view.tool === "build") {
                    setTool("inspect");
                } else {
                    setTool("build", value);
                    EX().sfx("uiTap");
                }
            }
            else if (kind === "upgrade") { upgradePlot(Number(value)); renderInspector(); }
            else if (kind === "repair") { repairPlot(Number(value)); renderInspector(); }
            else if (kind === "repair-all") { repairAll(); renderInspector(); }
            else if (kind === "demolish") { demolishPlot(Number(value)); renderInspector(); renderTray(); }
            else if (kind === "assign") { assignSurvivor(value); renderJobs(); }
            else if (kind === "unassign") { unassignSurvivor(value); renderJobs(); }
            else if (kind === "unlock-district") { unlockDistrict(Number(value)); renderDistricts(); }
            else if (kind === "focus-plot") {
                const plot = plotById(Number(value));
                if (plot) {
                    const world = cellToWorld(plot.x, plot.y);
                    view.cameraTween = { from: { ...view.camera }, to: world, start: performance.now(), ms: 420 };
                    view.selectedPlot = plot.id;
                    renderInspector();
                }
            }
        });

        // Drag handles on tray entries.
        panel.addEventListener("pointerdown", event => {
            const entry = event.target.closest?.("[data-city-drag]");
            if (!entry) return;
            if (entry.getAttribute("aria-disabled") === "true") return;
            startTrayDrag(event, entry.dataset.cityDrag);
        });

        global.addEventListener("keydown", onKeyDown);
        if (global.ResizeObserver && view.canvas) {
            const observer = new ResizeObserver(() => { resizeCanvas(); requestFrame(); });
            observer.observe(view.canvas);
        } else {
            global.addEventListener("resize", () => { resizeCanvas(); requestFrame(); });
        }

        restoreCamera();
        rebuildRoadGraph();
        syncAgents();
        const state = exp();
        if (state && TOOLS.some(tool => tool.id === state.settings.cityTool)) view.tool = state.settings.cityTool;
        renderToolbar();
    }

    function renderToolbar() {
        const bar = document.getElementById("cityToolbar");
        if (!bar) return;
        const signature = "tools:" + view.tool;
        if (bar.dataset.signature !== signature) {
            bar.innerHTML = TOOLS.map(tool =>
                '<button type="button" class="city-tool' + (view.tool === tool.id ? " active" : "") + '"' +
                ' data-city-action="tool" data-city-value="' + tool.id + '"' +
                ' aria-pressed="' + (view.tool === tool.id) + '">' +
                '<span aria-hidden="true">' + tool.icon + '</span>' + tool.label + '</button>'
            ).join("");
            bar.dataset.signature = signature;
        }
        const hint = document.getElementById("cityToolHint");
        if (hint) {
            const def = view.tool === "build" && view.selectedType ? buildings()[view.selectedType] : null;
            const text = def
                ? "Drag or tap the map to place " + def.name + (def.footprint > 1 ? " (" + def.footprint + "×" + def.footprint + ")" : "")
                : (TOOLS.find(tool => tool.id === view.tool)?.hint || "");
            if (hint.textContent !== text) hint.textContent = text;
        }
    }

    // Buildings are grouped so the tray reads as a build menu rather than a
    // flat wall of buttons.
    const TRAY_GROUPS = [
        { title: "City buildings", filter: def => def.kind === "core" },
        { title: "Infrastructure", filter: def => def.kind === "service" && (def.road || ["farm", "cistern", "depot"].includes(def.key)) },
        { title: "Defense",        filter: def => def.kind === "service" && ["turret", "wall"].includes(def.key) },
        { title: "Civic",          filter: def => def.kind === "service" && ["lab", "clinic", "beacon"].includes(def.key) }
    ];

    function trayEntries() {
        const entries = [];
        for (const [key, def] of Object.entries(buildings())) {
            entries.push({ key, ...def, key });
        }
        return entries;
    }

    function renderTray() {
        const tray = document.getElementById("cityTray");
        const g = liveGame();
        if (!tray || !g) return;
        const entries = trayEntries();

        const parts = [];
        const signature = [];
        for (const group of TRAY_GROUPS) {
            const members = entries.filter(entry => group.filter(entry));
            if (!members.length) continue;
            parts.push('<p class="city-tray-group">' + group.title + '</p>');
            for (const def of members) {
                const cost = placementCost(def.key);
                const unplaced = def.kind === "core" ? EX().unplacedCount(def.key) : 0;
                const owned = def.kind === "core" ? (g.buildings?.[def.key] || 0) : EX().serviceCount(def.key);
                const affordable = cost.free || (Number.isFinite(cost.amount) && (g.salvage || 0) >= cost.amount);
                const limited = !Number.isFinite(cost.amount) && !cost.free;
                const active = def.road
                    ? view.tool === "road"
                    : (view.tool === "build" && view.selectedType === def.key);
                signature.push(def.key + ":" + owned + ":" + unplaced + ":" + (affordable ? 1 : 0) + ":" + (active ? 1 : 0) + ":" + cost.label);
                parts.push(
                    '<button type="button" class="city-tray-item' + (active ? " active" : "") + (affordable ? "" : " unaffordable") + '"' +
                    ' data-city-action="select-build" data-city-value="' + def.key + '"' +
                    ' data-city-drag="' + def.key + '"' +
                    ' aria-disabled="' + (!affordable || limited) + '"' +
                    ' aria-pressed="' + active + '">' +
                    '<span class="tray-icon" aria-hidden="true">' + def.icon + '</span>' +
                    '<span class="tray-copy"><strong>' + def.name + '</strong>' +
                    '<small>' + (limited ? "Build limit reached" : cost.label) + '</small></span>' +
                    '<span class="tray-count">' +
                      (def.kind === "core"
                        ? (unplaced > 0 ? '<em class="tray-ready">' + unplaced + ' to place</em>' : owned + ' built')
                        : owned + (def.max ? '/' + def.max : '')) +
                    '</span></button>'
                );
            }
        }

        const key = signature.join("|");
        if (tray.dataset.signature !== key) {
            tray.innerHTML = parts.join("");
            tray.dataset.signature = key;
        }
        const wallet = document.getElementById("cityWallet");
        if (wallet) {
            const text = fmt(Math.floor(g.salvage || 0)) + " Salvage";
            if (wallet.textContent !== text) wallet.textContent = text;
        }
    }

    function renderInspector() {
        const mountNode = document.getElementById("cityInspector");
        if (!mountNode) return;
        const state = exp();
        const g = liveGame();
        if (!state || !g) return;
        const plot = plotById(view.selectedPlot);
        let markup = "";
        let signature = "";

        if (plot) {
            const def = buildings()[plot.type];
            const stats = EX().cityStats();
            const need = Object.entries(def?.jobs || {}).reduce((sum, [, count]) => sum + count * plot.level, 0);
            const have = state.survivors.roster.filter(entry => entry.assignedTo === plot.id).length;
            const cost = upgradeCost(plot);
            const building = !!plot.constructing;
            const progress = building
                ? Math.round(Math.max(0, Math.min(1, (Date.now() - plot.constructing.started) /
                    Math.max(1, plot.constructing.until - plot.constructing.started))) * 100)
                : 100;
            signature = ["plot", plot.id, plot.level, Math.round(plot.hp), have, need, building ? progress : "x",
                (g.salvage || 0) >= cost ? 1 : 0].join(":");
            const lines = [];
            if (def?.power) lines.push((def.power > 0 ? "+" : "") + def.power * plot.level + " power");
            if (def?.food) lines.push((def.food > 0 ? "+" : "") + def.food * plot.level + " food");
            if (def?.security) lines.push("+" + def.security * plot.level + " security");
            if (def?.housing) lines.push("+" + def.housing * plot.level + " housing");
            if (def?.researchRate) lines.push("+" + (def.researchRate * plot.level).toFixed(1) + " research/min");
            if (def?.dropBonus) lines.push("+" + Math.round(def.dropBonus * plot.level * 100) + "% supply drops");
            if (def?.combatValue) lines.push("+" + def.combatValue * plot.level + " raid defense");

            markup =
                '<div class="inspect-head"><span class="inspect-icon" aria-hidden="true">' + (def?.icon || "▣") + '</span>' +
                '<div><strong>' + (def?.name || plot.type) + '</strong>' +
                '<small>Level ' + plot.level + ' / ' + MAX_PLOT_LEVEL + ' · plot ' + plot.x + ', ' + plot.y + '</small></div></div>' +
                (building
                    ? '<p class="inspect-progress"><span style="width:' + progress + '%"></span></p><p class="inspect-note">' +
                      (plot.constructing.upgrade ? "Upgrading" : "Under construction") + ' · ' + progress + '%</p>'
                    : '') +
                '<p class="inspect-desc">' + (def?.desc || "") + '</p>' +
                (lines.length ? '<ul class="inspect-stats"><li>' + lines.join("</li><li>") + '</li></ul>' : '') +
                '<p class="inspect-health"><span>Condition</span><em class="' + (plot.hp >= 100 ? "ok" : plot.hp > 45 ? "warn" : "bad") + '">' +
                Math.round(plot.hp) + '%</em></p>' +
                (need > 0
                    ? '<p class="inspect-jobs' + (have < need ? " understaffed" : "") + '">Staff ' + have + ' / ' + need +
                      (have < need ? ' · assign survivors in Jobs' : ' · fully staffed') + '</p>'
                    : '') +
                '<div class="inspect-actions">' +
                  (plot.level < MAX_PLOT_LEVEL && !building
                    ? '<button type="button" class="city-action" data-city-action="upgrade" data-city-value="' + plot.id + '"' +
                      ((g.salvage || 0) < cost ? ' disabled' : '') + '>Upgrade · ' + fmt(cost) + '</button>'
                    : '') +
                  (plot.hp < 100
                    ? '<button type="button" class="city-action" data-city-action="repair" data-city-value="' + plot.id + '"' +
                      ((g.salvage || 0) < repairCost(plot) ? ' disabled' : '') + '>Repair · ' + fmt(repairCost(plot)) + '</button>'
                    : '') +
                  '<button type="button" class="city-action danger" data-city-action="demolish" data-city-value="' + plot.id + '">' +
                  (def?.kind === "core" ? "Pick up" : "Clear") + '</button>' +
                '</div>';
            void stats;
        } else {
            // No selection: the city report.
            const stats = EX().cityStats();
            const damaged = state.city.plots.filter(entry => entry.hp < 100);
            signature = ["report", state.city.plots.length, damaged.length, Math.round(stats.efficiency * 100),
                stats.workers, stats.idle, Math.round(stats.powerBalance), Math.round(stats.foodBalance)].join(":");
            markup =
                '<p class="inspect-desc">Tap any structure for details. Drag a building from the tray onto a lit plot to place it.</p>' +
                '<ul class="inspect-stats">' +
                '<li>Structures standing: <strong>' + state.city.plots.length + '</strong></li>' +
                '<li>City efficiency: <strong>' + Math.round(stats.efficiency * 100) + '%</strong></li>' +
                '<li>Power balance: <strong>' + (stats.powerBalance >= 0 ? "+" : "") + Math.round(stats.powerBalance) + '</strong></li>' +
                '<li>Food balance: <strong>' + (stats.foodBalance >= 0 ? "+" : "") + Math.round(stats.foodBalance) + '</strong></li>' +
                '<li>Roads laid: <strong>' + state.city.roads.length + '</strong></li>' +
                '<li>Built all-time: <strong>' + state.city.built + '</strong></li>' +
                '</ul>' +
                (damaged.length
                    ? '<p class="inspect-note bad">' + damaged.length + ' structure' + (damaged.length === 1 ? "" : "s") +
                      ' damaged.</p><div class="inspect-actions"><button type="button" class="city-action" data-city-action="repair-all">Repair all</button></div>'
                    : '<p class="inspect-note">Every structure is intact.</p>');
        }

        if (mountNode.dataset.signature !== signature) {
            mountNode.innerHTML = markup;
            mountNode.dataset.signature = signature;
        }
    }

    function renderJobs() {
        const mountNode = document.getElementById("cityJobs");
        if (!mountNode) return;
        const state = exp();
        if (!state) return;
        const stats = EX().cityStats();
        const rows = [];
        const signature = [];
        for (const [role, def] of Object.entries(jobsTable())) {
            if (role === "idle") continue;
            const total = stats.jobSlots[role] || 0;
            const filled = stats.jobsFilled[role] || 0;
            if (!total && !filled) continue;
            signature.push(role + ":" + filled + "/" + total);
            rows.push(
                '<div class="job-row"><span class="job-icon" aria-hidden="true" style="color:' + def.color + '">' + def.icon + '</span>' +
                '<span class="job-copy"><strong>' + def.name + '</strong><small>' + filled + ' / ' + total + ' posts</small></span>' +
                '<span class="job-controls">' +
                '<button type="button" class="city-mini" data-city-action="unassign" data-city-value="' + role + '"' +
                (filled <= 0 ? ' disabled' : '') + ' aria-label="Unassign a ' + def.name + '">−</button>' +
                '<button type="button" class="city-mini" data-city-action="assign" data-city-value="' + role + '"' +
                (filled >= total || stats.idle <= 0 ? ' disabled' : '') + ' aria-label="Assign a ' + def.name + '">+</button>' +
                '</span></div>'
            );
        }
        const population = populationCap();
        const header = '<p class="job-summary">' + state.survivors.roster.length + ' survivors · ' +
            stats.idle + ' unassigned · population ' + fmt(population) + '</p>';
        const empty = rows.length ? "" :
            '<p class="inspect-note">No job posts yet. Build shelters for survivors and workshops, farms or turrets for them to work in.</p>';
        const key = signature.join("|") + "|" + state.survivors.roster.length + "|" + stats.idle + "|" + population;
        if (mountNode.dataset.signature !== key) {
            mountNode.innerHTML = header + rows.join("") + empty;
            mountNode.dataset.signature = key;
        }
    }

    function renderDistricts() {
        const mountNode = document.getElementById("cityDistricts");
        if (!mountNode) return;
        const g = liveGame();
        if (!g) return;
        const zones = zonesTable();
        const rows = [];
        const signature = [];
        for (const district of DISTRICTS) {
            const unlocked = districtUnlocked(district);
            const gated = district.stage > 1 && !g["stage" + district.stage + "Unlocked"];
            const cost = districtUnlockCost(district);
            signature.push(district.id + ":" + (unlocked ? 1 : 0) + ":" + (gated ? 1 : 0) + ":" + ((g.salvage || 0) >= cost ? 1 : 0));
            rows.push(
                '<div class="district-row' + (unlocked ? " open" : "") + '">' +
                '<span class="district-copy"><strong>' + district.name + '</strong>' +
                '<small>' + (unlocked ? "Open for building"
                    : gated ? "Needs " + (zones?.[district.stage]?.name || "the next zone")
                    : fmt(cost) + " Salvage to clear") + '</small></span>' +
                (unlocked
                    ? '<span class="district-badge">✓</span>'
                    : '<button type="button" class="city-mini" data-city-action="unlock-district" data-city-value="' + district.id + '"' +
                      (gated || (g.salvage || 0) < cost ? ' disabled' : '') + '>Clear</button>') +
                '</div>'
            );
        }
        const key = signature.join("|");
        if (mountNode.dataset.signature !== key) {
            mountNode.innerHTML = rows.join("");
            mountNode.dataset.signature = key;
        }
    }

    function renderOverlay() {
        const name = document.getElementById("cityZoneName");
        const clock = document.getElementById("cityClock");
        const weather = document.getElementById("cityWeather");
        const district = districtFor(0, 0);
        if (name) {
            const current = theme();
            const text = current.name + " · " + (district?.name || "City");
            if (name.textContent !== text) name.textContent = text;
        }
        if (clock) {
            const phase = dayPhase();
            const hours = Math.floor(phase * 24);
            const minutes = Math.floor((phase * 24 - hours) * 60);
            const text = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
            if (clock.textContent !== text) clock.textContent = text;
        }
        if (weather) {
            const labels = { clear: "clear skies", rain: "rain", ash: "ashfall", fog: "fog" };
            const text = labels[view.weather.kind] || view.weather.kind;
            if (weather.textContent !== text) weather.textContent = text;
        }
    }

    // ---------------------------------------------------------------
    // Module interface
    // ---------------------------------------------------------------

    function render() {
        mount();
        if (!view.mounted) return;
        renderToolbar();
        renderTray();
        renderInspector();
        renderJobs();
        renderDistricts();
        renderOverlay();
        resizeCanvas();
        if (mode() === "build") {
            startLoop();
            requestFrame();
        } else {
            stopLoop();
        }
    }

    // Runs every tick regardless of the active tab, so construction finishes
    // and citizens exist even if the player is looking at another screen.
    function alwaysRender() {
        if (mode() !== "build") stopLoop();
    }

    function onLoad() {
        view.selectedPlot = 0;
        view.propsKey = "";
        view.skylineKey = "";
        view.agents = [];
        view.particles = [];
        view.floats = [];
        rebuildRoadGraph();
        restoreCamera();
        syncRoster();
        syncAgents();
        const state = exp();
        if (state && TOOLS.some(tool => tool.id === state.settings.cityTool)) view.tool = state.settings.cityTool;
        requestFrame();
    }

    function onRebirth() {
        view.selectedPlot = 0;
        view.agents = [];
        view.particles = [];
        view.propsKey = "";
        rebuildRoadGraph();
        focusCity(false);
        requestFrame();
    }

    function init() {
        if (mode() === "build") render();
        EX()?.on("combat:raid-damage", payload => {
            const hits = applyRaidDamage(payload?.amount || 0);
            if (hits) {
                view.shake = 14;
                requestFrame();
            }
        });
        EX()?.on("settings", () => { view.skylineKey = ""; view.propsKey = ""; requestFrame(); });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) stopLoop();
            else if (mode() === "build") startLoop();
        });
    }

    global.LastCityExpansion?.register?.("city", {
        init, render, alwaysRender, tick, onLoad, onRebirth,
        // Used by other modules and the tests.
        applyRaidDamage,
        focusCity,
        cellToWorld, worldToCell,
        DISTRICTS,
        districtUnlocked: id => districtUnlocked(DISTRICTS.find(entry => entry.id === id)),
        _view: view,
        _place: placeStructure,
        _upgrade: upgradePlot,
        _demolish: demolishPlot,
        _canPlace: canPlace,
        _setTool: setTool,
        _assign: assignSurvivor,
        _autoAssign: autoAssign,
        _unlockDistrict: unlockDistrict,
        _plotAt: plotAt,
        _syncRoster: syncRoster
    });
})(typeof window !== "undefined" ? window : globalThis);
