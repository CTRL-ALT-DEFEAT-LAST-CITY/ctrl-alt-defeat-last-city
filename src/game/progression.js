// Persistent projects and the Stage 4 collection field.
const PROGRESSION_DEFAULTS = {
    beaconModules: 0, infrastructure: {}, production: null,
    fieldNodes: [], fieldSerial: 0, fieldLastSpawn: 0, fieldCollected: 0, relayTowers: 0
};
const INFRASTRUCTURE = {
    2: {
        depotCamp: { name: "Depot Camp", icon: "⛺", cost: 90, max: 25, output: 2, desc: "+2 base Scrap/sec · Lv 2 needed for the gate" },
        sortingMill: { name: "Sorting Mill", icon: "⚙️", cost: 220, max: 25, multiplier: 1.18, desc: "×1.18 local passive production per building" }
    },
    3: {
        assemblyLine: { name: "Assembly Line", icon: "🏗️", cost: 140, max: 25, output: 2, desc: "+2 base Parts/sec · Lv 2 needed for the gate" },
        machineShop: { name: "Machine Shop", icon: "🛠️", cost: 320, max: 25, multiplier: 1.18, desc: "×1.18 local passive production per building" }
    },
    4: {
        signalExtractor: { name: "Signal Extractor", icon: "📡", cost: 75, max: 25, output: 1, desc: "+1 base Circuits/sec" },
        capacitorBank: { name: "Capacitor Bank", icon: "🔋", cost: 180, max: 25, multiplier: 1.18, desc: "×1.18 local passive production per building" }
    },
    5: {
        coreExtractor: { name: "Core Extractor", icon: "💠", cost: 150, max: 25, output: 1, desc: "+1 base Cores/sec" },
        reactorConduit: { name: "Reactor Conduit", icon: "⚡", cost: 400, max: 25, multiplier: 1.18, desc: "×1.18 local passive production per building" }
    }
};
const ENGINE_RECIPES = [
    { name: "Supply Engine", pieces: ["Gear", "Spring", "Plate"] },
    { name: "Pump Engine", pieces: ["Plate", "Gear", "Spring"] },
    { name: "Relay Engine", pieces: ["Spring", "Plate", "Gear"] }
];
function normalizeProgression(saved = {}) {
    return { ...PROGRESSION_DEFAULTS, ...saved, infrastructure: { ...(saved.infrastructure || {}) },
        production: saved.production ? { ...saved.production } : null,
        fieldNodes: (saved.fieldNodes || []).map(node => ({ ...node })) };
}
function infrastructureLevel(key) { return game.adventure.progression.infrastructure[key] || 0; }
function infrastructureIncome(stage) {
    return Object.entries(INFRASTRUCTURE[stage] || {}).reduce((sum, [key, def]) => sum + (def.output || 0) * (Math.pow(1.3, infrastructureLevel(key)) - 1) / .3, 0);
}
function infrastructureMultiplier(stage) {
    return Object.entries(INFRASTRUCTURE[stage] || {}).reduce((value, [key, def]) => value * Math.pow(def.multiplier || 1, infrastructureLevel(key)), 1);
}
function infrastructureCost(def, level) { return Math.ceil(def.cost * Math.pow(def.multiplier || 1.3, level)); }
function buyInfrastructure(stage, key) {
    const def = INFRASTRUCTURE[stage]?.[key];
    if (!def || !isZoneUnlocked(stage) || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const level = infrastructureLevel(key), cost = infrastructureCost(def, level), currency = ZONES[stage].currency;
    if (level >= def.max || game[currency] < cost) return;
    game[currency] -= cost;
    game.adventure.progression.infrastructure[key] = level + 1;
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}
function beaconCost() { return [5000, 15000, 40000][game.adventure.progression.beaconModules] || 0; }
function engineRecipe() { return ENGINE_RECIPES[Math.floor(game.adventure.deliveries / 6) % ENGINE_RECIPES.length]; }
function engineCost() { return 35 + Math.min(2, Math.floor(game.adventure.deliveries / 6)) * 15; }
function engineDuration(level = game.stage3Upgrades.assemblySpeed) { return Math.max(2500, 8000 - infrastructureLevel("coolingSystem") * 1000 - Math.min(4, level) * 750 - Math.max(0, level - 4) * 400); }
function searchDuration(level = game.stage2Upgrades.survivorSpeed) { return Math.max(2000, 4500 - infrastructureLevel("expeditionCrew") * 400 - Math.min(4, level) * 500 - Math.max(0, level - 4) * 125); }
function searchReward(site, level = game.stage2Upgrades.survivorSpeed) {
    const base = [8, 12, 10][site] * (1 + infrastructureLevel("searchTools") * .2);
    // Active tools scale rewards; production drives specialize in passive income.
    return upgradeAmount('survivorSpeed', base, level) * stageResetMultiplier(2) * previousStageMultiplier(2) * getCompanionMultiplier(2) * getGlyphMultiplier(2) * (1 + Math.sqrt(Math.max(0, zoneRate(2))) * .08);
}
function engineProfit(level = game.stage3Upgrades.assemblySpeed) {
    return upgradeAmount('assemblySpeed', 12, level) * stageResetMultiplier(3) * previousStageMultiplier(3) * (1 + infrastructureLevel("precisionTools") * .2) * getCompanionMultiplier(3) * getGlyphMultiplier(3);
}
function progressionObjective(stage) {
    const a = game.adventure, p = a.progression;
    if (stage === 1) return {
        progress: (Math.min(1, game.buildings.citycenter / 4) + p.beaconModules / 3) / 2,
        detail: "City Centers " + game.buildings.citycenter + "/4 · Beacon modules " + p.beaconModules + "/3",
        ready: game.buildings.citycenter >= 4 && p.beaconModules >= 3
    };
    if (stage === 2) return {
        progress: (a.keys / 5 + Math.min(1, infrastructureLevel("depotCamp") / 2) + Math.min(1, game.scrap / 500)) / 3,
        detail: "Keys " + a.keys + "/5 · Depot Camp " + infrastructureLevel("depotCamp") + "/2 · Gate fund " + formatNumber(game.scrap) + "/500 Scrap",
        ready: a.keys >= 5 && infrastructureLevel("depotCamp") >= 2 && game.scrap >= 500
    };
    if (stage === 3) return {
        progress: (Math.min(1, a.deliveries / 18) + Math.min(1, infrastructureLevel("assemblyLine") / 2) + Math.min(1, game.parts / 800)) / 3,
        detail: "Engines " + a.deliveries + "/18 · Assembly Line " + infrastructureLevel("assemblyLine") + "/2 · Gate fund " + formatNumber(game.parts) + "/800 Parts",
        ready: a.deliveries >= 18 && infrastructureLevel("assemblyLine") >= 2 && game.parts >= 800
    };
    return {
        progress: (Math.min(1, p.fieldCollected / 80) + p.relayTowers / 3) / 2,
        detail: "Energy collected " + p.fieldCollected + "/80 · Relay Towers " + p.relayTowers + "/3",
        ready: p.fieldCollected >= 80 && p.relayTowers >= 3
    };
}
function handleProgressionAction(stage, action, choice, automatic = false) {
    const a = game.adventure, p = a.progression;
    if (action === "infrastructure") { buyInfrastructure(stage, choice); return true; }
    if (stage === 1 && action === "beacon") {
        if (p.beaconModules >= 3 || game.salvage < beaconCost()) return true;
        game.salvage -= beaconCost();
        p.beaconModules++;
        celebrateUpgrade();
    } else if (stage === 3 && action === "component") {
        if (p.production || !["Gear", "Spring", "Plate"].includes(choice)) return true;
        const recipe = engineRecipe().pieces;
        if (choice !== recipe[a.assembly.length]) { a.assembly = []; showNotification("Recipe reset. Follow the displayed engine order."); }
        else a.assembly.push(choice);
        playSfx("click");
    } else if (stage === 3 && action === "assemble") {
        if (p.production || a.assembly.join() !== engineRecipe().pieces.join() || game.parts < engineCost()) return true;
        const cost = engineCost();
        game.parts -= cost;
        a.assembly = [];
        p.production = {
            readyAt: Date.now() + engineDuration(), startedAt: Date.now(),
            reward: cost + engineProfit()
        };
        if (!automatic) playSfx("build");
    } else if (stage === 3 && action === "deliver") {
        if (!p.production || Date.now() < p.production.readyAt) return true;
        grantZoneResource(3, p.production.reward, !automatic);
        a.deliveries++;
        p.production = null;
        if (!automatic) { showNotification("Engine delivered! " + a.deliveries + "/18"); playSfx("dispatch"); }
    } else if (stage === 4 && action === "tower") {
        const required = [20, 45, 80][p.relayTowers], cost = [150, 450, 900][p.relayTowers];
        if (p.relayTowers >= 3 || p.fieldCollected < required || game.circuits < cost) return true;
        game.circuits -= cost;
        p.relayTowers++;
        celebrateUpgrade();
    } else return false;
    updateGame();
    saveGame(false);
    return true;
}
function fieldInterval(level = game.stage4Upgrades.fieldPower) { return Math.max(800, (1800 - Math.min(4, level) * 200 - Math.max(0, level - 4) * 50) / (1 + infrastructureLevel("pulseFrequency") * .18)); }
function fieldReward(charged, level = game.stage4Upgrades.fieldPower) {
    // Charged nodes remain worth three blue nodes, including the flat phase.
    return upgradeAmount('fieldPower', 5, level) * (charged ? 3 : 1) * (1 + infrastructureLevel("fieldCollector") * .25) * stageResetMultiplier(4) * previousStageMultiplier(4) * getCompanionMultiplier(4) * getGlyphMultiplier(4);
}
function spawnFieldNode() {
    const p = game.adventure.progression;
    if (p.fieldNodes.length >= 10) return;
    const occupied = new Set(p.fieldNodes.map(node => node.cell));
    const available = Array.from({ length: 20 }, (_, cell) => cell).filter(cell => !occupied.has(cell));
    const cell = available[Math.floor(Math.random() * available.length)];
    const id = ++p.fieldSerial, charged = id % 8 === 0;
    p.fieldNodes.push({ id, cell, charged });
}
function collectFieldNode(id, auto = false) {
    if (!game.stage4Unlocked) return false;
    const p = game.adventure.progression;
    const index = p.fieldNodes.findIndex(node => node.id === id);
    if (index < 0) return false;
    const [pickup] = p.fieldNodes.splice(index, 1);
    const reward = fieldReward(pickup.charged);
    p.fieldCollected++;
    grantZoneResource(4, reward, !auto);
    const anchor = el("energy-" + id);
    if (!auto && anchor) { showFloatingGain(anchor, "+" + formatNumber(reward) + " Circuits"); spawnBurst(anchor, "#65baff", 6); playSfx("click"); }
    updateGame();
    return true;
}
let lastDroneCollection = 0;
function updateCollectionField(now = Date.now()) {
    if (!gameStarted || !game.stage4Unlocked || document.hidden || window.LastCityCloud?.isSwitching?.() || el("accountModal")?.open) return;
    const onField = currentStageView === 4 && currentGameMode === "city";
    if (!onField && !stageAutomationOwned(4)) return;
    const p = game.adventure.progression;
    if (!p.fieldLastSpawn) {
        for (let i = 0; i < 5; i++) spawnFieldNode();
        p.fieldLastSpawn = now;
    }
    if (now - p.fieldLastSpawn >= fieldInterval()) { spawnFieldNode(); p.fieldLastSpawn = now; }
    if (stageAutomationOwned(4) && now - lastDroneCollection >= 4000 && p.fieldNodes.length) {
        lastDroneCollection = now;
        collectFieldNode(p.fieldNodes[0].id, true);
    }
    renderFieldNodes();
}
function infrastructureMarkup(stage) {
    if (!INFRASTRUCTURE[stage]) return "";
    return '<section class="zone-workshop"><h3>Production buildings · kept on reset</h3><div class="infrastructure-grid">' +
        Object.entries(INFRASTRUCTURE[stage] || {}).map(([key, def]) => {
            const level = infrastructureLevel(key), cost = infrastructureCost(def, level);
            const benefit = def.output ? '+' + formatNumber(def.output * Math.pow(1.3,level)) + ' base ' + ZONES[stage].label + '/sec on next build' : '×' + def.multiplier + ' passive production per build';
            return '<button data-action="infrastructure" data-choice="' + key + '" ' + (level >= def.max || game[ZONES[stage].currency] < cost ? "disabled" : "") + '><strong>' + def.icon + " " + def.name + '</strong><small>' + benefit + '</small><span>Lv ' + level + "/" + def.max + " · " + (level >= def.max ? "MAXED" : formatNumber(cost) + " " + ZONES[stage].label) + '</span>' + purchaseProgressMarkup(game[ZONES[stage].currency], cost, level >= def.max) + '</button>';
        }).join("") + "</div></section>";
}
function renderProgressionZone(stage) {
    if (stage === 4) { renderCollectionZone(); return; }
    const mount = el("zone" + stage), zone = ZONES[stage], a = game.adventure, p = a.progression;
    if (!mount) return;
    const objective = progressionObjective(stage);
    let activity = "";
    if (stage === 1) {
        activity = '<div class="beacon-project"><div class="project-modules">' + ["Power", "Antenna", "Signal"].map((name, i) => '<span class="' + (p.beaconModules > i ? "filled" : "") + '">' + (p.beaconModules > i ? "✓ " : "") + name + '</span>').join("") + '</div><button class="zone-unlock" data-action="beacon" ' + (p.beaconModules >= 3 || game.salvage < beaconCost() ? "disabled" : "") + '>' + (p.beaconModules >= 3 ? "Beacon restored" : "Install module · " + formatNumber(beaconCost()) + " Salvage") + '</button><p class="activity-tip">Each module permanently adds +15% Salvage power. Modules survive Rebirths.</p></div>';
    } else if (stage === 2) {
        const remaining = Math.max(0, Math.ceil((a.cooldownUntil - Date.now()) / 1000));
        activity = '<div class="search-sites">' + ["🌳 Overgrown Camp", "🚃 Rusted Train", "🏚️ Storage Shed"].map((name, i) => '<button data-action="search" data-choice="' + i + '" ' + (remaining ? "disabled" : "") + '>' + name + '<small>' + (remaining ? "Crew returns in " + remaining + "s" : "Searches " + a.siteSearches[i] + "/" + (i === 2 ? 8 : 14) + " · +" + formatNumber(searchReward(i)) + " Scrap") + '</small></button>').join("") + '</div><p class="activity-tip">Find one key after 8 searches at each site, then another at 14 Camp/Train searches. Invest in your crew and save 500 Scrap to open the gate.</p>';
    } else {
        const recipe = engineRecipe(), job = p.production, remaining = job ? Math.max(0, Math.ceil((job.readyAt - Date.now()) / 1000)) : 0;
        activity = '<p class="recipe-label">Order ' + (a.deliveries + 1) + ' · ' + recipe.name + '</p><div class="assembly-slots">' + recipe.pieces.map((name, i) => '<span class="' + (a.assembly[i] === name ? "filled" : "") + '">' + (a.assembly[i] === name ? "✓ " : "") + name + '</span>').join("") + '</div><div class="activity-buttons">' + ["Gear", "Spring", "Plate"].map(name => '<button data-action="component" data-choice="' + name + '" ' + (job ? "disabled" : "") + '>' + name + '</button>').join("") + '<button data-action="assemble" ' + (job || a.assembly.length !== 3 || game.parts < engineCost() ? "disabled" : "") + '>Process · ' + engineCost() + ' Parts</button>' + (job ? '<button data-action="deliver" ' + (remaining ? "disabled" : "") + '>' + (remaining ? "Processing · " + remaining + "s" : "Deliver · +" + formatNumber(job.reward) + " Parts") + '</button>' : "") + '</div>' + (job ? '<div class="production-track"><div style="width:' + Math.min(100, (Date.now() - job.startedAt) / (job.readyAt - job.startedAt) * 100) + '%"></div></div>' : "") + '<p class="activity-tip">Recipes change every 6 deliveries. Processing takes ' + engineDuration() / 1000 + 's. Buy Forge Tools for larger profits and faster jobs, or Auto Assembly to automate the loop.</p>';
    }
    const completed = isZoneUnlocked(stage + 1);
    const markup = '<article class="zone-scene zone-' + stage + '"><div class="zone-scenery" aria-hidden="true"><span>' + zone.icon + '</span><i></i><i></i><i></i></div><div class="zone-content"><p class="eyebrow">ZONE ' + stage + '</p><h2>' + zone.name + '</h2><p class="zone-lore">' + zone.lore + '</p><div class="zone-quest"><strong>' + (completed ? "✓ Zone objective complete" : zone.quest) + '</strong><span>' + objective.detail + '</span></div>' + activity + '<button class="zone-unlock" data-action="unlock" ' + (completed || !objective.ready ? "disabled" : "") + '>' + (completed ? "✓ " + zone.next + " unlocked" : "Open " + zone.next) + '</button></div></article>' + infrastructureMarkup(stage);
    if (mount.innerHTML !== markup) mount.innerHTML = markup;
}
function renderCollectionZone() {
    const mount = el("zone4");
    if (!mount) return;
    // Create the field once. HUD updates must never destroy or reposition pickups.
    if (mount.dataset.fieldMounted !== "yes") {
        mount.innerHTML = '<article class="zone-scene zone-4 collection-zone"><div class="collection-header"><div><p class="eyebrow">ZONE 4 · NEON ENERGY FIELD</p><h2>Harvest the signal.</h2><p class="zone-lore">Energy pulses gather between the relay towers. Tap or click them to collect Circuits.</p></div><div class="field-wallet"><span>CIRCUITS</span><strong id="fieldBalance">0</strong></div></div><div class="field-objective" id="fieldObjective"></div><div id="collectionField" class="collection-field" role="group" aria-label="Collect energy pickups"><div class="field-grid" aria-hidden="true"></div><span class="field-landmark landmark-one" aria-hidden="true">📡</span><span class="field-landmark landmark-two" aria-hidden="true">🏙️</span></div><div class="field-toolbar"><p id="fieldRewardHint"></p><button id="towerButton" class="zone-unlock" data-action="tower"></button><button id="fieldUnlock" class="zone-unlock" data-action="unlock">Open Celestial Citadel</button></div><div id="fieldWorkshop"></div></article>';
        mount.dataset.fieldMounted = "yes";
    }
    const p = game.adventure.progression;
    const balance = el("fieldBalance"), objective = el("fieldObjective"), tower = el("towerButton"), gate = el("fieldUnlock"), workshop = el("fieldWorkshop");
    if (balance) balance.textContent = formatNumber(game.circuits);
    if (el('fieldRewardHint')) el('fieldRewardHint').textContent = 'Blue energy: ' + formatNumber(fieldReward(false)) + ' Circuits · Gold energy: ' + formatNumber(fieldReward(true)) + ' · Includes your tools, glyphs and companions.';
    if (objective) objective.textContent = progressionObjective(4).detail;
    if (tower) {
        const cost = [150, 450, 900][p.relayTowers], count = [20, 45, 80][p.relayTowers];
        tower.textContent = p.relayTowers >= 3 ? "✓ All relay towers online" : "Build Tower " + (p.relayTowers + 1) + " · " + cost + " Circuits · " + count + " pickups";
        tower.disabled = p.relayTowers >= 3 || p.fieldCollected < count || game.circuits < cost;
    }
    if (gate) { gate.disabled = !progressionObjective(4).ready || game.stage5Unlocked; gate.textContent = game.stage5Unlocked ? "✓ Celestial Citadel unlocked" : "Open Celestial Citadel"; }
    if (workshop) { const markup = infrastructureMarkup(4); if (workshop.innerHTML !== markup) workshop.innerHTML = markup; }
    renderFieldNodes();
}
function renderFieldNodes() {
    const field = el("collectionField");
    if (!field || currentStageView !== 4 || currentGameMode !== "city") return;
    const p = game.adventure.progression, ids = new Set(p.fieldNodes.map(node => "energy-" + node.id));
    field.querySelectorAll(".energy-pickup").forEach(button => { if (!ids.has(button.id)) button.remove(); });
    for (const pickup of p.fieldNodes) {
        if (el("energy-" + pickup.id)) continue;
        const button = document.createElement("button");
        button.id = "energy-" + pickup.id;
        button.className = "energy-pickup" + (pickup.charged ? " charged" : "");
        button.textContent = pickup.charged ? "✦" : "◆";
        button.setAttribute("aria-label", "Collect " + (pickup.charged ? "charged" : "blue") + " Circuit energy");
        button.style.left = (10 + pickup.cell % 5 * 20) + "%";
        button.style.top = (14 + Math.floor(pickup.cell / 5) * 23) + "%";
        button.addEventListener("click", () => collectFieldNode(pickup.id));
        field.appendChild(button);
    }
}
