// =============================================
// LAST CITY · EXPANSION LAYER
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// The glue between the original game and everything this update adds.
//
// Design rules this file enforces:
//
//  1. The original economy stays authoritative. `game.buildings[type]` is still
//     the only thing that decides how MANY of a building you own and what it
//     produces. The city view only decides WHERE those buildings stand.
//
//  2. New systems register themselves instead of being hard-wired. A feature
//     module calls LastCityExpansion.register(name, module) and the layer calls
//     back into it. Nothing here imports a feature module directly, so a module
//     that fails to load degrades to "that tab is unavailable" rather than
//     taking the game down with it.
//
//  3. Added power is auditable. Research and city services feed exactly one
//     function, expansionProductionMultiplier(stage), which returns 1 until the
//     player has actually earned something. A save with no expansion progress
//     therefore produces byte-identical output to the previous build.
//
// Loaded AFTER src/game/game.js so `game` already exists when init() runs.
// =============================================

(function (global) {
    "use strict";

    // ---------------------------------------------------------------
    // Reaching the original game's globals
    //
    // This matters and is easy to get wrong. The original files are classic
    // scripts that declare their state with `let` and `const`:
    //
    //     let game = ...            (src/game/game.js)
    //     let gameStarted = false   (src/ui/player-ui.js)
    //     let currentGameMode       (src/game/game.js)
    //     const ZONES = { ... }     (src/game/adventure.js)
    //
    // Top-level `let`/`const`/`class` bindings live in the global *lexical*
    // environment, NOT on the global object — so `window.game` is undefined
    // even though `game` resolves perfectly. (`function` declarations and
    // `var` do become window properties, which is why saveGame, updateGame,
    // showNotification and formatNumber are safe to reach via `global`.)
    //
    // These accessors therefore use bare identifiers, wrapped in try/catch so
    // that a temporal-dead-zone reference — if this file were ever moved
    // before game.js in the load order — degrades to null instead of throwing.
    // ---------------------------------------------------------------

    function liveGame() {
        try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; }
    }
    function hasStarted() {
        try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; }
    }
    function activeMode() {
        try { return typeof currentGameMode !== "undefined" ? currentGameMode : "city"; } catch (_) { return "city"; }
    }
    function activeStage() {
        try { return typeof currentStageView !== "undefined" ? currentStageView : 1; } catch (_) { return 1; }
    }

    // ---------------------------------------------------------------
    // Module registry
    // ---------------------------------------------------------------

    const modules = new Map();
    const listeners = new Map();
    let initialised = false;

    // Modes added by this update. Each needs a matching panel element and the
    // `body.<mode>-open` CSS rules in src/styles/expansion.css.
    const EXPANSION_MODES = {
        build:    { panel: "cityBuilderPanel", module: "city",     label: "City" },
        combat:   { panel: "combatPanel",      module: "combat",   label: "Defense" },
        research: { panel: "researchPanel",    module: "research", label: "Research" }
    };

    function register(name, api) {
        if (!name || !api || typeof api !== "object") return false;
        modules.set(name, api);
        // Clear any "unavailable" placeholder a previous render left in this
        // module's panel, so a late registration recovers cleanly.
        for (const config of Object.values(EXPANSION_MODES)) {
            if (config.module !== name) continue;
            const panel = document.getElementById(config.panel);
            if (panel?.dataset.missing === "yes") {
                delete panel.dataset.missing;
                panel.innerHTML = "";
            }
        }
        // A module registered after init still gets initialised.
        if (initialised && typeof api.init === "function") {
            safely(() => api.init(), "init:" + name);
        }
        return true;
    }

    function moduleFor(name) { return modules.get(name) || null; }

    // Every call into a feature module goes through here. A thrown error is
    // reported once per call site and never escapes into the game loop.
    const reported = new Set();
    function safely(fn, label) {
        try { return fn(); }
        catch (error) {
            if (!reported.has(label)) {
                reported.add(label);
                console.error("[LastCity] " + label + " failed:", error);
            }
            return undefined;
        }
    }

    // ---------------------------------------------------------------
    // Tiny event bus, for cross-module signals such as "a wave was cleared"
    // or "a building finished" without modules having to know about each other.
    // ---------------------------------------------------------------

    function on(event, handler) {
        if (typeof handler !== "function") return () => {};
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event)?.delete(handler);
    }

    function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        for (const handler of Array.from(set)) {
            safely(() => handler(payload), "event:" + event);
        }
    }

    // ---------------------------------------------------------------
    // State access
    //
    // `state()` always returns a usable object. If the save has not been
    // normalized yet (or a module runs unusually early) it repairs in place
    // rather than returning undefined and forcing null checks everywhere.
    // ---------------------------------------------------------------

    function state() {
        const live = liveGame();
        if (!live || typeof live !== "object") return null;
        if (!live.expansion || typeof live.expansion !== "object") {
            live.expansion = typeof normalizeExpansion === "function"
                ? normalizeExpansion({})
                : null;
        }
        return live.expansion;
    }

    function ready() {
        return !!(liveGame() && state() && hasStarted());
    }

    // True when the game should not be accepting interaction: an account swap
    // is mid-flight, a blocking dialog is open, or play has not begun.
    function busy() {
        if (!ready()) return true;
        if (global.LastCityCloud?.isSwitching?.()) return true;
        const blockers = ["accountModal", "hatchModal", "petMergeModal", "renewalModal", "terminalBootModal", "feedbackModal"];
        return blockers.some(id => document.getElementById(id)?.open);
    }

    function save() {
        if (typeof global.saveGame === "function") safely(() => global.saveGame(false), "save");
    }

    function notify(message) {
        if (typeof global.showNotification === "function") safely(() => global.showNotification(message), "notify");
    }

    function sfx(name, opts) { global.LastCityAudio?.sfx?.(name, opts); }

    // Append to the in-game event log. Capped by the normalizer; capped again
    // here so a long session cannot grow the save without bound.
    function logEvent(text, kind = "info") {
        const exp = state();
        if (!exp || !text) return;
        exp.narrative.log.unshift({ at: Date.now(), text: String(text).slice(0, 200), kind });
        if (exp.narrative.log.length > 40) exp.narrative.log.length = 40;
        emit("log", { text, kind });
    }

    function motionAllowed() {
        if (typeof global.canPlayVfx === "function") return !!global.canPlayVfx();
        return !global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    }

    // Rendering quality tier. "auto" samples the device once: a small screen or
    // a low core count drops particle counts and disables the heavier passes.
    let detectedQuality = null;
    function quality() {
        const setting = state()?.settings?.quality || "auto";
        if (setting !== "auto") return setting;
        if (detectedQuality) return detectedQuality;
        const cores = global.navigator?.hardwareConcurrency || 4;
        const narrow = Math.min(global.innerWidth || 1200, global.innerHeight || 800) < 620;
        const memory = global.navigator?.deviceMemory || global.navigator?.deviceMemory;
        detectedQuality = (cores <= 4 || narrow || memory === 2) ? "medium" : "high";
        if (cores <= 2) detectedQuality = "low";
        return detectedQuality;
    }

    // ---------------------------------------------------------------
    // City structures
    //
    // Two kinds of structure live in the city:
    //
    //   kind: "core"    mirrors an entry in the original BUILDINGS table. The
    //                   count comes from game.buildings, the economy is
    //                   unchanged, and the city only stores placement.
    //
    //   kind: "service" is new to this update. It costs Salvage, it is owned
    //                   per-plot, and it affects only the NEW secondary
    //                   resources (power, food, security) and the new systems.
    //                   It deliberately does not touch Salvage/sec, so adding
    //                   one can never re-balance the original curves.
    // ---------------------------------------------------------------

    const CITY_BUILDINGS = {
        // ---- core: placement for the original five buildings --------------
        scavenger: {
            kind: "core", name: "Scavenger Camp", icon: "🏕️", footprint: 1,
            palette: ["#6b5436", "#9b7c4a", "#c9a063"], roof: "tent",
            desc: "Produces Salvage. Placement is cosmetic — output comes from your building count.",
            jobs: { scavenger: 2 }, power: -1, food: -2, security: 0, buildMs: 3500
        },
        shelter: {
            kind: "core", name: "Crew Shelter", icon: "🏠", footprint: 1,
            palette: ["#3f4a5c", "#5a6b84", "#8798b4"], roof: "pitched",
            desc: "Houses survivors and adds Population.",
            jobs: {}, housing: 4, power: -2, food: -3, security: 0, buildMs: 4500
        },
        workshop: {
            kind: "core", name: "Workshop", icon: "🔧", footprint: 2,
            palette: ["#4a3f52", "#6d5c78", "#9683a4"], roof: "flat",
            desc: "Heavy Salvage production. Needs power and workers to look busy.",
            jobs: { engineer: 3 }, power: -6, food: -3, security: 0, buildMs: 7000
        },
        power: {
            kind: "core", name: "Power Plant", icon: "⚡", footprint: 2,
            palette: ["#2f4f4a", "#3f6f66", "#5fa192"], roof: "industrial",
            desc: "Multiplies building output and supplies the grid.",
            jobs: { engineer: 2 }, power: 24, food: -2, security: 0, buildMs: 9000
        },
        citycenter: {
            kind: "core", name: "City Center", icon: "🏙️", footprint: 3,
            palette: ["#3a4668", "#4f628f", "#7d94c9"], roof: "tower",
            desc: "The heart of the district. Build four to begin a renewal.",
            jobs: { engineer: 4, guard: 2 }, housing: 16, power: -12, food: -6, security: 6, buildMs: 14000
        },

        // ---- service: new city-only structures ----------------------------
        road: {
            kind: "service", name: "Service Road", icon: "⌗", footprint: 1,
            cost: 40, growth: 1.04, max: 160, road: true,
            palette: ["#2b2f36", "#3a4048", "#4b525c"],
            desc: "Connects structures. Each road touching a building raises its efficiency slightly.",
            jobs: {}, power: 0, food: 0, security: 0, buildMs: 900
        },
        farm: {
            kind: "service", name: "Hydro Farm", icon: "🌾", footprint: 2,
            cost: 600, growth: 1.19, max: 40,
            palette: ["#3c5236", "#55763f", "#7da555"], roof: "greenhouse",
            desc: "+14 Food. Food shortages drop survivor morale and job output.",
            jobs: { farmer: 3 }, power: -4, food: 14, security: 0, buildMs: 6000
        },
        cistern: {
            kind: "service", name: "Water Cistern", icon: "💧", footprint: 1,
            cost: 950, growth: 1.2, max: 30,
            palette: ["#2d4756", "#3c6376", "#55899f"], roof: "dome",
            desc: "+6 Food and makes nearby farms 25% more effective.",
            jobs: { farmer: 1 }, power: -2, food: 6, security: 0, buildMs: 4200
        },
        turret: {
            kind: "service", name: "Defense Turret", icon: "🛡️", footprint: 1,
            cost: 2200, growth: 1.26, max: 24,
            palette: ["#52343a", "#73464e", "#a2656f"], roof: "turret",
            desc: "+10 Security. Turrets fight for you during raids and reduce wave damage.",
            jobs: { guard: 2 }, power: -5, food: -1, security: 10, buildMs: 7500, combatValue: 12
        },
        wall: {
            kind: "service", name: "Barricade", icon: "▤", footprint: 1,
            cost: 420, growth: 1.11, max: 90,
            palette: ["#43372c", "#5b4a39", "#7b6650"], roof: "wall",
            desc: "+3 Security. Cheap perimeter cover that absorbs raid damage first.",
            jobs: {}, power: 0, food: 0, security: 3, buildMs: 1800, combatValue: 3
        },
        lab: {
            kind: "service", name: "Research Lab", icon: "🔬", footprint: 2,
            cost: 4800, growth: 1.3, max: 20,
            palette: ["#334a5e", "#44627f", "#5f87aa"], roof: "lab",
            desc: "+1.2 Research points/min. The only way to fund the research tree.",
            jobs: { engineer: 4 }, power: -9, food: -3, security: 0, buildMs: 11000, researchRate: 1.2
        },
        clinic: {
            kind: "service", name: "Field Clinic", icon: "⚕", footprint: 2,
            cost: 3200, growth: 1.27, max: 18,
            palette: ["#4c4458", "#67607a", "#8e86a3"], roof: "pitched",
            desc: "+18 survivor morale recovery and revives wounded units after a raid.",
            jobs: { medic: 2 }, power: -4, food: -2, security: 2, buildMs: 8500, morale: 18
        },
        depot: {
            kind: "service", name: "Supply Depot", icon: "📦", footprint: 2,
            cost: 2600, growth: 1.24, max: 20,
            palette: ["#4f452f", "#6c5f3f", "#978656"], roof: "industrial",
            desc: "Stores supplies: +12% Supply Drop value per depot, up to +120%.",
            jobs: { scavenger: 2 }, power: -3, food: -1, security: 1, buildMs: 6500, dropBonus: 0.12
        },
        beacon: {
            kind: "service", name: "Signal Beacon", icon: "📡", footprint: 1,
            cost: 7400, growth: 1.34, max: 12,
            palette: ["#3d3356", "#564574", "#7a62a3"], roof: "antenna",
            desc: "Attracts survivors: +1 recruit slot and faster exploration missions.",
            jobs: { engineer: 1 }, power: -6, food: 0, security: 1, buildMs: 9500, recruitSlots: 1
        }
    };

    // Jobs survivors can hold. `output` describes what filling the job does.
    const CITY_JOBS = {
        scavenger: { name: "Scavenger", icon: "⛏", desc: "Works camps and depots.", color: "#c9a063" },
        engineer:  { name: "Engineer",  icon: "🔧", desc: "Runs workshops, plants and labs.", color: "#7da5c9" },
        farmer:    { name: "Farmer",    icon: "🌾", desc: "Works farms and cisterns.", color: "#7da555" },
        guard:     { name: "Guard",     icon: "🛡", desc: "Mans turrets and walls.", color: "#c97d85" },
        medic:     { name: "Medic",     icon: "⚕", desc: "Staffs clinics and treats the wounded.", color: "#b094c9" },
        idle:      { name: "Unassigned", icon: "·", desc: "Waiting for work.", color: "#7d8794" }
    };

    // How many of a `service` structure the player owns, derived from placement
    // (service structures exist only as plots, so the plots ARE the count).
    function serviceCount(type) {
        const exp = state();
        if (!exp) return 0;
        let count = 0;
        for (const plot of exp.city.plots) if (plot.type === type) count++;
        return count;
    }

    // Cost of the next copy of a service structure.
    function serviceCost(type) {
        const def = CITY_BUILDINGS[type];
        if (!def || def.kind !== "service") return Infinity;
        const owned = serviceCount(type);
        if (owned >= (def.max || 999)) return Infinity;
        const discount = Math.max(0.5, 1 - (liveGame()?.rebirthUpgrades?.cheapBuild || 0) * 0.1);
        return Math.max(1, Math.ceil(def.cost * Math.pow(def.growth || 1.2, owned) * discount));
    }

    // How many of a core building are owned but not yet standing anywhere.
    function unplacedCount(type) {
        const def = CITY_BUILDINGS[type];
        if (!def || def.kind !== "core") return 0;
        const owned = Math.max(0, Math.floor(liveGame()?.buildings?.[type] || 0));
        let placed = 0;
        const exp = state();
        if (exp) for (const plot of exp.city.plots) if (plot.type === type) placed++;
        return Math.max(0, owned - placed);
    }

    // ---------------------------------------------------------------
    // City service simulation
    //
    // One pure function derives every secondary resource from the plot list.
    // It is called by the HUD, the city view, combat and research, so they can
    // never disagree about whether the lights are on.
    // ---------------------------------------------------------------

    function cityStats() {
        const exp = state();
        const stats = {
            powerProduced: 0, powerUsed: 0, powerBalance: 0, powered: true,
            foodProduced: 0, foodUsed: 0, foodBalance: 0, fed: true,
            security: 0, housing: 0, researchRate: 0, dropBonus: 0,
            recruitSlots: 2, moraleSupport: 0, combatValue: 0,
            jobSlots: {}, jobsFilled: {}, workers: 0, idle: 0,
            structures: 0, damaged: 0, constructing: 0, roads: 0,
            efficiency: 1
        };
        if (!exp) return stats;

        for (const key of Object.keys(CITY_JOBS)) {
            stats.jobSlots[key] = 0;
            stats.jobsFilled[key] = 0;
        }

        stats.roads = exp.city.roads.length;

        for (const plot of exp.city.plots) {
            const def = CITY_BUILDINGS[plot.type];
            if (!def) continue;                       // unknown type: ignore, never crash
            stats.structures++;
            if (plot.constructing) { stats.constructing++; continue; }   // not online yet
            if (plot.hp <= 0) { stats.damaged++; continue; }             // destroyed: offline

            // A damaged building contributes in proportion to its health, so a
            // raid has a visible, recoverable cost rather than a binary one.
            const health = Math.max(0, Math.min(1, plot.hp / 100));
            if (plot.hp < 100) stats.damaged++;
            const scale = health * plot.level;

            if (def.power > 0) stats.powerProduced += def.power * scale;
            else stats.powerUsed += Math.abs(def.power || 0) * plot.level;

            if (def.food > 0) stats.foodProduced += def.food * scale;
            else stats.foodUsed += Math.abs(def.food || 0) * plot.level;

            stats.security += (def.security || 0) * scale;
            stats.housing += (def.housing || 0) * plot.level;
            stats.researchRate += (def.researchRate || 0) * scale;
            stats.dropBonus += (def.dropBonus || 0) * scale;
            stats.recruitSlots += (def.recruitSlots || 0) * plot.level;
            stats.moraleSupport += (def.morale || 0) * scale;
            stats.combatValue += (def.combatValue || 0) * scale;

            for (const [job, count] of Object.entries(def.jobs || {})) {
                stats.jobSlots[job] = (stats.jobSlots[job] || 0) + count * plot.level;
            }
        }

        stats.powerBalance = stats.powerProduced - stats.powerUsed;
        stats.foodBalance = stats.foodProduced - stats.foodUsed;
        stats.powered = stats.powerBalance >= 0;
        stats.fed = stats.foodBalance >= 0;

        for (const survivor of exp.survivors.roster) {
            const job = CITY_JOBS[survivor.role] ? survivor.role : "idle";
            stats.jobsFilled[job] = (stats.jobsFilled[job] || 0) + 1;
            if (job === "idle") stats.idle++; else stats.workers++;
        }

        // Efficiency is the one number the player should watch. A brownout or a
        // food shortage hurts, roads help a little, and it is clamped so the
        // city is never completely dead.
        let efficiency = 1;
        if (!stats.powered && stats.powerUsed > 0) {
            efficiency *= Math.max(0.35, stats.powerProduced / stats.powerUsed);
        }
        if (!stats.fed && stats.foodUsed > 0) {
            efficiency *= Math.max(0.5, 0.75 + 0.25 * (stats.foodProduced / stats.foodUsed));
        }
        efficiency *= 1 + Math.min(0.15, stats.roads * 0.004);
        stats.efficiency = Math.min(1.3, Math.max(0.3, efficiency));

        return stats;
    }

    // ---------------------------------------------------------------
    // The single audited production channel
    //
    // Returns 1 whenever the player has earned nothing from the new systems,
    // which means an untouched save behaves exactly as it did before.
    // The original rate functions each multiply by this.
    // ---------------------------------------------------------------

    function expansionProductionMultiplier(stage) {
        const exp = state();
        if (!exp) return 1;
        let multiplier = 1;

        // Research is the deliberate, player-chosen source of new power.
        const research = moduleFor("research");
        if (research?.productionMultiplier) {
            const value = safely(() => research.productionMultiplier(stage), "research:multiplier");
            if (Number.isFinite(value) && value > 0) multiplier *= value;
        }

        // A well-run city helps every zone; a neglected one costs a little.
        //
        // The clamp here is deliberately gentler than the city's own internal
        // efficiency range. Inside the city, a brownout or a food shortage
        // bites hard (morale, research output, job productivity) because that
        // is what makes power and food worth managing. But the ORIGINAL
        // economy is what players watch tick, and a first experiment with the
        // city view must never feel like a punishment for trying it: the most
        // a badly-run city can cost the original curves is 10%, against an
        // upside of 30% for running it well.
        if (exp.city.plots.length) {
            const stats = cityStats();
            multiplier *= Math.min(1.3, Math.max(0.9, stats.efficiency));
        }

        // Companion abilities from the enhanced pet system.
        const pets = moduleFor("pets");
        if (pets?.productionMultiplier) {
            const value = safely(() => pets.productionMultiplier(stage), "pets:multiplier");
            if (Number.isFinite(value) && value > 0) multiplier *= value;
        }

        return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    }

    // Supply Drop bonus from depots, applied by the original dispatch handler.
    function expansionSupplyDropBonus() {
        const exp = state();
        if (!exp || !exp.city.plots.length) return 1;
        return 1 + Math.min(1.2, cityStats().dropBonus);
    }

    // ---------------------------------------------------------------
    // HUD: secondary resource strip
    //
    // Rendered above the stage panels whenever the player has started building.
    // Text-only DOM updates, so it is cheap to refresh every tick.
    // ---------------------------------------------------------------

    const hudCells = [
        { id: "power",    icon: "⚡", label: "POWER" },
        { id: "food",     icon: "🌾", label: "FOOD" },
        { id: "security", icon: "🛡", label: "SECURITY" },
        { id: "workers",  icon: "👥", label: "WORKERS" },
        { id: "research", icon: "🔬", label: "RESEARCH" }
    ];

    function renderCityHud() {
        const mount = document.getElementById("cityServiceHud");
        if (!mount) return;
        const exp = state();
        // Nothing to show until the city view has been used at least once.
        const show = !!exp && (exp.city.plots.length > 0 || exp.research.lifetimePoints > 0);
        mount.hidden = !show;
        if (!show) return;

        if (mount.dataset.mounted !== "yes") {
            mount.innerHTML = hudCells.map(cell =>
                '<div class="service-cell" data-cell="' + cell.id + '">' +
                '<span class="service-icon" aria-hidden="true">' + cell.icon + '</span>' +
                '<span class="service-copy"><small>' + cell.label + '</small>' +
                '<strong id="hud-' + cell.id + '">0</strong>' +
                '<i id="hud-' + cell.id + '-note"></i></span></div>'
            ).join("");
            mount.dataset.mounted = "yes";
        }

        const stats = cityStats();
        const fmt = typeof global.formatNumber === "function"
            ? global.formatNumber
            : (n => String(Math.round(n)));

        const values = {
            power: {
                main: fmt(Math.round(stats.powerProduced)) + " / " + fmt(Math.round(stats.powerUsed)),
                note: stats.powered ? "Grid stable" : "Brownout · output reduced",
                bad: !stats.powered
            },
            food: {
                main: fmt(Math.round(stats.foodProduced)) + " / " + fmt(Math.round(stats.foodUsed)),
                note: stats.fed ? "Rations holding" : "Shortage · morale falling",
                bad: !stats.fed
            },
            security: {
                main: fmt(Math.round(stats.security)),
                note: stats.security >= 20 ? "Perimeter secure" : stats.security > 0 ? "Thin defenses" : "Undefended",
                bad: stats.security <= 0
            },
            workers: {
                main: stats.workers + " / " + (stats.workers + stats.idle),
                note: stats.idle > 0 ? stats.idle + " awaiting orders" : "All assigned",
                bad: false
            },
            research: {
                main: fmt(Math.floor(exp.research.points)),
                note: stats.researchRate > 0 ? "+" + stats.researchRate.toFixed(1) + " / min" : "Build a Research Lab",
                bad: stats.researchRate <= 0
            }
        };

        for (const [id, value] of Object.entries(values)) {
            const main = document.getElementById("hud-" + id);
            const note = document.getElementById("hud-" + id + "-note");
            if (main && main.textContent !== value.main) main.textContent = value.main;
            if (note && note.textContent !== value.note) note.textContent = value.note;
            const cell = mount.querySelector('[data-cell="' + id + '"]');
            if (cell) cell.classList.toggle("service-warn", !!value.bad);
        }
    }

    // ---------------------------------------------------------------
    // Research point accrual
    //
    // Driven by the simulation tick, not by a deadline, so closing the tab
    // cannot bank points the labs never produced. Offline credit is granted
    // once at load, capped the same way the original offline progress is.
    // ---------------------------------------------------------------

    function accrueResearch(elapsedMs) {
        const exp = state();
        if (!exp) return;
        const stats = cityStats();
        if (stats.researchRate <= 0) return;
        const minutes = elapsedMs / 60000;
        const gained = stats.researchRate * minutes * Math.max(0.3, stats.efficiency);
        if (!Number.isFinite(gained) || gained <= 0) return;
        exp.research.points += gained;
        exp.research.lifetimePoints += gained;
    }

    // ---------------------------------------------------------------
    // Simulation tick
    //
    // Separate from rendering. Runs on its own interval so the heavy per-frame
    // canvas work in the city view is never coupled to game simulation.
    // ---------------------------------------------------------------

    let tickTimer = null;
    let lastTick = 0;

    function tick() {
        if (!ready() || document.hidden) { lastTick = Date.now(); return; }
        if (global.LastCityCloud?.isSwitching?.()) { lastTick = Date.now(); return; }

        const stamp = Date.now();
        const elapsed = lastTick ? Math.min(5000, stamp - lastTick) : 1000;
        lastTick = stamp;

        accrueResearch(elapsed);

        for (const [name, api] of modules) {
            if (typeof api.tick === "function") safely(() => api.tick(elapsed, stamp), "tick:" + name);
        }
    }

    // Grant the research a closed tab would have produced, using the same
    // 8-hour cap and 50% rate as the original offline progress so the two
    // systems agree.
    function applyOfflineResearch() {
        const exp = state();
        if (!exp) return 0;
        const last = exp.city.lastTick;
        exp.city.lastTick = Date.now();
        if (!last) return 0;
        const away = Math.min(8 * 3600 * 1000, Date.now() - last);
        if (away < 60000) return 0;
        const before = exp.research.points;
        accrueResearch(away * 0.5);
        return exp.research.points - before;
    }

    // ---------------------------------------------------------------
    // Rendering dispatch
    //
    // Called from the original updateGame(). It must stay cheap: it only syncs
    // text and defers to the active mode's module. Canvas-driven views run
    // their own requestAnimationFrame loops and are not driven from here.
    // ---------------------------------------------------------------

    function render() {
        if (!liveGame() || !state()) return;
        renderCityHud();
        renderSettingsValues();

        const mode = activeMode();
        for (const [modeName, config] of Object.entries(EXPANSION_MODES)) {
            const panel = document.getElementById(config.panel);
            const active = mode === modeName;
            if (panel) panel.classList.toggle("expansion-active", active);
            if (!active) continue;
            const api = moduleFor(config.module);
            if (api?.render) safely(() => api.render(), "render:" + config.module);
            else if (panel) renderMissingModule(panel, config);
        }

        // Tab locks: the new modes unlock as the player progresses rather than
        // appearing immediately and confusing a first-time player.
        for (const [modeName, config] of Object.entries(EXPANSION_MODES)) {
            const tab = document.querySelector('.game-mode-tab[data-mode="' + modeName + '"]');
            if (!tab) continue;
            const unlocked = modeUnlocked(modeName);
            tab.classList.toggle("locked", !unlocked);
            tab.setAttribute("aria-disabled", String(!unlocked));
        }

        renderTutorial();

        for (const [name, api] of modules) {
            if (typeof api.alwaysRender === "function") safely(() => api.alwaysRender(), "alwaysRender:" + name);
        }
    }

    // Shown only if a feature script failed to load. Better an honest message
    // in the tab than a blank panel.
    function renderMissingModule(panel, config) {
        if (panel.dataset.missing === "yes") return;
        panel.dataset.missing = "yes";
        panel.innerHTML =
            '<div class="expansion-missing"><h2>' + config.label + ' is unavailable</h2>' +
            '<p>This section\'s script did not load. The rest of the game is unaffected — ' +
            'your progress is safe. Reloading the page usually fixes it.</p></div>';
    }

    // Progression gates for the new tabs.
    function modeUnlocked(mode) {
        const g = liveGame();
        if (!g) return false;
        if (mode === "build") return true;                      // available from the start
        if (mode === "combat") return !!g.stage2Unlocked;        // after the first zone
        if (mode === "research") {
            // Visible once a lab exists, or once any research has been earned.
            const exp = state();
            return !!exp && (serviceCount("lab") > 0 || exp.research.lifetimePoints > 0 || !!g.stage3Unlocked);
        }
        return true;
    }

    function modeLockReason(mode) {
        if (mode === "combat") return "Open the Overgrown Depot to unlock city defense.";
        if (mode === "research") return "Build a Research Lab in your city to open the research tree.";
        return "Not available yet.";
    }

    // ---------------------------------------------------------------
    // Settings
    //
    // Injected into the existing Settings menu rather than replacing it, so the
    // original controls keep working and keep their behaviour.
    // ---------------------------------------------------------------

    function buildSettingsUI() {
        const menu = document.querySelector("#playerSettings .settings-menu");
        if (!menu || document.getElementById("expansionSettings")) return;

        const block = document.createElement("div");
        block.id = "expansionSettings";
        block.className = "expansion-settings";
        block.innerHTML =
            '<p class="eyebrow">AUDIO LEVELS</p>' +
            '<label class="expansion-slider">Music <input id="setMusicVolume" type="range" min="0" max="100" step="5">' +
            '<output id="setMusicVolumeOut">55%</output></label>' +
            '<label class="expansion-slider">Effects <input id="setSfxVolume" type="range" min="0" max="100" step="5">' +
            '<output id="setSfxVolumeOut">80%</output></label>' +
            '<button id="setMusicEnabled" class="secondary-button" aria-pressed="true">♪ Music on</button>' +
            '<p class="eyebrow">CITY PRESENTATION</p>' +
            '<button id="setWeather" class="secondary-button" aria-pressed="true">☁ Weather on</button>' +
            '<button id="setDayNight" class="secondary-button" aria-pressed="true">◐ Day/night on</button>' +
            '<button id="setShowNpcs" class="secondary-button" aria-pressed="true">👥 Citizens on</button>' +
            '<button id="setCameraShake" class="secondary-button" aria-pressed="true">⤬ Screen shake on</button>' +
            '<label class="expansion-slider">Detail <select id="setQuality">' +
            '<option value="auto">Automatic</option><option value="high">High</option>' +
            '<option value="medium">Medium</option><option value="low">Low</option></select></label>' +
            '<button id="setReplayIntro" class="secondary-button">▶ Replay opening cinematic</button>' +
            '<p>Presentation settings save with your city. Your device\'s reduced-motion setting always wins.</p>';

        // Place before the danger zone so Reset stays last.
        const reset = menu.querySelector("#resetButton");
        if (reset) menu.insertBefore(block, reset);
        else menu.appendChild(block);

        const toggles = {
            setWeather: "weather",
            setDayNight: "dayNight",
            setShowNpcs: "showNpcs",
            setCameraShake: "cameraShake"
        };
        for (const [id, key] of Object.entries(toggles)) {
            document.getElementById(id)?.addEventListener("click", () => {
                const exp = state();
                if (!exp) return;
                exp.settings[key] = !exp.settings[key];
                sfx("uiTap");
                renderSettingsValues();
                emit("settings", { key, value: exp.settings[key] });
                save();
            });
        }

        document.getElementById("setQuality")?.addEventListener("change", event => {
            const exp = state();
            if (!exp) return;
            const value = event.target.value;
            exp.settings.quality = ["auto", "high", "medium", "low"].includes(value) ? value : "auto";
            detectedQuality = null;
            emit("settings", { key: "quality", value: exp.settings.quality });
            save();
        });

        document.getElementById("setMusicEnabled")?.addEventListener("click", () => {
            const live = liveGame();
            if (!live) return;
            live.musicEnabled = live.musicEnabled === false;
            global.LastCityAudio?.syncPreferences?.();
            if (liveGame()?.musicEnabled) {
                global.LastCityAudio?.unlock?.();
                emit("music:resume");
            } else {
                global.LastCityAudio?.stopMusic?.(0.4);
            }
            renderSettingsValues();
            save();
        });

        const bindSlider = (id, apply) => {
            const input = document.getElementById(id);
            input?.addEventListener("input", event => {
                const value = Number(event.target.value) / 100;
                apply(value);
                renderSettingsValues();
            });
            // Persist on release rather than on every pixel of drag.
            input?.addEventListener("change", save);
        };
        bindSlider("setMusicVolume", value => {
            const live = liveGame();
            if (live) live.musicVolume = value;
            global.LastCityAudio?.setMusicVolume?.(value);
        });
        bindSlider("setSfxVolume", value => {
            const live = liveGame();
            if (live) live.sfxVolume = value;
            global.LastCityAudio?.setSfxVolume?.(value);
            sfx("uiTap", { cooldown: 0 });
        });

        document.getElementById("setReplayIntro")?.addEventListener("click", () => {
            const cinematic = moduleFor("cinematic");
            if (!cinematic?.play) return notify("The cinematic module is unavailable.");
            document.getElementById("playerSettings")?.removeAttribute("open");
            safely(() => cinematic.play({ replay: true }), "cinematic:replay");
        });

        renderSettingsValues();
    }

    function renderSettingsValues() {
        const exp = state();
        if (!exp || !document.getElementById("expansionSettings")) return;

        const setToggle = (id, on, onText, offText) => {
            const button = document.getElementById(id);
            if (!button) return;
            const text = on ? onText : offText;
            if (button.textContent !== text) button.textContent = text;
            button.setAttribute("aria-pressed", String(on));
        };
        setToggle("setWeather", exp.settings.weather, "☁ Weather on", "☁ Weather off");
        setToggle("setDayNight", exp.settings.dayNight, "◐ Day/night on", "◐ Day/night off");
        setToggle("setShowNpcs", exp.settings.showNpcs, "👥 Citizens on", "👥 Citizens off");
        setToggle("setCameraShake", exp.settings.cameraShake, "⤬ Screen shake on", "⤬ Screen shake off");
        setToggle("setMusicEnabled", liveGame()?.musicEnabled !== false, "♪ Music on", "♪ Music off");

        const quality = document.getElementById("setQuality");
        if (quality && quality.value !== exp.settings.quality) quality.value = exp.settings.quality;

        const sync = (id, value) => {
            const input = document.getElementById(id);
            const out = document.getElementById(id + "Out");
            const percent = Math.round(value * 100);
            if (input && document.activeElement !== input && Number(input.value) !== percent) input.value = percent;
            if (out && out.textContent !== percent + "%") out.textContent = percent + "%";
        };
        sync("setMusicVolume", Number.isFinite(liveGame()?.musicVolume) ? liveGame()?.musicVolume : 0.55);
        sync("setSfxVolume", Number.isFinite(liveGame()?.sfxVolume) ? liveGame()?.sfxVolume : 0.8);
    }

    // ---------------------------------------------------------------
    // Tutorial
    //
    // Steps are declarative: a `done` predicate against live game state, so the
    // tutorial can never get stuck out of sync with what the player has
    // actually achieved (including on a save that already did the step).
    // ---------------------------------------------------------------

    // Each step names the control it is talking about so the coach can
    // highlight it. Nothing advanced — Glyphs, Companions, Stories, Renewal —
    // appears here; those are introduced by the field guide once the player
    // has actually unlocked them.
    const TUTORIAL_STEPS = [
        {
            id: "gather", title: "Gather Salvage",
            text: "Press GATHER SALVAGE on the Play tab. Every press is Salvage in hand — it is how the first camp gets paid for.",
            target: "#energyButton",
            done: () => (liveGame()?.totalClicks || 0) >= 10
        },
        {
            id: "firstCamp", title: "Build a Scavenger Camp",
            text: "Open Upgrades → Buildings and build a Scavenger Camp. Camps earn Salvage every second, whether or not you are clicking.",
            target: '.game-mode-tab[data-mode="upgrades"]',
            done: () => (liveGame()?.buildings?.scavenger || 0) >= 1
        },
        {
            id: "placeCity", title: "Place it in your city",
            text: "Open the City tab. Your unplaced camp is waiting in the build tray — drag it onto any lit plot. From the moment it is standing it produces on its own, including while the game is closed.",
            target: '.game-mode-tab[data-mode="build"]',
            done: () => (state()?.city.plots.length || 0) >= 1
        },
        {
            id: "shelter", title: "House your survivors",
            text: "Build a Crew Shelter, then place it. Shelters add Population, Population strengthens every gather, and survivors can take jobs.",
            target: '.game-mode-tab[data-mode="upgrades"]',
            done: () => (liveGame()?.buildings?.shelter || 0) >= 1
        },
        {
            id: "assign", title: "Put someone to work",
            text: "In the City tab, open Jobs and assign a survivor. Filled jobs keep your buildings running at full efficiency — an unstaffed building still costs you upkeep.",
            target: '.game-mode-tab[data-mode="build"]',
            done: () => {
                const stats = cityStats();
                return stats.workers >= 1;
            }
        },
        {
            id: "farm", title: "Power and Food",
            text: "Watch the strip above your city: Power, Food, Security and Workers. Buildings draw Power and eat Food; Generators and Hydro Farms supply them. Build a Hydro Farm — a shortage of either quietly cuts your output.",
            target: "#cityServiceHud",
            done: () => serviceCount("farm") >= 1
        },
        {
            id: "upgrades", title: "Spend on Upgrades",
            text: "Open Upgrades → Tools. Sturdy Gloves raise what you gather by hand, Salvage Accelerator raises everything the city produces. Buy them whenever you can afford one — early levels add flat amounts, later levels start multiplying.",
            target: '.game-mode-tab[data-mode="upgrades"]',
            done: () => (liveGame()?.cityTech?.sturdyGloves || 0) >= 1 || (liveGame()?.cityTech?.salvageAccelerator || 0) >= 1
        },
        {
            id: "lab", title: "Open the research tree",
            text: "A Research Lab turns your city into a research engine and unlocks the Research tab, where the long-term upgrades live. Research is bought with Salvage Shards and survives renewal.",
            target: '.game-mode-tab[data-mode="build"]',
            done: () => serviceCount("lab") >= 1
        },
        {
            id: "nextZone", title: "Ashfall is the first of five",
            text: "Four more zones follow this one, and each one you open feeds a supply link back into the zones before it — nothing you build here becomes obsolete. Ashfall opens the Overgrown Depot once you have 4 City Centers and all 3 beacon modules restored. No need to rush it.",
            target: '.stage-tab[data-stage="2"]',
            done: () => !!liveGame()?.stage2Unlocked
        }
    ];

    function currentTutorialStep() {
        const exp = state();
        if (!exp || exp.tutorial.done || exp.tutorial.dismissed) return null;
        for (const step of TUTORIAL_STEPS) {
            if (exp.tutorial.completedSteps[step.id]) continue;
            if (safely(() => step.done(), "tutorial:" + step.id)) {
                // Credit a step the player has already satisfied and move on.
                exp.tutorial.completedSteps[step.id] = true;
                continue;
            }
            return step;
        }
        if (!exp.tutorial.done) {
            exp.tutorial.done = true;
            logEvent("Tutorial complete. The city is yours to run.", "good");
            sfx("bigReward");
        }
        return null;
    }

    // Only one control is ever highlighted, and it is cleared the moment the
    // tutorial stops pointing at it.
    function highlightTutorialTarget(selector) {
        const target = selector ? document.querySelector(selector) : null;
        document.querySelectorAll(".onboarding-highlight").forEach(node => {
            if (node !== target) node.classList.remove("onboarding-highlight");
        });
        if (target) target.classList.add("onboarding-highlight");
    }

    function renderTutorial() {
        const mount = document.getElementById("tutorialCoach");
        if (!mount) return;
        const exp = state();
        if (!exp || !ready()) { mount.hidden = true; highlightTutorialTarget(null); return; }

        const step = currentTutorialStep();
        if (!step) { mount.hidden = true; highlightTutorialTarget(null); return; }

        highlightTutorialTarget(step.target);

        const index = TUTORIAL_STEPS.findIndex(s => s.id === step.id) + 1;
        const signature = step.id + ":" + index;
        mount.hidden = false;
        if (mount.dataset.signature === signature) return;
        mount.dataset.signature = signature;
        mount.innerHTML =
            '<div class="coach-body"><p class="eyebrow">GETTING STARTED · STEP ' + index + ' / ' + TUTORIAL_STEPS.length + '</p>' +
            '<strong>' + step.title + '</strong><p>' + step.text + '</p></div>' +
            '<button type="button" id="tutorialDismiss" class="secondary-button">Skip tutorial</button>';
        document.getElementById("tutorialDismiss")?.addEventListener("click", () => {
            const live = state();
            if (!live) return;
            live.tutorial.dismissed = true;
            mount.hidden = true;
            highlightTutorialTarget(null);
            notify("Tutorial skipped. Reopen it with Replay tutorial in the ? Guide.");
            save();
        });
    }

    function resumeTutorial() {
        const exp = state();
        if (!exp) return;
        exp.tutorial.dismissed = false;
        save();
        render();
    }

    // ---------------------------------------------------------------
    // Lifecycle hooks, called from the original reset paths
    // ---------------------------------------------------------------

    function onRebirth() {
        if (typeof resetExpansionForRebirth === "function") {
            safely(() => resetExpansionForRebirth(liveGame()), "rebirth");
        }
        for (const [name, api] of modules) {
            if (typeof api.onRebirth === "function") safely(() => api.onRebirth(), "onRebirth:" + name);
        }
        logEvent("City renewed. Layout cleared; research, companions and discoveries kept.", "renewal");
    }

    function onStageReset(stage) {
        for (const [name, api] of modules) {
            if (typeof api.onStageReset === "function") safely(() => api.onStageReset(stage), "onStageReset:" + name);
        }
    }

    // Called right after a save loads, before the first render.
    function onLoad() {
        if (typeof migrateExpansionState === "function") {
            safely(() => migrateExpansionState(liveGame()), "migrate");
        }
        detectedQuality = null;
        lastTick = Date.now();
        const gained = applyOfflineResearch();
        if (gained > 1) {
            logEvent("Labs banked " + Math.floor(gained) + " research points while you were away.", "good");
        }
        global.LastCityAudio?.syncPreferences?.();
        for (const [name, api] of modules) {
            if (typeof api.onLoad === "function") safely(() => api.onLoad(), "onLoad:" + name);
        }
        render();
    }

    // ---------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------

    function init() {
        if (initialised) return;
        initialised = true;

        buildSettingsUI();

        // New mode tabs. The original handler in game.js already forwards every
        // .game-mode-tab click to switchGameMode, so locked tabs need their own
        // guard to explain why nothing happened.
        document.querySelector(".game-mode-tabs")?.addEventListener("click", event => {
            const tab = event.target.closest?.(".game-mode-tab");
            if (!tab) return;
            const mode = tab.dataset.mode;
            if (!EXPANSION_MODES[mode]) return;
            if (!modeUnlocked(mode)) {
                event.stopPropagation();
                notify("🔒 " + modeLockReason(mode));
                sfx("uiDenied");
            }
        }, true);

        // First real gesture unlocks audio. Browsers require this, and doing it
        // on any pointer or key event means the player never has to press a
        // dedicated "enable sound" button.
        const unlockAudio = () => {
            global.LastCityAudio?.unlock?.();
            global.LastCityAudio?.syncPreferences?.();
            document.removeEventListener("pointerdown", unlockAudio);
            document.removeEventListener("keydown", unlockAudio);
        };
        document.addEventListener("pointerdown", unlockAudio, { once: false });
        document.addEventListener("keydown", unlockAudio, { once: false });

        for (const [name, api] of modules) {
            if (typeof api.init === "function") safely(() => api.init(), "init:" + name);
        }

        lastTick = Date.now();
        clearInterval(tickTimer);
        tickTimer = setInterval(tick, 1000);

        onLoad();
    }

    // ---------------------------------------------------------------
    // Public surface
    // ---------------------------------------------------------------

    global.LastCityExpansion = {
        // registry + bus
        register, moduleFor, on, emit, safely,
        // state
        state, ready, busy, save, notify, logEvent, sfx,
        motionAllowed, quality,
        // city data + derivation
        CITY_BUILDINGS, CITY_JOBS, CITY_GRID: typeof CITY_GRID !== "undefined" ? CITY_GRID : null,
        cityStats, serviceCount, serviceCost, unplacedCount,
        // modes
        EXPANSION_MODES, modeUnlocked, modeLockReason,
        // lifecycle
        init, render, tick, onLoad, onRebirth, onStageReset,
        // tutorial
        TUTORIAL_STEPS, resumeTutorial, currentTutorialStep,
        // the city log, so the radio operator can speak through it
        logEvent
    };

    // These three are called from the original game files by name, so they are
    // exposed as plain globals rather than namespaced methods.
    global.expansionProductionMultiplier = expansionProductionMultiplier;
    global.expansionSupplyDropBonus = expansionSupplyDropBonus;
    global.renderExpansion = render;
    global.initExpansion = init;
    global.expansionOnRebirth = onRebirth;
    global.expansionOnStageReset = onStageReset;

    // ---------------------------------------------------------------
    // Self-initialisation
    //
    // This file is loaded before the feature modules so they have a namespace
    // to register into, but init() must run after they have registered. Every
    // script on the page is synchronous, so deferring to the next macrotask
    // guarantees all of them have executed first — and it keeps the original
    // game.js start-up sequence untouched.
    // ---------------------------------------------------------------
    function boot() {
        if (global.document?.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0), { once: true });
        } else {
            setTimeout(init, 0);
        }
    }
    boot();
})(typeof window !== "undefined" ? window : globalThis);
