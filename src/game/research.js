// =============================================
// LAST CITY · RESEARCH TREE
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// A branching technology tree in the spirit of a civilisation-builder: five
// eras, prerequisites, and real choices about what to take first. It is the
// deliberate, player-chosen source of the new power this update adds, which is
// why every effect funnels through one audited function
// (productionMultiplier) that returns exactly 1 on a save with no research.
//
// Research points come from Research Labs the player builds in the city, and
// from caches found in the ruins. Nothing accrues offline beyond the same
// 8-hour / 50% cap the original game already applies to idle income, so a
// closed tab can never bank a tree the labs never produced.
//
// The tree is drawn as an SVG that can be panned and zoomed, with keyboard
// access to every node.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function mode() { try { return typeof currentGameMode !== "undefined" ? currentGameMode : "city"; } catch (_) { return "city"; } }
    function fmt(value) { return typeof global.formatNumber === "function" ? global.formatNumber(value) : String(Math.round(value)); }
    function exp() { return EX()?.state() || null; }

    // ---------------------------------------------------------------
    // The tree
    //
    // `effects` is a declarative description, read by productionMultiplier and
    // by the other modules that ask "is this unlocked?". Nothing here writes
    // to game state directly, so a node can never double-apply.
    //
    //   prod:      { stage: multiplier }  multiplies that zone's production
    //   prodAll:   multiplier             multiplies every zone's production
    //   researchRate: multiplier          multiplies lab output
    //   unlockUnit / unlockBuilding       opens content elsewhere
    //   supplyDrop / clickPower / defense bounded quality-of-life bonuses
    // ---------------------------------------------------------------

    const ERAS = [
        { id: 1, name: "Foundations",   color: "#c9a063" },
        { id: 2, name: "Settlement",    color: "#5bd69b" },
        { id: 3, name: "Industry",      color: "#ffc247" },
        { id: 4, name: "Network",       color: "#65baff" },
        { id: 5, name: "Ascension",     color: "#aa8cff" }
    ];

    const TREE = {
        // ---- Era 1 ------------------------------------------------------
        salvageLogistics: {
            name: "Salvage Logistics", era: 1, cost: 18, row: 0, icon: "📐",
            needs: [], desc: "Standardised hauling routes. ×1.10 Salvage production.",
            effects: { prod: { 1: 1.10 } }
        },
        fieldRepair: {
            name: "Field Repair", era: 1, cost: 26, row: 1, icon: "🔧",
            needs: [], desc: "Repairs cost 35% less and structures take 15% less raid damage.",
            effects: { repairDiscount: 0.35, defense: 0.15 }
        },
        surveyMethods: {
            name: "Survey Methods", era: 1, cost: 34, row: 2, icon: "🧭",
            needs: [], desc: "Exploration missions finish 20% faster and find more.",
            effects: { missionSpeed: 0.2 }
        },
        laboratoryBasics: {
            name: "Laboratory Method", era: 1, cost: 48, row: 1, icon: "🔬",
            needs: ["salvageLogistics"], desc: "×1.35 research point output from every lab.",
            effects: { researchRate: 1.35 }
        },

        // ---- Era 2 ------------------------------------------------------
        hydroponics: {
            name: "Hydroponics", era: 2, cost: 70, row: 0, icon: "🌾",
            needs: ["salvageLogistics"], desc: "Farms produce 40% more food. Unlocks the Arcology plot.",
            effects: { foodBonus: 0.4, unlockBuilding: "arcology" }
        },
        wardens: {
            name: "Warden Doctrine", era: 2, cost: 90, row: 1, icon: "⚔",
            needs: ["fieldRepair"], desc: "Unlocks the Warden unit for city defense.",
            effects: { unlockUnit: "warden" }
        },
        scrapRefining: {
            name: "Scrap Refining", era: 2, cost: 110, row: 2, icon: "♻",
            needs: ["salvageLogistics"], desc: "×1.15 Scrap production in the Depot.",
            effects: { prod: { 2: 1.15 } }
        },
        coldStorage: {
            name: "Cold Storage", era: 2, cost: 130, row: 3, icon: "🧊",
            needs: ["hydroponics"], desc: "Supply drops are worth 25% more.",
            effects: { supplyDrop: 0.25 }
        },
        civicPlanning: {
            name: "Civic Planning", era: 2, cost: 160, row: 1, icon: "🏛",
            needs: ["laboratoryBasics"], desc: "×1.08 production in every zone. The first tree-wide bonus.",
            effects: { prodAll: 1.08 }
        },

        // ---- Era 3 ------------------------------------------------------
        precisionTooling: {
            name: "Precision Tooling", era: 3, cost: 230, row: 0, icon: "🛠",
            needs: ["scrapRefining"], desc: "×1.18 Parts production in the Foundry.",
            effects: { prod: { 3: 1.18 } }
        },
        assemblyRobotics: {
            name: "Assembly Robotics", era: 3, cost: 300, row: 1, icon: "🦾",
            needs: ["precisionTooling"], desc: "×1.12 Salvage and Scrap. Construction is 30% faster.",
            effects: { prod: { 1: 1.12, 2: 1.12 }, buildSpeed: 0.3 }
        },
        pulseWeaponry: {
            name: "Pulse Weaponry", era: 3, cost: 340, row: 2, icon: "⚡",
            needs: ["wardens"], desc: "Unlocks the deployable Pulse Emitter and +20% tower damage.",
            effects: { unlockUnit: "pulse", towerDamage: 0.2 }
        },
        metallurgy: {
            name: "Applied Metallurgy", era: 3, cost: 420, row: 3, icon: "🔥",
            needs: ["precisionTooling"], desc: "×1.2 raid defense from every wall and turret.",
            effects: { defenseValue: 0.2 }
        },
        dataArchives: {
            name: "Data Archives", era: 3, cost: 500, row: 1, icon: "💾",
            needs: ["civicPlanning"], desc: "×1.4 research output and discoveries give double rewards.",
            effects: { researchRate: 1.4, discoveryBonus: 1 }
        },

        // ---- Era 4 ------------------------------------------------------
        gridRestoration: {
            name: "Grid Restoration", era: 4, cost: 700, row: 0, icon: "🔌",
            needs: ["assemblyRobotics"], desc: "Power plants supply 50% more. Brownouts cost less.",
            effects: { powerBonus: 0.5 }
        },
        droneLogistics: {
            name: "Drone Logistics", era: 4, cost: 820, row: 1, icon: "🛩",
            needs: ["pulseWeaponry"], desc: "Unlocks the Relay Drone unit.",
            effects: { unlockUnit: "drones" }
        },
        signalTheory: {
            name: "Signal Theory", era: 4, cost: 950, row: 2, icon: "📡",
            needs: ["dataArchives"], desc: "×1.22 Circuits production in the Relay.",
            effects: { prod: { 4: 1.22 } }
        },
        autonomousCrews: {
            name: "Autonomous Crews", era: 4, cost: 1200, row: 3, icon: "🤖",
            needs: ["gridRestoration"], desc: "×1.1 production in every zone.",
            effects: { prodAll: 1.10 }
        },
        quantumOptics: {
            name: "Quantum Optics", era: 4, cost: 1500, row: 1, icon: "🔭",
            needs: ["signalTheory"], desc: "×1.5 research output. Unlocks the Observatory plot.",
            effects: { researchRate: 1.5, unlockBuilding: "observatory" }
        },

        // ---- Era 5 ------------------------------------------------------
        coreHarmonics: {
            name: "Core Harmonics", era: 5, cost: 2200, row: 0, icon: "💠",
            needs: ["signalTheory"], desc: "×1.25 Cores production in the Citadel.",
            effects: { prod: { 5: 1.25 } }
        },
        adaptiveArmour: {
            name: "Adaptive Armour", era: 5, cost: 2600, row: 1, icon: "🛡",
            needs: ["droneLogistics", "metallurgy"], desc: "Every deployed unit takes 15% less damage.",
            effects: { unitArmour: 0.15 }
        },
        civicRenaissance: {
            name: "Civic Renaissance", era: 5, cost: 3400, row: 2, icon: "🌇",
            needs: ["autonomousCrews"], desc: "×1.15 production in every zone and +2 recruit slots.",
            effects: { prodAll: 1.15, recruitSlots: 2 }
        },
        beaconNetwork: {
            name: "Beacon Network", era: 5, cost: 4200, row: 3, icon: "🌐",
            needs: ["quantumOptics"], desc: "×1.3 Salvage and ×1.2 every other zone.",
            effects: { prod: { 1: 1.3 }, prodAll: 1.2 }
        },
        lastCityDoctrine: {
            name: "The Last City", era: 5, cost: 6000, row: 1, icon: "🏆",
            needs: ["coreHarmonics", "civicRenaissance", "beaconNetwork"],
            desc: "The capstone. ×1.5 production everywhere and the city never falls below 90% efficiency.",
            effects: { prodAll: 1.5, efficiencyFloor: 0.9 }
        }
    };

    // ---------------------------------------------------------------
    // Queries
    // ---------------------------------------------------------------

    function isUnlocked(id) { return !!exp()?.research.unlocked[id]; }

    function prerequisitesMet(id) {
        const node = TREE[id];
        if (!node) return false;
        return node.needs.every(isUnlocked);
    }

    function unlockedCount() { return Object.keys(TREE).filter(isUnlocked).length; }

    // Every effect of every unlocked node, merged. One place to read from, so
    // two systems can never disagree about what the player has researched.
    function activeEffects() {
        const total = {
            prod: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
            prodAll: 1, researchRate: 1,
            repairDiscount: 0, defense: 0, defenseValue: 0, towerDamage: 0,
            supplyDrop: 0, missionSpeed: 0, foodBonus: 0, powerBonus: 0,
            buildSpeed: 0, discoveryBonus: 0, unitArmour: 0, recruitSlots: 0,
            efficiencyFloor: 0,
            units: {}, plots: {}
        };
        const state = exp();
        if (!state) return total;
        for (const [id, node] of Object.entries(TREE)) {
            if (!state.research.unlocked[id]) continue;
            const effects = node.effects || {};
            if (effects.prod) {
                for (const [stage, value] of Object.entries(effects.prod)) {
                    total.prod[stage] = (total.prod[stage] || 1) * value;
                }
            }
            if (effects.prodAll) total.prodAll *= effects.prodAll;
            if (effects.researchRate) total.researchRate *= effects.researchRate;
            for (const key of ["repairDiscount", "defense", "defenseValue", "towerDamage", "supplyDrop",
                               "missionSpeed", "foodBonus", "powerBonus", "buildSpeed",
                               "discoveryBonus", "unitArmour", "recruitSlots"]) {
                if (effects[key]) total[key] += effects[key];
            }
            if (effects.efficiencyFloor) total.efficiencyFloor = Math.max(total.efficiencyFloor, effects.efficiencyFloor);
            if (effects.unlockUnit) total.units[effects.unlockUnit] = true;
            if (effects.unlockBuilding) total.plots[effects.unlockBuilding] = true;
        }
        return total;
    }

    // THE audited channel. Returns exactly 1 when nothing is researched.
    function productionMultiplier(stage) {
        const state = exp();
        if (!state) return 1;
        if (!unlockedCount()) return 1;
        const effects = activeEffects();
        const value = (effects.prod[stage] || 1) * effects.prodAll;
        return Number.isFinite(value) && value > 0 ? Math.min(1e6, value) : 1;
    }

    // ---------------------------------------------------------------
    // Spending
    // ---------------------------------------------------------------

    function startResearch(id) {
        const state = exp();
        if (!state || !TREE[id]) return false;
        if (isUnlocked(id)) return false;
        if (!prerequisitesMet(id)) {
            EX().notify("Research its prerequisites first.");
            EX().sfx("uiDenied");
            return false;
        }
        if (state.research.active?.id === id) {
            // Tapping the active node again cancels it and refunds in full,
            // because partial progress is stored, not spent.
            state.research.points += state.research.active.invested;
            state.research.active = null;
            EX().sfx("uiBack");
            EX().save();
            render();
            return true;
        }
        // Switching targets keeps the previous investment by returning it.
        if (state.research.active) state.research.points += state.research.active.invested;
        state.research.active = { id, invested: 0, startedAt: Date.now() };
        EX().sfx("uiTap");
        pour();
        EX().save();
        render();
        return true;
    }

    // Move banked points into the active project. Called when a project
    // starts and once a second from the tick, so progress is visible.
    function pour() {
        const state = exp();
        if (!state?.research.active) return false;
        const node = TREE[state.research.active.id];
        if (!node) { state.research.active = null; return false; }
        const needed = node.cost - state.research.active.invested;
        if (needed <= 0) return complete();
        const available = Math.min(needed, state.research.points);
        if (available <= 0) return false;
        state.research.points -= available;
        state.research.active.invested += available;
        if (state.research.active.invested >= node.cost) return complete();
        return false;
    }

    function complete() {
        const state = exp();
        if (!state?.research.active) return false;
        const id = state.research.active.id;
        const node = TREE[id];
        state.research.unlocked[id] = true;
        state.research.active = null;
        EX().sfx("research");
        EX().logEvent("Research complete: " + node.name + ".", "research");
        EX().notify("🔬 Research complete — " + node.name);
        EX().emit("research:complete", { id, node });
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        render();
        return true;
    }

    function tick() {
        const state = exp();
        if (!state) return;
        if (state.research.active) pour();
    }

    // ---------------------------------------------------------------
    // Layout
    //
    // Era on the x axis, row on the y axis. Positions are computed once;
    // the SVG is panned and zoomed rather than re-laid out.
    // ---------------------------------------------------------------

    const NODE_W = 168;
    const NODE_H = 76;
    const COL_GAP = 96;
    const ROW_GAP = 26;

    function layout() {
        const positions = {};
        for (const [id, node] of Object.entries(TREE)) {
            positions[id] = {
                x: (node.era - 1) * (NODE_W + COL_GAP) + 40,
                y: node.row * (NODE_H + ROW_GAP) + 70
            };
        }
        return positions;
    }

    const POSITIONS = layout();
    const CANVAS_W = 5 * (NODE_W + COL_GAP) + 80;
    const CANVAS_H = 4 * (NODE_H + ROW_GAP) + 160;

    const view = { mounted: false, selected: null, zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0 };

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    function nodeState(id) {
        if (isUnlocked(id)) return "done";
        const state = exp();
        if (state?.research.active?.id === id) return "active";
        if (prerequisitesMet(id)) return "available";
        return "locked";
    }

    function buildSvg() {
        const state = exp();
        const lines = [];
        for (const [id, node] of Object.entries(TREE)) {
            const to = POSITIONS[id];
            for (const need of node.needs) {
                const from = POSITIONS[need];
                if (!from) continue;
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_H / 2;
                const midX = (x1 + x2) / 2;
                const done = isUnlocked(need) && isUnlocked(id);
                const ready = isUnlocked(need);
                lines.push('<path d="M' + x1 + ' ' + y1 + ' C' + midX + ' ' + y1 + ' ' + midX + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" ' +
                    'class="tree-link' + (done ? " done" : ready ? " ready" : "") + '" />');
            }
        }

        const nodes = Object.entries(TREE).map(([id, node]) => {
            const position = POSITIONS[id];
            const status = nodeState(id);
            const era = ERAS.find(entry => entry.id === node.era);
            const progress = status === "active"
                ? Math.min(1, (state?.research.active.invested || 0) / node.cost)
                : status === "done" ? 1 : 0;
            return '<g class="tree-node ' + status + (view.selected === id ? " selected" : "") + '" ' +
                'transform="translate(' + position.x + ',' + position.y + ')" ' +
                'data-research="' + id + '" tabindex="0" role="button" ' +
                'aria-label="' + node.name + ', ' + node.cost + ' research points, ' + status + '">' +
                '<rect class="node-bg" width="' + NODE_W + '" height="' + NODE_H + '" rx="12" />' +
                '<rect class="node-progress" x="2" y="' + (NODE_H - 6) + '" width="' + ((NODE_W - 4) * progress) + '" height="4" rx="2" ' +
                'fill="' + era.color + '" />' +
                '<text class="node-icon" x="16" y="30">' + node.icon + '</text>' +
                '<text class="node-name" x="40" y="26">' + node.name + '</text>' +
                '<text class="node-cost" x="40" y="46">' +
                (status === "done" ? "Researched" : fmt(node.cost) + " RP") + '</text>' +
                (status === "locked" ? '<text class="node-lock" x="' + (NODE_W - 16) + '" y="26">🔒</text>' : '') +
                (status === "done" ? '<text class="node-tick" x="' + (NODE_W - 16) + '" y="26">✓</text>' : '') +
                '</g>';
        }).join("");

        const eraLabels = ERAS.map(era =>
            '<text class="era-label" x="' + ((era.id - 1) * (NODE_W + COL_GAP) + 40) + '" y="36" fill="' + era.color + '">' +
            "ERA " + era.id + " · " + era.name.toUpperCase() + '</text>').join("");

        return '<svg id="researchSvg" viewBox="0 0 ' + CANVAS_W + ' ' + CANVAS_H + '" ' +
            'width="' + CANVAS_W + '" height="' + CANVAS_H + '" role="group" aria-label="Research tree">' +
            '<g id="researchPan">' + eraLabels + lines.join("") + nodes + '</g></svg>';
    }

    function mount() {
        const panel = document.getElementById("researchPanel");
        if (!panel || view.mounted) return;
        panel.innerHTML =
            '<div class="research-shell">' +
              '<header class="research-head">' +
                '<div><p class="eyebrow">TECHNOLOGY</p><h2>Research tree</h2></div>' +
                '<div class="research-bank">' +
                  '<span id="researchPoints">0 RP</span>' +
                  '<small id="researchRate">no labs built</small>' +
                '</div>' +
              '</header>' +
              '<p class="research-note" id="researchActiveNote"></p>' +
              '<div class="research-viewport" id="researchViewport"></div>' +
              '<aside class="research-detail" id="researchDetail"></aside>' +
            '</div>';
        view.mounted = true;

        const viewport = document.getElementById("researchViewport");
        if (viewport) {
            viewport.innerHTML = buildSvg();
            // Drag to pan.
            viewport.addEventListener("pointerdown", event => {
                if (event.target.closest?.("[data-research]")) return;
                view.dragging = true;
                view.lastX = event.clientX;
                view.lastY = event.clientY;
                viewport.setPointerCapture?.(event.pointerId);
            });
            viewport.addEventListener("pointermove", event => {
                if (!view.dragging) return;
                viewport.scrollLeft -= event.clientX - view.lastX;
                viewport.scrollTop -= event.clientY - view.lastY;
                view.lastX = event.clientX;
                view.lastY = event.clientY;
            });
            viewport.addEventListener("pointerup", event => {
                view.dragging = false;
                viewport.releasePointerCapture?.(event.pointerId);
                const state = exp();
                if (state) { state.research.view.x = viewport.scrollLeft; state.research.view.y = viewport.scrollTop; }
            });
            viewport.addEventListener("pointerleave", () => { view.dragging = false; });
        }

        panel.addEventListener("click", event => {
            const node = event.target.closest?.("[data-research]");
            if (node) { select(node.dataset.research); return; }
            const action = event.target.closest?.("[data-research-action]");
            if (!action) return;
            if (action.dataset.researchAction === "start") startResearch(action.dataset.researchValue);
        });

        panel.addEventListener("keydown", event => {
            const node = event.target.closest?.("[data-research]");
            if (!node) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select(node.dataset.research);
            }
        });

        const state = exp();
        if (state && viewport) {
            viewport.scrollLeft = state.research.view.x || 0;
            viewport.scrollTop = state.research.view.y || 0;
        }
    }

    function select(id) {
        if (!TREE[id]) return;
        view.selected = id;
        EX().sfx("uiTap");
        render();
    }

    function renderDetail() {
        const mountNode = document.getElementById("researchDetail");
        if (!mountNode) return;
        const state = exp();
        if (!state) return;
        const id = view.selected;
        if (!id || !TREE[id]) {
            const signature = "none:" + unlockedCount();
            if (mountNode.dataset.signature === signature) return;
            mountNode.dataset.signature = signature;
            const effects = activeEffects();
            mountNode.innerHTML =
                '<p class="eyebrow">OVERVIEW</p>' +
                '<p class="research-blurb">Select a technology to see what it does. ' +
                'Points come from Research Labs in your city and from caches you find in the ruins.</p>' +
                '<ul class="inspect-stats">' +
                '<li>Technologies: <strong>' + unlockedCount() + ' / ' + Object.keys(TREE).length + '</strong></li>' +
                '<li>Production bonus: <strong>×' + effects.prodAll.toFixed(2) + ' all zones</strong></li>' +
                '<li>Lab output: <strong>×' + effects.researchRate.toFixed(2) + '</strong></li>' +
                '<li>Lifetime points: <strong>' + fmt(Math.floor(state.research.lifetimePoints)) + '</strong></li>' +
                '</ul>';
            return;
        }

        const node = TREE[id];
        const status = nodeState(id);
        const era = ERAS.find(entry => entry.id === node.era);
        const invested = state.research.active?.id === id ? state.research.active.invested : 0;
        const signature = [id, status, Math.floor(invested), Math.floor(state.research.points)].join(":");
        if (mountNode.dataset.signature === signature) return;
        mountNode.dataset.signature = signature;

        const missing = node.needs.filter(need => !isUnlocked(need)).map(need => TREE[need]?.name || need);
        mountNode.innerHTML =
            '<p class="eyebrow" style="color:' + era.color + '">ERA ' + node.era + ' · ' + era.name.toUpperCase() + '</p>' +
            '<h3>' + node.icon + ' ' + node.name + '</h3>' +
            '<p class="research-blurb">' + node.desc + '</p>' +
            '<ul class="inspect-stats">' +
            '<li>Cost: <strong>' + fmt(node.cost) + ' RP</strong></li>' +
            (status === "active" ? '<li>Invested: <strong>' + fmt(Math.floor(invested)) + ' / ' + fmt(node.cost) + '</strong></li>' : '') +
            '<li>Banked: <strong>' + fmt(Math.floor(state.research.points)) + ' RP</strong></li>' +
            '</ul>' +
            (missing.length ? '<p class="research-missing">🔒 Needs: ' + missing.join(", ") + '</p>' : '') +
            (status === "done"
                ? '<p class="research-done">✓ Researched. Its effect is permanent and survives every reset.</p>'
                : '<button type="button" class="city-action" data-research-action="start" data-research-value="' + id + '"' +
                  (missing.length ? ' disabled' : '') + '>' +
                  (status === "active" ? "Cancel (points refunded)" : "Research this") + '</button>') +
            (status === "available" || status === "active"
                ? '<p class="inspect-note">Banked points flow into the active project automatically.</p>'
                : '');
    }

    function render() {
        mount();
        if (!view.mounted) return;
        const state = exp();
        if (!state) return;

        const viewport = document.getElementById("researchViewport");
        if (viewport) {
            // Rebuild the SVG only when something about the tree actually
            // changed; it is a fairly large DOM subtree.
            const signature = Object.keys(TREE).map(nodeState).join("") + ":" + view.selected + ":" +
                Math.floor((state.research.active?.invested || 0) / 5);
            if (viewport.dataset.signature !== signature) {
                const scrollLeft = viewport.scrollLeft, scrollTop = viewport.scrollTop;
                viewport.innerHTML = buildSvg();
                viewport.dataset.signature = signature;
                viewport.scrollLeft = scrollLeft;
                viewport.scrollTop = scrollTop;
            }
        }

        const points = document.getElementById("researchPoints");
        if (points) {
            const text = fmt(Math.floor(state.research.points)) + " RP";
            if (points.textContent !== text) points.textContent = text;
        }
        const rate = document.getElementById("researchRate");
        if (rate) {
            const stats = EX().cityStats();
            const effects = activeEffects();
            const perMinute = stats.researchRate * effects.researchRate * Math.max(0.3, stats.efficiency);
            const text = perMinute > 0
                ? "+" + perMinute.toFixed(1) + " RP / min"
                : "build a Research Lab in your city";
            if (rate.textContent !== text) rate.textContent = text;
        }
        const note = document.getElementById("researchActiveNote");
        if (note) {
            const active = state.research.active;
            const text = active && TREE[active.id]
                ? "Researching " + TREE[active.id].name + " · " +
                  Math.floor(active.invested) + " / " + TREE[active.id].cost + " RP"
                : unlockedCount() === Object.keys(TREE).length
                    ? "Every technology researched."
                    : "No active project. Select a technology and press Research.";
            if (note.textContent !== text) note.textContent = text;
        }
        renderDetail();
    }

    function onLoad() {
        view.selected = null;
        const viewport = document.getElementById("researchViewport");
        if (viewport) viewport.dataset.signature = "";
    }

    function init() {
        if (mode() === "research") render();
        // Research can unlock combat units and city plots, so other modules
        // are told to refresh when a project lands.
        EX()?.on("research:complete", () => {
            if (typeof global.renderExpansion === "function") global.renderExpansion();
        });
    }

    global.LastCityExpansion?.register?.("research", {
        init, render, tick, onLoad,
        productionMultiplier,
        activeEffects,
        isUnlocked,
        TREE, ERAS,
        _startResearch: startResearch,
        _pour: pour,
        _select: select,
        _unlockedCount: unlockedCount
    });
})(typeof window !== "undefined" ? window : globalThis);
