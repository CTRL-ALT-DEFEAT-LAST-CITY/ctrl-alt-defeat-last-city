// Zone quests, active activities and earned-currency companion eggs.
const ADVENTURE_DEFAULTS = {
    beaconLit: false, searches: 0, siteSearches: [0, 0, 0], keys: 0, assembly: [], deliveries: 0,
    route: [0, 2, 1, 3], routeStep: 0, links: 0,
    shields: [], bossHealth: 100, bossDefeated: false, cooldownUntil: 0,
    eggsHatched: 0, mergesAttempted: 0, goldPetsCreated: 0, collection: {}, equipped: {}, autoEquipBest: {}, pity: {}, boosts: {},
    progression: normalizeProgression()
};
const ZONES = {
    1: { name: "Ashfall Outpost", currency: "salvage", label: "Salvage", icon: "🏕️", egg: "Ember Egg", cost: 150, boostCost: 300, lore: "A signal tower rises above the ruins. Rebuild its power, antenna and signal modules to reach the survivors.", quest: "Build 4 City Centers and restore all 3 beacon modules.", next: "the Depot", theme: "Survival and first reconstruction", purpose: "Rebuild the first functioning settlement." },
    2: { name: "Overgrown Depot", currency: "scrap", label: "Scrap", icon: "🌿", egg: "Moss Egg", cost: 70, boostCost: 150, lore: "Nature has claimed the old rail yard. Equip your expedition crew and establish a depot before opening the gate.", quest: "Recover 5 keys, build Depot Camp Lv 2, then spend 500 Scrap to open the gate.", next: "the Foundry", theme: "Logistics and supply", purpose: "Move resources reliably again." },
    3: { name: "Copperworks Foundry", currency: "parts", label: "Parts", icon: "🏭", egg: "Clockwork Egg", cost: 100, boostCost: 250, lore: "New engine orders arrive in batches. Upgrade the production line, assemble each recipe and send supplies to the relay.", quest: "Deliver 18 engines, build Assembly Line Lv 2, then fund the gate with 800 Parts.", next: "the Relay", theme: "Industrial production", purpose: "Manufacture instead of scavenge." },
    4: { name: "Neon Relay", currency: "circuits", label: "Circuits", icon: "🌐", egg: "Prism Egg", cost: 150, boostCost: 250, lore: "Energy drifts through the neon district. Harvest it to build collectors, capacitors and the three relay towers.", quest: "Collect 80 energy pickups and build 3 Relay Towers.", next: "the Citadel", theme: "Communication and automation", purpose: "Reconnect and coordinate the city." },
    5: { name: "Celestial Citadel", currency: "cores", label: "Cores", icon: "🌌", egg: "Astral Egg", cost: 180, boostCost: 250, lore: "The Citadel's guardian blocks the final reactor. Break its shields and reclaim humanity's future.", quest: "Disable all 3 shields, then fire the reactor cannon. Defeat the Guardian.", next: "Guardian defeated", theme: "Advanced civilisation", purpose: "Finish rebuilding a working civilisation." }
};
const RARITIES = [
    { name: "Common", weight: 50, bonus: .08, color: "#a8bac9" },
    { name: "Uncommon", weight: 28, bonus: .15, color: "#5bd69b" },
    { name: "Rare", weight: 15, bonus: .30, color: "#65baff" },
    { name: "Epic", weight: 6, bonus: .55, color: "#aa8cff" },
    { name: "Legendary", weight: 1, bonus: 1, color: "#ffc247" }
];
// Companions: name, icon, and the line that says who they are.
//
// Each one belongs to the zone it is found in, and reads like it: Ashfall's
// are survivors' animals scraping by in the ash, the Depot's have grown into
// the ruins, the Foundry's are machine-touched, the Relay's are half signal,
// and the Citadel's are barely animals at all any more.
const ZONE_PETS = {
    1: [
        ["Ash Mouse", "🐭", "Lives in the wall cavities of the camp and screams when the air turns bad. The crews learned to listen."],
        ["Camp Cat", "🐱", "Walked in during the first winter, sat down by the fire, and has never once acknowledged that this is anyone's city but hers."],
        ["Ember Fox", "🦊", "Digs out of collapsed basements the salvage no crew could reach. Comes back singed, every time, and goes straight back in."],
        ["Flame Owl", "🦉", "Hunts the long ridge at dusk and lands on the beacon mast. Where it lands, the crews mark the map."],
        ["Phoenix", "🔥", "Seen three times since the fall, always over a district about to be rebuilt. The survivors stopped calling it a coincidence."]
    ],
    2: [
        ["Moss Snail", "🐌", "Grazes the rail yard's green rot. The track it clears stays clear, which is more than the work crews manage."],
        ["Depot Rabbit", "🐰", "Knows every gap under the depot fence. Scouts follow it in rather than cut the wire and announce themselves."],
        ["Vine Frog", "🐸", "Calls from the flooded loading pits. Three calls means the water is clean; one means turn around."],
        ["Forest Stag", "🦌", "Walks the old freight line at dawn and will not step on ground that is about to give way."],
        ["Grove Spirit", "🌳", "Whatever the Depot became after the forest took it, it has opinions about who gets to walk through."]
    ],
    3: [
        ["Bolt Beetle", "🪲", "Nests in the casting floor's warm slag and eats loose fasteners. The line runs quieter with them in it."],
        ["Gear Pup", "🐶", "Born in the machine shop and raised on noise. Fetches the exact wrench, every time, and nobody taught it that."],
        ["Copper Crab", "🦀", "Strips oxide off the cooling pipes for the metal. The Foundry's heat exchangers have never run better."],
        ["Mecha Wolf", "🐺", "Half of it is original. The other half the Foundry built back, one plate at a time, while it slept through the welding."],
        ["Forge Dragon", "🐉", "Sleeps in the main crucible. The Foundry does not need to light the furnace on the mornings it is in a good mood."]
    ],
    4: [
        ["Pixel Bug", "🐛", "Crawls the fibre runs and eats packet noise. Lines it has walked come back clean."],
        ["Relay Bird", "🐦", "Repeats transmissions it overheard years ago, word for word. Two lost crews have been found that way."],
        ["Neon Jelly", "🪼", "Drifts through the district's standing fields and glows brighter near live current. The engineers use it as a meter."],
        ["Prism Tiger", "🐯", "Its coat refracts the relay light into something the targeting arrays cannot resolve. It hunts exactly as you would expect."],
        ["Quantum Dragon", "🐲", "Occupies more than one tower at a time. The Relay's uptime figures stopped making sense the week it arrived."]
    ],
    5: [
        ["Star Moth", "🦋", "Navigates by the Citadel's reactor glow. Swarms of them map the safe corridors in a single night."],
        ["Moon Cub", "🐻", "Found curled in a cryo bay that had been sealed since before the fall, warm, and entirely unbothered."],
        ["Comet Whale", "🐳", "Moves through the Citadel's upper vacuum the way the old records say whales moved through water."],
        ["Nova Lion", "🦁", "Walks ahead of reclamation crews into rooms the Guardian still holds. Nothing in those rooms argues."],
        ["Cosmic Spirit", "✨", "Arrived with the Citadel and may simply be part of it. It has been patient with humanity so far."]
    ]
};
let adventureUIReady = false;
let activeHatch = null;
const HATCH_ROLL_DURATION = 4000;

function isZoneUnlocked(stage) {
    return stage === 1 || !!game["stage" + stage + "Unlocked"];
}
function normalizeAdventure(saved = {}) {
    const collection = { ...(saved.collection || {}) };
    return {
        ...ADVENTURE_DEFAULTS, ...saved,
        assembly: [...(saved.assembly || [])], shields: [...(saved.shields || [])],
        siteSearches: [...(saved.siteSearches || [0, 0, 0])],
        route: [...(saved.route || ADVENTURE_DEFAULTS.route)],
        collection, equipped: normalizePetEquipment(saved.equipped || {}, collection),
        autoEquipBest: { ...(saved.autoEquipBest || {}) },
        pity: { ...(saved.pity || {}) }, boosts: { ...(saved.boosts || {}) },
        progression: normalizeProgression(saved.progression)
    };
}
function petBonus(id) {
    return (game.adventure.collection[id] || 0) > 0 ? petBasePower(id) : 0;
}
function getCompanionMultiplier(stage) {
    const slots = validPetSlots(stage, game.adventure.equipped[stage], game.adventure.collection);
    const total = slots.reduce((sum, id) => sum + petBonus(id), 0);
    const boost = (game.adventure.boosts[stage] || 0) > Date.now() ? 2 : 1;
    return (1 + total) * boost;
}
function equipPet(stage, id) {
    if (!petInfo(id) || !isZoneUnlocked(stage) || !id.startsWith(stage + "-") || !game.adventure.collection[id]) return;
    reconcilePetEquipment(stage);
    const equipped = game.adventure.equipped[stage];
    if (equippedCopyCount(stage, id) >= game.adventure.collection[id]) return showNotification("All owned copies are already equipped.");
    if (equipped.length >= 3) return showNotification("Three companions equipped. Unequip one first.");
    equipped.push(id);
    updateGame();
    pulseVfx(el("companionPanel")?.querySelector(".pet-slots"));
    saveGame(false);
}
function hatchEgg(stage, { automatic = false } = {}) {
    if (automatic ? autoHatchSession?.stage !== stage : !!autoHatchSession) return;
    if (activeHatch || mergeSelection) return;
    if (!isZoneUnlocked(stage)) return;
    const zone = ZONES[stage];
    if (game[zone.currency] < zone.cost) return showNotification("Not enough " + zone.label + " to hatch.");
    game[zone.currency] -= zone.cost;
    let rarity;
    const misses = game.adventure.pity[stage] || 0;
    if (misses >= 9) {
        // Conditional odds among Rare+ (15:6:1); counter resets on any Rare+ hatch.
        const roll = Math.random() * 22;
        rarity = roll < 15 ? 2 : roll < 21 ? 3 : 4;
    } else {
        let roll = Math.random() * 100;
        rarity = RARITIES.findIndex(entry => (roll -= entry.weight) < 0);
        if (rarity < 0) rarity = 4;
    }
    game.adventure.pity[stage] = rarity >= 2 ? 0 : misses + 1;
    const id = stage + "-" + rarity;
    game.adventure.collection[id] = (game.adventure.collection[id] || 0) + 1;
    game.adventure.eggsHatched++;
    const slots = game.adventure.equipped[stage] ||= [];
    if (game.adventure.autoEquipBest[stage]) applyBestPets(stage);
    else if (slots.length < 3) slots.push(id);
    updateGame();
    // Credit and save exactly once BEFORE the visual roll. Skip/refresh never rerolls.
    saveGame(false);
    startHatchReveal(stage, rarity, id);
    return id;
}

function startHatchReveal(stage, rarity, id) {
    const modal = el("hatchModal"), strip = el("hatchStrip");
    if (!modal || !strip) return;
    clearHatchEffects();
    const [name, icon] = ZONE_PETS[stage][rarity];
    const hatch = activeHatch = {
        stage, rarity, name, icon, phase: "rolling", startedAt:Date.now(), timers: [],
        copies: game.adventure.collection[id], bonus: Math.round(petBonus(id) * 100)
    };
    modal.classList.remove("hatch-revealed");
    modal.style.setProperty("--hatch-color", "#ab94ff");
    strip.classList.remove("rolling", "settled");
    // A display-only tour of the egg's actual pets. It never draws another reward.
    const winningIndex = 28;
    strip.style.setProperty("--hatch-target", (-55 - winningIndex * 122) + "px");
    strip.innerHTML = Array.from({ length: winningIndex + 4 }, (_, i) => {
        const preview = i === winningIndex ? rarity : i % 5;
        return '<div class="hatch-tile' + (i === winningIndex ? ' winner' : '') + '" style="--tile-rarity:' + RARITIES[preview].color + '"><span' +
            (i === winningIndex ? ' id="hatchPrizeIcon"' : '') + '>' + petArtMarkup(stage + "-" + preview) + '</span><small>' + ZONE_PETS[stage][preview][0] + '</small></div>';
    }).join("");
    el("hatchTitle").textContent = ZONES[stage].egg;
    el("hatchStatus").textContent = "Rolling through this egg’s pets… Hatch odds are unchanged.";
    el("hatchResult").hidden = true;
    el("hatchSkipButton").textContent = "Skip animation";
    terminalProgress('hatchActionProgress',0,'Hatch reveal in progress');
    el("skipHatchAnimations").checked = !!game.skipHatchAnimations;
    document.body.classList.add("hatch-open");
    modal.showModal();
    if(typeof terminalModalOpened==='function')terminalModalOpened(modal);
    modal.scrollTop=0;el('hatchSkipButton')?.focus?.({preventScroll:true});
    animateVfx(modal, [{ opacity: .5, transform: "scale(.97)" }, { opacity: 1, transform: "scale(1)" }]);
    syncAutoHatchControls();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (game.skipHatchAnimations || reducedMotion || !canPlayVfx()) { revealHatch(); return; }
    // Let the initial position paint before transitioning toward the winning tile.
    hatch.timers.push(setTimeout(() => {
        if (activeHatch === hatch && hatch.phase === "rolling") strip.classList.add("rolling");
    }, 50));
    hatch.timers.push(setTimeout(() => {
        if (activeHatch === hatch) revealHatch();
    }, HATCH_ROLL_DURATION + 50));
    let tickAt = 50;
    for (const delay of [80, 100, 140, 200, 290, 400, 560, 750, 950]) {
        tickAt += delay;
        hatch.timers.push(setTimeout(() => {
            if (activeHatch === hatch && hatch.phase === "rolling") playSfx("click");
        }, tickAt));
    }
}

function clearHatchTimers() {
    if (activeHatch) activeHatch.timers.forEach(timer => clearTimeout(timer));
}
function revealHatch() {
    const hatch = activeHatch;
    if (!hatch || hatch.phase !== "rolling") return;
    hatch.phase = "revealed";
    clearHatchTimers();
    const rarity = RARITIES[hatch.rarity], zone = ZONES[hatch.stage];
    el("hatchStrip").classList.add("settled");
    el("hatchModal").classList.add("hatch-revealed");
    el("hatchModal").style.setProperty("--hatch-color", rarity.color);
    el("hatchRarity").textContent = rarity.name;
    el("hatchPetName").textContent = hatch.name;
    el("hatchPetBonus").textContent = "+" + petPowerText(hatch.stage + "-" + hatch.rarity) + "% " + zone.label + " power";
    el("hatchPetCopies").textContent = hatch.copies > 1
        ? "Duplicate collected · " + hatch.copies + " owned · merge copies into Gold in Inventory"
        : "New companion added to your collection!";
    el("hatchStatus").textContent = "You hatched " + hatch.name + "!";
    el("hatchResult").hidden = false;
    terminalProgress('hatchActionProgress',100,'Hatch revealed');
    pulseVfx(el("hatchResult"), rarity.color);
    el("hatchSkipButton").textContent = "Continue";
    terminalHatchReveal();
    scheduleAutoHatchReveal();
}
function closeHatchReveal({ continueAuto = false } = {}) {
    if (!continueAuto && autoHatchSession) stopAutoHatch();
    if (!activeHatch) return;
    if (activeHatch.phase === "rolling") revealHatch();
    clearHatchTimers();
    clearHatchEffects();
    activeHatch = null;
    el("hatchModal").close();
    document.body.classList.remove("hatch-open");
    // The companion panel refreshes during the hatch, replacing the original button.
    el("companionPanel")?.querySelector('button[data-pet-action="hatch"]')?.focus?.();
}
function toggleHatchAnimationPreference(skip) {
    game.skipHatchAnimations = !!skip;
    saveGame(false);
    if (skip) revealHatch();
}
function buyZoneBoost(stage) {
    if (!isZoneUnlocked(stage)) return;
    const zone = ZONES[stage];
    if ((game.adventure.boosts[stage] || 0) > Date.now()) return showNotification("Your booster is already active.");
    if (game[zone.currency] < zone.boostCost) return showNotification("Not enough " + zone.label + ".");
    game[zone.currency] -= zone.boostCost;
    game.adventure.boosts[stage] = Date.now() + 60000;
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}
function unlockNextZone(stage) {
    const a = game.adventure;
    const eligible = stage < 5 && progressionObjective(stage).ready;
    if (!isZoneUnlocked(stage) || !eligible || isZoneUnlocked(stage + 1)) return false;
    if (stage === 1) a.beaconLit = true;
    if (stage === 2) game.scrap -= 500;
    if (stage === 3) game.parts -= 800;
    game["stage" + (stage + 1) + "Unlocked"] = true;
    celebrateEvent("zone", ZONES[stage + 1].name, "Quest complete! " + ZONES[stage + 1].label + " production is now online.", ZONES[stage + 1].icon);
    return true;
}
function grantZoneResource(stage, amount, feedback = true) {
    const currency = ZONES[stage].currency;
    game[currency] += amount;
    if (feedback) pulseResource(stage);
    if (stage === 1) { game.totalSalvage += amount; game.lifetimeSalvage += amount; }
}
function zoneRate(stage) {
    return [null, getSalvagePerSecond, getScrapPerSecond, getPartsPerSecond, getCircuitsPerSecond, getCoresPerSecond][stage]();
}
function zoneAction(stage, action, choice, automatic = false) {
    if (!isZoneUnlocked(stage) || !gameStarted || window.LastCityCloud?.isSwitching?.() || el("accountModal")?.open) return;
    if (handleProgressionAction(stage, action, choice)) return;
    if (stage === 4 && action === "node") return;
    const a = game.adventure;
    if (action === "unlock") {
        if (!unlockNextZone(stage)) return showNotification("Complete the zone objective first.");
    } else if (stage === 2 && action === "search") {
        if (!Number.isInteger(choice) || choice < 0 || choice > 2 || Date.now() < a.cooldownUntil) return;
        a.cooldownUntil = Date.now() + searchDuration();
        a.searches++;
        const previousKeys = a.keys;
        a.siteSearches[choice]++;
        a.keys = Math.max(previousKeys, a.siteSearches.filter(count => count >= 8).length
            + Number(a.siteSearches[0] >= 14) + Number(a.siteSearches[1] >= 14));
        const value = searchReward(choice);
        grantZoneResource(2, value, !automatic);
        if (a.keys > previousKeys || !automatic) showNotification(a.keys > previousKeys ? "Depot key recovered! " + a.keys + "/5" : "+" + formatNumber(value) + " Scrap recovered");
        if (!automatic) playSfx("dispatch");
    } else if (stage === 5 && action === "channel") {
        if (Date.now() < (a.coreReadyAt || 0)) return;
        a.coreReadyAt = Date.now() + 1000;
        const reward = coreChannelReward();
        grantZoneResource(5, reward);
        showFloatingGain(el("zone5"), "+" + formatNumber(reward) + " Cores");
        playSfx("click");
    } else if (stage === 5 && action === "shield") {
        if (!Number.isInteger(choice) || choice < 0 || choice > 2 || a.bossDefeated) return;
        if (!a.shields.includes(choice)) a.shields.push(choice);
    } else if (stage === 5 && action === "fire") {
        if (a.shields.length !== 3 || game.cores < cannonCost() || a.bossDefeated) return showNotification("Disable all shields and have " + cannonCost() + " Cores ready.");
        game.cores -= cannonCost();
        a.shields = [];
        a.bossHealth = Math.max(0, a.bossHealth - 25);
        playSfx("critical");
        if (a.bossHealth === 0) {
            a.bossDefeated = true;
            game.ascensionTokens += 15;
            // 300 Cores was set when a Citadel made a few Cores a second. The
            // game's final victory should not pay less than a second of the
            // player's own production, so the prize is two minutes of it.
            const prize = Math.max(300, Math.ceil(getCoresPerSecond() * 120));
            grantZoneResource(5, prize);
            celebrateEvent("boss", "Guardian defeated", "+" + formatNumber(prize) + " Cores · +15 Ascension Tokens · permanent ×2 Core production", "🏆");
        }
    } else return;
    updateGame();
    saveGame(false);
}
function zoneObjective(stage) {
    if (stage <= 4) return progressionObjective(stage);
    const a = game.adventure;
    return { progress: 1 - a.bossHealth / 100, detail: "Guardian health " + a.bossHealth + "/100", ready: a.bossDefeated };
}
function renderZone(stage) {
    if (stage <= 4) return renderProgressionZone(stage);
    const mount = el("zone" + stage);
    if (!mount) return;
    const zone = ZONES[stage], a = game.adventure, objective = zoneObjective(stage);
    let activity = "";
    if (stage === 5) {
        activity = '<div class="activity-buttons"><button data-action="channel" ' + (Date.now() < (a.coreReadyAt || 0) ? 'disabled' : '') + '>Channel reactor · +' + formatNumber(coreChannelReward()) + ' Cores</button></div><div class="guardian-avatar">' + (a.bossDefeated ? "🏆" : "🤖") + '</div><div class="guardian-health"><div style="width:' + a.bossHealth + '%"></div></div><div class="activity-buttons">' + [0, 1, 2].map(n => '<button data-action="shield" data-choice="' + n + '" ' + (a.shields.includes(n) || a.bossDefeated ? "disabled" : "") + '>' + (a.shields.includes(n) ? "✓ Disabled" : "Break shield " + (n + 1)) + '</button>').join("") + '<button data-action="fire" ' + (a.shields.length !== 3 || game.cores < cannonCost() || a.bossDefeated ? "disabled" : "") + '>Fire cannon · ' + cannonCost() + ' Cores</button></div><p class="activity-tip">Cannon costs rise with each shot: 100 → 200 → 400 → 800 Cores. Each shot deals 25 damage. Shields regenerate after a shot. Victory grants permanent ×2 Core production and the Legacy Glyph Archive.</p>';
    }
    if(stage===5)activity+='<progress id="channelActionProgress" class="terminal-action-progress" max="100" value="100" aria-label="Reactor channel cooldown"></progress>';
    const completed = stage === 5 ? a.bossDefeated : isZoneUnlocked(stage + 1);
    mount.innerHTML = '<article class="zone-scene zone-' + stage + '"><div class="zone-scenery" aria-hidden="true"><span>' + zone.icon + '</span><i></i><i></i><i></i></div><div class="zone-content"><p class="eyebrow">ZONE ' + stage + ' · ' + zone.label.toUpperCase() + '</p><h2>' + zone.name + '</h2><p class="zone-lore">' + zone.lore + '</p><div class="zone-quest"><strong>' + (completed ? "✓ Zone objective complete" : zone.quest) + '</strong><span>' + objective.detail + '</span></div>' + activity + (stage < 5 ? '<button class="zone-unlock" data-action="unlock" ' + (completed || !objective.ready ? "disabled" : "") + '>' + (completed ? "✓ " + zone.next + " unlocked" : stage === 1 ? "Restore the beacon → " + zone.next : "Open " + zone.next) + '</button>' : "") + '<p class="zone-pet-summary">Companion power: ×' + getCompanionMultiplier(stage).toFixed(2) + ' · Hatch ' + zone.egg + ' in the Companions tab.</p></div></article>';
}
function renderCompanions() {
    const panel = el("companionPanel");
    if (!panel || currentGameMode !== "companions") return;
    const markup = companionContentMarkup(currentStageView);
    if (panel.innerHTML !== markup) panel.innerHTML = markup;
}
function initAdventureUI() {
    initPetUI();
    el("hatchSkipButton")?.addEventListener("click", () => {
        if (activeHatch?.phase === "rolling") revealHatch();
        else if (autoHatchSession) advanceAutoHatch();
        else closeHatchReveal();
    });
    el("skipHatchAnimations")?.addEventListener("change", event => toggleHatchAnimationPreference(event.target.checked));
    el("hatchModal")?.addEventListener("cancel", event => {
        event.preventDefault();
        if (autoHatchSession) stopAutoHatch();
        if (activeHatch?.phase === "rolling") revealHatch();
        else closeHatchReveal();
    });
    el("hatchModal")?.addEventListener("close", () => {
        if (el("hatchModal").open) return;
        if (activeHatch && autoHatchSession) stopAutoHatch();
        clearHatchTimers();
        activeHatch = null;
        document.body.classList.remove("hatch-open");
    });
    for (let stage = 1; stage <= 5; stage++) {
        for (const id of ['zone' + stage, 'purchaseBuildings' + stage]) {
            const mount = el(id);
            if (mount) mount.addEventListener("click", event => {
                const button = event.target.closest("button[data-action]");
                if (!button || button.disabled) return;
                const raw = button.dataset.choice;
                const choice = raw === undefined ? undefined : /^[0-9]+$/.test(raw) ? Number(raw) : raw;
                zoneAction(stage, button.dataset.action, choice);
            });
        }
    }
    el("companionPanel")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-pet-action]");
        if (!button || button.disabled) return;
        if (button.dataset.petAction === "hatch") hatchEgg(currentStageView);
        if (button.dataset.petAction === "boost") buyZoneBoost(currentStageView);
        if (button.dataset.petAction === "equip") equipPet(petInfo(button.dataset.id)?.stage, button.dataset.id);
        if (button.dataset.petAction === "unequip") unequipPet(petInfo(button.dataset.id)?.stage, button.dataset.id);
        if (button.dataset.petAction === "best") equipBestPets(currentStageView);
        if (button.dataset.petAction === "auto-best") toggleAutoEquipBest(currentStageView);
        if (button.dataset.petAction === "auto-hatch") {
            if (autoHatchSession) stopAutoHatch();
            else startAutoHatch(currentStageView);
        }
        if (button.dataset.petAction === "view") {
            const nextView = button.dataset.view === "inventory" ? "inventory" : "eggs";
            if (nextView !== companionView) {
                companionView = nextView;
                checkAutoHatchContext();
                renderCompanions();
                animateViewEntry(el("companionPanel"));
            }
        }
        if (button.dataset.petAction === "filter") {
            if (button.dataset.filter === "scope") inventoryScope = button.dataset.value === "all" ? "all" : "zone";
            if (button.dataset.filter === "kind") inventoryKind = ["normal", "gold"].includes(button.dataset.value) ? button.dataset.value : "all";
            renderCompanions();
            animateViewEntry(el("companionPanel"));
        }
        if (button.dataset.petAction === "merge") openPetMerge(button.dataset.id);
    });
    adventureUIReady = true;
    renderAdventure();
    setInterval(updateCollectionField, 150);
}
function renderAdventure() {
    if (!adventureUIReady) return;
    document.body.dataset.zone = currentStageView;
    if (currentGameMode === "city") renderZone(currentStageView);
    renderCompanions();
}
