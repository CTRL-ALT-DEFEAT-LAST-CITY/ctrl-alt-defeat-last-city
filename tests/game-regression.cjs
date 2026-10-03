const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the actual game logic without audio, timers or a player's saved data.
const root = path.join(__dirname, "..");
const nodes = new Map();
function node() {
    return {
        textContent: "", _html: "", children: [], style: { setProperty() {} },
        get innerHTML() { return this._html; },
        set innerHTML(value) {
            this._html = value;
            this.children = [];
            for (const match of value.matchAll(/id="([^"]+)"/g)) {
                if (!nodes.has(match[1])) { const entry = node(); entry.id = match[1]; nodes.set(match[1], entry); }
            }
        },
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        dataset: {}, firstChild: { textContent: "" },
        parentElement: { style: {} },
        addEventListener() {}, setAttribute() {}, append() {},
        showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
        appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
        remove() { if (this.id) nodes.delete(this.id); },
        querySelectorAll(selector) { return selector === ".energy-pickup" ? [...nodes.values()].filter(entry => entry.id?.startsWith("energy-")) : []; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 80 }; },
        querySelector() { return node(); }
    };
}
for (const match of fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/id="([^"]+)"/g)) {
    assert(!nodes.has(match[1]), "HTML IDs must be unique");
    nodes.set(match[1], node());
}
const storage = new Map();
const pendingTimers = new Map();
let timerSequence = 0;
const context = vm.createContext({
    console, Date, Math: Object.create(Math), setInterval() {},
    setTimeout(fn, delay) { const id = ++timerSequence; pendingTimers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { pendingTimers.delete(id); },
    window: {},
    document: {
        body: node(), activeElement: node(),
        getElementById: id => nodes.get(id) || null,
        querySelectorAll: () => [],
        querySelector: () => node(),
        createElement: () => node()
    },
    localStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    }
});
vm.runInContext(fs.readFileSync(path.join(root, "progression.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "adventure.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "pets.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "effects.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "game.js"), "utf8"), context);
const run = code => vm.runInContext(code, context);
// Existing economy tests complete the cosmetic reveal before buying another egg.
const hatch = stage => run("(() => { const id = hatchEgg(" + stage + "); closeHatchReveal(); return id; })()");

// The reported bug: very high income must never block four City Centers.
run("game.buildings.citycenter = 3");
assert.equal(run("getRebirthRequirement().check()"), false);
run("game.buildings.citycenter = 4; game.buildings.power = 100");
assert.equal(run("getRebirthRequirement().check()"), true);
assert.equal(run("getRebirthRequirement().display().includes('No waiting required')"), true);
for (const rebirths of [0, 1, 2, 3, 10]) {
    run("game.rebirths = " + rebirths);
    assert.equal(run("getRebirthRequirement().check()"), true);
}
run("game.rebirths = 0; game.lifetimeSalvage = 12345678; doRebirth()");
assert.equal(run("game.rebirths"), 1);
assert.equal(run("game.buildings.citycenter"), 0);
assert.equal(run("game.shards"), 6);
assert.equal(run("game.lifetimeSalvage"), 12345678);
assert.equal(run("getRebirthRequirement().check()"), false);
assert.equal(run("game.achievements.reborn"), true);
assert.equal(run("celebrationQueue.some(event => event.kind === 'achievement')"), true);

// All purchase kinds still work with formatted prices and animation effects.
run("game.salvage = 100; buyTechUpgrade('sturdyGloves')");
assert.equal(run("game.cityTech.sturdyGloves"), 1);
assert.equal(run("game.salvage"), 60);
run("buyRebirthUpgrade('efficient')");
assert.equal(run("game.rebirthUpgrades.efficient"), 1);
run("game.stage2Unlocked = true; game.scrap = 100; buyUpgrade(2, 'scrapRate')");
assert.equal(run("game.stage2Upgrades.scrapRate"), 1);
run("game.scrapTokens = 5; buyResetUpgrade(2, 'scrapIncome')");
assert.equal(run("game.stage2ResetUpgrades.scrapIncome"), 1);

assert.equal(run("Object.keys(ACHIEVEMENTS).length"), 25);
run("game.totalClicks = 1000; checkAchievements()");
assert.equal(run("game.achievements.busyHands"), true);
const queueLength = run("celebrationQueue.length");
run("checkAchievements()");
assert.equal(run("celebrationQueue.length"), queueLength, "Badges must celebrate once");

assert.equal(run("formatNumber(999)"), "999");
assert.equal(run("formatNumber(12345)"), "12,345");
assert.equal(run("formatNumber(1000000)"), "1.00e6");
assert.equal(run("formatNumber(1234567890)"), "1.23e9");
assert.equal(run("formatNumber(1e100)"), "1.00e100");
assert.equal(run("formatNumber(0.2)"), "0.2");
assert.equal(run("formatNumber(Infinity)"), "∞");
run("game.salvage = 1e12; updateGame(); saveGame(false); loadGame()");
assert.equal(nodes.get("salvage").textContent, "1.00e12");
assert.equal(run("game.achievements.busyHands"), true);
console.log("Passed: Rebirth eligibility/reset, purchases, 25 badges, one-time celebrations, scientific formatting and save/load.");

// Stage access requires the actual quest rather than elapsed resets.
run("game = JSON.parse(JSON.stringify(defaultGame)); game.rebirths = 10; updateGame()");
assert.equal(run("game.stage2Unlocked"), false);
assert.equal(run("unlockNextZone(1)"), false);
run("game.buildings.citycenter = 4; game.salvage = 1700000; zoneAction(1, 'unlock')");
assert.equal(run("game.stage2Unlocked"), false, "City Centers alone do not complete the restoration project");
for (let i = 0; i < 3; i++) run("zoneAction(1, 'beacon')");
assert.equal(run("game.adventure.progression.beaconModules"), 3);
run("zoneAction(1, 'unlock')");
assert.equal(run("game.stage2Unlocked"), true);
assert.equal(run("game.salvage"), 0);
assert.equal(run("game.adventure.beaconLit"), true);
for (let i = 0; i < 14; i++) run("game.adventure.cooldownUntil = 0; zoneAction(2, 'search', 0)");
assert.equal(run("game.adventure.keys"), 2, "Camping one site cannot recover all the keys");
for (const site of [1, 2]) {
    for (let i = 0; i < (site === 1 ? 14 : 8); i++) run("game.adventure.cooldownUntil = 0; zoneAction(2, 'search', " + site + ")");
}
assert.equal(run("game.adventure.keys"), 5);
assert.equal(run("game.stage3Unlocked"), false);
run("zoneAction(2, 'unlock')");
assert.equal(run("game.stage3Unlocked"), false, "Keys alone do not open the upgraded depot");
run("game.scrap = 1000; buyInfrastructure(2, 'depotCamp'); buyInfrastructure(2, 'depotCamp'); zoneAction(2, 'unlock')");
assert.equal(run("game.stage3Unlocked"), true);
run("game.parts = 5000; zoneAction(3, 'component', 'Plate')");
assert.equal(run("game.adventure.assembly.length"), 0);
for (let i = 0; i < 18; i++) {
    run("for (const piece of engineRecipe().pieces) zoneAction(3, 'component', piece); zoneAction(3, 'assemble')");
    run("zoneAction(3, 'deliver')");
    assert.equal(run("game.adventure.deliveries"), i, "Production cannot be delivered instantly");
    run("game.adventure.progression.production.readyAt = Date.now() - 1; zoneAction(3, 'deliver')");
}
assert.equal(run("game.adventure.deliveries"), 18);
run("zoneAction(3, 'unlock')");
assert.equal(run("game.stage4Unlocked"), false, "Production also needs upgraded infrastructure");
run("buyInfrastructure(3, 'assemblyLine'); buyInfrastructure(3, 'assemblyLine')");
run("zoneAction(3, 'unlock')");
assert.equal(run("game.stage4Unlocked"), true);
run("currentStageView = 4; currentGameMode = 'city'; renderAdventure(); updateCollectionField(Date.now())");
assert.equal(run("game.adventure.progression.fieldNodes.length"), 5, "Field starts with collectibles ready");
const field = nodes.get("collectionField");
run("updateGame()");
assert.equal(nodes.get("collectionField"), field, "HUD renders preserve the field instance");
const firstPickup = run("game.adventure.progression.fieldNodes[0].id");
const beforePickup = run("game.circuits");
assert.equal(run("collectFieldNode(" + firstPickup + ")"), true);
assert.equal(run("collectFieldNode(" + firstPickup + ")"), false, "A pickup cannot pay twice");
assert.ok(run("game.circuits") > beforePickup);
// Spawning is bounded, uses distinct cells, and pauses outside the active field.
run("for (let i = 0; i < 20; i++) spawnFieldNode()");
assert.equal(run("game.adventure.progression.fieldNodes.length"), 10);
assert.equal(run("new Set(game.adventure.progression.fieldNodes.map(n => n.cell)).size"), 10);
run("game.adventure.progression.fieldNodes = []; document.hidden = true; updateCollectionField(Date.now() + 10000)");
assert.equal(run("game.adventure.progression.fieldNodes.length"), 0);
run("document.hidden = false; currentGameMode = 'upgrades'; updateCollectionField(Date.now() + 10000)");
assert.equal(run("game.adventure.progression.fieldNodes.length"), 0);
run("currentGameMode = 'city'; updateCollectionField(Date.now() + 10000)");
assert.equal(run("game.adventure.progression.fieldNodes.length"), 1);
const initialInterval = run("fieldInterval()");
run("game.circuits = 1000; buyInfrastructure(4, 'pulseFrequency')");
assert.ok(run("fieldInterval()") < initialInterval);
run("buyInfrastructure(4, 'collectionDrone'); spawnFieldNode(); lastDroneCollection = 0; updateCollectionField(Date.now())");
const droneCollected = run("game.adventure.progression.fieldCollected");
run("updateCollectionField(Date.now() + 1000)");
assert.equal(run("game.adventure.progression.fieldCollected"), droneCollected, "Drone must obey its collection interval");
run("game.adventure.progression.infrastructure.collectionDrone = 0; game.adventure.progression.fieldCollected = 1");
run("for (let i = 1; i < 80; i++) { if (!game.adventure.progression.fieldNodes.length) spawnFieldNode(); collectFieldNode(game.adventure.progression.fieldNodes[0].id); }");
assert.equal(run("game.adventure.progression.fieldCollected"), 80);
run("zoneAction(4, 'unlock')");
assert.equal(run("game.stage5Unlocked"), false, "Collecting alone must not skip tower investment");
run("game.circuits = 2000; for (let i = 0; i < 3; i++) zoneAction(4, 'tower')");
assert.equal(run("game.adventure.progression.relayTowers"), 3);
run("zoneAction(4, 'unlock')");
assert.equal(run("game.stage5Unlocked"), true);
run("game.cores = 100; zoneAction(5, 'fire')");
assert.equal(run("game.adventure.bossHealth"), 100);
run("game.ascensionTokens = 200; buyResetUpgrade(5, 'lastCity')");
assert.equal(run("game.gameCompleted"), false, "Final rebuild requires the boss victory");
assert.equal(run("game.ascensionTokens"), 200);
run("game.ascensionTokens = 0");
for (let i = 0; i < 4; i++) run("for (const n of [0,1,2]) zoneAction(5, 'shield', n); zoneAction(5, 'fire')");
assert.equal(run("game.adventure.bossDefeated"), true);
assert.equal(run("game.ascensionTokens"), 15);
const victoryCores = run("game.cores");
run("zoneAction(5, 'fire')");
assert.equal(run("game.cores"), victoryCores, "Boss reward may only be collected once");
run("game.ascensionTokens = 200; buyResetUpgrade(5, 'lastCity')");
assert.equal(run("game.gameCompleted"), true, "Guardian victory permits the final rebuild");

// Spending, deterministic pity, duplicate strength and equipment limits.
run("game.salvage = 0");
assert.equal(run("hatchEgg(1)"), undefined);
run("game.salvage = 100000; Math.random = () => 0");
for (let i = 0; i < 9; i++) assert.equal(hatch(1), "1-0");
assert.equal(run("game.adventure.pity[1]"), 9);
assert.equal(hatch(1), "1-2", "Tenth low-rarity streak must award Rare+");
assert.equal(run("game.adventure.pity[1]"), 0);
assert.equal(run("game.adventure.collection['1-0']"), 9);
assert.equal(run("petBonus('1-0')"), .08, "Duplicate copies are merge materials, not passive power");
assert.equal(run("game.adventure.equipped[1].length"), 3, "Three duplicate copies fill the three slots");
run("Math.random = () => .99");
hatch(1);
assert.equal(run("game.adventure.equipped[1].length"), 3);
assert.equal(run("game.adventure.collection['1-4']"), 1);
run("game.adventure.collection['1-1'] = 1; equipPet(1, '1-1')");
assert.equal(run("game.adventure.equipped[1].length"), 3);
run("unequipPet(1, '1-0'); equipPet(1, '1-1')");
assert.equal(run("game.adventure.equipped[1].includes('1-1')"), true);
const unboosted = run("getCompanionMultiplier(1)");
run("buyZoneBoost(1)");
assert.equal(run("getCompanionMultiplier(1)"), unboosted * 2);
const balanceAfterBoost = run("game.salvage");
run("buyZoneBoost(1)");
assert.equal(run("game.salvage"), balanceAfterBoost, "Active boosts cannot be accidentally rebought");
run("game.adventure.boosts[1] = Date.now() - 1");
assert.equal(run("getCompanionMultiplier(1)"), unboosted);
const petCount = run("game.adventure.eggsHatched");
run("game.buildings.citycenter = 4; doRebirth(); game.stage2Upgrades.scrapRate = 3; doStage2Reset()");
assert.equal(run("game.adventure.eggsHatched"), petCount);
assert.equal(run("game.adventure.keys"), 5);
assert.equal(run("game.adventure.bossDefeated"), true);
run("saveGame(false); loadGame()");
assert.equal(run("game.adventure.eggsHatched"), petCount);
assert.equal(run("game.adventure.deliveries"), 18);
assert.equal(run("game.adventure.progression.beaconModules"), 3);
assert.equal(run("infrastructureLevel('assemblyLine')"), 2);
assert.equal(run("game.adventure.progression.relayTowers"), 3);
run("game.parts = 1000; for (const piece of engineRecipe().pieces) zoneAction(3, 'component', piece); zoneAction(3, 'assemble'); saveGame(false); loadGame()");
assert.ok(run("game.adventure.progression.production.readyAt > Date.now()"), "Active production survives save/load");
run("currentStageView = 2; currentGameMode = 'city'; renderAdventure()");
assert.ok(nodes.get("zone2").innerHTML.includes("Overgrown Depot"));
assert.ok(nodes.get("zone2").innerHTML.includes("Rusted Train"));
run("currentStageView = 5; currentGameMode = 'companions'; renderAdventure()");
assert.ok(nodes.get("companionPanel").innerHTML.includes("Astral Egg"));
assert.ok(nodes.get("companionPanel").innerHTML.includes("Guaranteed Rare"));
// Old saves keep earned stage access and receive a fresh adventure inventory.
run("localStorage.setItem(SAVE_KEY, JSON.stringify({stage2Unlocked: true, lastSeen: Date.now()})); loadGame()");
assert.equal(run("game.stage2Unlocked"), true);
assert.equal(run("game.adventure.eggsHatched"), 0);
assert.equal(run("game.adventure.route.length"), 4);
run("game.adventure.keys = 5; game.adventure.cooldownUntil = 0; zoneAction(2, 'search', 0)");
assert.equal(run("game.adventure.keys"), 5, "Updated thresholds cannot remove previously earned keys");
console.log("Passed: restoration/depot/production quests, timed jobs, persistent energy collection, tower gates, boss victory, pets, boosters, reset persistence and legacy saves.");

// Funding meters must reflect currency, not level progress or formatted prices.
assert.ok(run("purchaseProgressMarkup(20, 40)").includes('aria-valuenow="50"'));
assert.ok(run("purchaseProgressMarkup(-5, 40)").includes('aria-valuenow="0"'));
assert.ok(run("purchaseProgressMarkup(500, 40)").includes('aria-valuenow="100"'));
assert.ok(run("purchaseProgressMarkup(500, 40)").includes("Ready to buy"));
assert.ok(!run("purchaseProgressMarkup(500, 40, true)").includes("progressbar"));
assert.ok(!run("purchaseProgressMarkup(500, 40, false, true)").includes("Ready to buy"));
run("game = JSON.parse(JSON.stringify(defaultGame)); currentStageView = 1; game.salvage = 20; renderTechUpgrades(); renderPurchaseOutlook()");
assert.equal(nodes.get("techUpgrades").children.length, run("Object.keys(TECH_UPGRADES).length"));
assert.ok(nodes.get("techUpgrades").children[0].innerHTML.includes('aria-valuenow="50"'));
assert.ok(nodes.get("nextPurchase1").innerHTML.includes("Sturdy Gloves"));
assert.ok(nodes.get("nextPurchase1").innerHTML.includes("20 Salvage to go"));
run("game.salvage = 40; buyTechUpgrade('sturdyGloves'); renderPurchaseOutlook()");
assert.ok(nodes.get("nextPurchase1").innerHTML.includes('aria-valuenow="0"'), "Spending updates funding immediately");
for (let stage = 2; stage <= 5; stage++) {
    run("currentStageView = " + stage + "; renderPurchaseOutlook()");
    assert.ok(nodes.get("nextPurchase" + stage).innerHTML.includes("NEXT INVESTMENT"));
}
assert.ok(run("infrastructureMarkup(4)").includes('aria-label="Purchase funding"'));

// Check the new sidebar wrappers, stylesheet order and valid tag nesting.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.equal((html.match(/class="upgrade-sidebar"/g) || []).length, 5);
assert.ok(html.indexOf('href="cyberpunk.css"') > html.indexOf('href="style.css"'));
const stack = [], voidTags = new Set(["meta", "link", "input", "br", "hr", "img", "source", "area", "base", "embed", "param", "track", "wbr"]);
for (const tag of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/)?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const name = tag[2].toLowerCase();
    if (tag[1]) assert.equal(stack.pop(), name, "HTML wrappers must close in nesting order");
    else if (!voidTags.has(name)) stack.push(name);
}
assert.equal(stack.length, 0);
console.log("Passed: funding percentages, locked/maxed states, all-stage dashboards, upgrade meters and sidebar HTML structure.");

// Cosmetic hatching cannot change the reward, odds, currency spend or saved inventory.
run("game = JSON.parse(JSON.stringify(defaultGame)); game.salvage = 1000; Math.random = () => .99");
const rolledPet = run("hatchEgg(1)");
assert.equal(rolledPet, "1-4");
assert.equal(run("game.salvage"), 850);
assert.equal(run("activeHatch.phase"), "rolling");
for (const name of ["Ash Mouse", "Camp Cat", "Ember Fox", "Flame Owl", "Phoenix"]) assert.ok(nodes.get("hatchStrip").innerHTML.includes(name));
assert.ok(!nodes.get("hatchStrip").innerHTML.includes(">?</"));
assert.equal(nodes.get("hatchResult").hidden, true);
assert.equal(nodes.get("hatchModal").open, true);
assert.equal(run("JSON.parse(localStorage.getItem(SAVE_KEY)).adventure.collection['1-4']"), 1);
assert.equal(run("hatchEgg(1)"), undefined, "Double presses cannot buy another egg during a reveal");
assert.equal(run("game.salvage"), 850);
const rollingTimers = run("activeHatch.timers.slice()");
const settleTimer = rollingTimers.find(id => pendingTimers.get(id)?.delay === 4050);
assert.ok(settleTimer, "The reel has a timed landing");
const oldLanding = pendingTimers.get(settleTimer).fn;
oldLanding();
assert.equal(run("activeHatch.phase"), "revealed");
assert.equal(nodes.get("hatchPetName").textContent, "Phoenix");
assert.equal(nodes.get("hatchRarity").textContent, "Legendary");
assert.equal(nodes.get("hatchSkipButton").textContent, "Continue");
assert.equal(nodes.get("hatchResult").hidden, false);
assert.ok(rollingTimers.every(id => !pendingTimers.has(id)), "Landing cancels the remaining roll timers");
run("revealHatch(); closeHatchReveal()");
assert.equal(run("game.adventure.eggsHatched"), 1);
assert.equal(nodes.get("hatchModal").open, false);
run("Math.random = () => 0; hatchEgg(1)");
oldLanding();
assert.equal(run("activeHatch.phase"), "rolling", "A stale callback cannot finish a later hatch");
const skipTimers = run("activeHatch.timers.slice()");
run("revealHatch(); revealHatch()");
assert.equal(nodes.get("hatchPetName").textContent, "Ash Mouse");
assert.equal(run("game.adventure.eggsHatched"), 2, "Skipping never draws or grants again");
assert.equal(run("game.salvage"), 700);
assert.ok(skipTimers.every(id => !pendingTimers.has(id)), "Skip cancels animation timers");
run("toggleHatchAnimationPreference(true); closeHatchReveal(); saveGame(false); loadGame(); hatchEgg(1)");
assert.equal(run("game.skipHatchAnimations"), true);
assert.equal(run("activeHatch.phase"), "revealed", "Saved skip preference reveals instantly");
assert.equal(run("activeHatch.timers.length"), 0);
assert.ok(nodes.get("hatchPetCopies").textContent.includes("Duplicate"));
run("closeHatchReveal(); game.skipHatchAnimations = false; window.matchMedia = () => ({matches: true}); hatchEgg(1)");
assert.equal(run("activeHatch.phase"), "revealed", "Reduced motion bypasses the roll");
run("closeHatchReveal(); window.matchMedia = () => ({matches: false})");
for (let stage = 2; stage <= 5; stage++) {
    run("game.stage" + stage + "Unlocked = true; game[ZONES[" + stage + "].currency] = 1000; hatchEgg(" + stage + "); revealHatch()");
    assert.equal(nodes.get("hatchPetName").textContent, run("ZONE_PETS[" + stage + "][0][0]"));
    run("closeHatchReveal()");
}
console.log("Passed: mystery roll/landing, skip, stale timers, duplicate feedback, instant preference, reduced motion, all-zone reveals and exactly-once saved rewards.");

// Confirmed merge transactions consume every selected copy, including failures.
run("game = JSON.parse(JSON.stringify(defaultGame)); game.salvage = 123; game.adventure.collection = {'1-0': 9, '1-1': 2}; game.adventure.equipped[1] = ['1-0', '1-1']");
for (const amount of [0, 1, 7, 2.5, "6"]) {
    assert.equal(run("mergePets('1-0', " + JSON.stringify(amount) + ")"), null);
}
assert.equal(run("mergePets('1-0-invalid', 2)"), null);
assert.equal(run("mergePets('2-0', 2)"), null);
assert.equal(run("game.adventure.collection['1-0']"), 9);
run("Math.random = () => .99");
const guaranteed = run("mergePets('1-0', 6)");
assert.equal(guaranteed.success, true);
assert.equal(run("game.adventure.collection['1-0']"), 3);
assert.equal(run("game.adventure.collection['1-0-gold']"), 1);
assert.equal(run("game.adventure.collection['1-1']"), 2);
assert.equal(run("game.salvage"), 123, "Merges have no hidden currency fee");
assert.equal(run("petBonus('1-0-gold')"), run("petBonus('1-0') * 1.25"));
assert.equal(run("mergePets('1-0-gold', 2)"), null, "Gold cannot be merged again");
assert.equal(run("mergePets('1-0', 4)"), null, "Cannot select more copies than owned");
assert.equal(run("mergePets('1-0', 3).success"), false);
assert.equal(run("game.adventure.collection['1-0']"), undefined);
assert.equal(run("game.adventure.equipped[1].includes('1-0')"), false, "Consumed pet types cannot remain equipped");
assert.equal(run("game.adventure.collection['1-0-gold']"), 1, "Failure grants no extra gold pet");
assert.equal(run("game.adventure.mergesAttempted"), 2);
assert.equal(run("game.adventure.goldPetsCreated"), 1);
assert.equal(run("JSON.parse(localStorage.getItem(SAVE_KEY)).adventure.collection['1-0']"), undefined, "Losses save immediately");
for (const [amount, chance] of [[2, 10], [3, 25], [4, 50], [5, 75], [6, 100]]) {
    assert.equal(run("MERGE_CHANCES[" + amount + "]"), chance);
    run("game.adventure.collection['1-2'] = " + amount + "; Math.random = () => .99");
    assert.equal(run("mergePets('1-2', " + amount + ").success"), amount === 6);
    assert.equal(run("game.adventure.collection['1-2']"), undefined);
}
run("game.adventure.collection['1-3'] = 5; Math.random = () => .749999");
assert.equal(run("mergePets('1-3', 5).success"), true);
run("game.adventure.collection['1-3'] = 5; Math.random = () => .75");
assert.equal(run("mergePets('1-3', 5).success"), false, "Five-copy chance is exactly 75%");

// Inventory permits explicit normal/gold equipment while respecting zone slots.
run("game.adventure.collection['1-1'] = 1; game.adventure.collection['1-2'] = 1; game.adventure.collection['1-4'] = 1; game.adventure.equipped[1] = []; equipPet(1,'1-1'); equipPet(1,'1-2'); equipPet(1,'1-4'); equipPet(1,'1-0-gold')");
assert.equal(run("game.adventure.equipped[1].includes('1-0-gold')"), false);
run("unequipPet(1,'1-4'); equipPet(1,'1-0-gold')");
assert.equal(run("game.adventure.equipped[1].includes('1-0-gold')"), true);
assert.equal(run("game.adventure.equipped[1].length"), 3);
assert.ok(Math.abs(run("getCompanionMultiplier(1)") - 1.55) < 1e-12);
run("game.stage2Unlocked = true; game.adventure.collection['2-0'] = 1; currentStageView = 1; currentGameMode = 'companions'; companionView = 'inventory'; inventoryScope = 'zone'; renderCompanions()");
assert.ok(nodes.get("companionPanel").innerHTML.includes("Gold Ash Mouse"));
assert.ok(!nodes.get("companionPanel").innerHTML.includes("Moss Snail"));
run("inventoryScope = 'all'; renderCompanions()");
assert.ok(nodes.get("companionPanel").innerHTML.includes("Moss Snail"));
run("inventoryKind = 'gold'; renderCompanions()");
assert.ok(!nodes.get("companionPanel").innerHTML.includes("Moss Snail"));
assert.ok(run("petInfo('1-0-gold').gold"));
assert.equal(run("petInfo('1-0-extra')"), null);

// Confirmation warns about losses and guards against an accidental double submit.
run("game.adventure.collection['1-0'] = 6; openPetMerge('1-0')");
assert.ok(nodes.get("mergeWarning").textContent.includes("even if the merge fails"));
assert.ok(nodes.get("mergeOdds").textContent.includes("100%"));
const attemptsBefore = run("game.adventure.mergesAttempted");
run("confirmPetMerge(); confirmPetMerge()");
assert.equal(run("game.adventure.mergesAttempted"), attemptsBefore + 1);
assert.equal(nodes.get("mergeConfirmButton").hidden, true);
assert.ok(nodes.get("mergeWarning").textContent.includes("equip it"));
run("closePetMerge(); game.buildings.citycenter = 4; doRebirth(); saveGame(false); loadGame()");
assert.ok(run("game.adventure.collection['1-0-gold'] > 0"));
assert.ok(run("game.adventure.equipped[1].includes('1-0-gold')"));
assert.equal(run("petBonus('1-0-gold')"), .10);
for (let stage = 1; stage <= 5; stage++) {
    const atlas = run("PET_ATLASES[" + stage + "]");
    const png = fs.readFileSync(path.join(root, "assets", "pets", atlas + ".png"));
    assert.equal(png.readUInt32BE(16), 1536);
    assert.equal(png.readUInt32BE(20), 1024);
    for (let rarity = 0; rarity < 5; rarity++) {
        assert.ok(run("petArtMarkup('" + stage + "-" + rarity + "')").includes(atlas + ".png"));
        assert.equal(run("petBasePower('" + stage + "-" + rarity + "-gold')"), run("petBasePower('" + stage + "-" + rarity + "') * 1.25"));
    }
}
console.log("Passed: inventory filters/equipment, merge odds, failed-copy losses, six-copy guarantee, double-submit guard, ×1.25 gold power, persistence and all 25 pet artwork mappings.");

// Inventory slots are individual copies, not a Set of pet types.
run("game = JSON.parse(JSON.stringify(defaultGame)); inventoryKind = 'all'; inventoryScope = 'zone'; game.adventure.collection = {'1-0':3}; game.adventure.equipped[1] = []; equipPet(1,'1-0'); equipPet(1,'1-0'); equipPet(1,'1-0')");
assert.equal(run("equippedCopyCount(1,'1-0')"), 3);
assert.ok(Math.abs(run("getCompanionMultiplier(1)") - 1.24) < 1e-12);
run("equipPet(1,'1-0')");
assert.equal(run("game.adventure.equipped[1].length"), 3, "Fourth slot is not allowed");
run("unequipPet(1,'1-0')");
assert.equal(run("equippedCopyCount(1,'1-0')"), 2);
assert.ok(run("petInventoryMarkup(1)").includes("2 equipped · 1 available"));
run("equipPet(1,'1-0'); saveGame(false); loadGame()");
assert.equal(run("equippedCopyCount(1,'1-0')"), 3, "Duplicate-equipped copies survive loading");
run("game.adventure.collection = {'1-0':1}; game.adventure.equipped[1] = []; equipPet(1,'1-0'); equipPet(1,'1-0')");
assert.equal(run("equippedCopyCount(1,'1-0')"), 1, "Cannot equip copies that are not owned");
assert.equal(run("normalizeAdventure({collection:{'1-0':1},equipped:{1:['1-0','1-0','2-0']}}).equipped[1].length"), 1);
run("game.adventure.collection = {'1-0':7}; game.adventure.equipped[1] = ['1-0','1-0','1-0']; mergePets('1-0',6)");
assert.equal(run("game.adventure.collection['1-0']"), 1);
assert.equal(run("equippedCopyCount(1,'1-0')"), 1, "Partial consumption removes only no-longer-owned equipped copies");
run("game.adventure.collection = {'1-0':3}; game.adventure.equipped[1] = ['1-0','1-0','1-0']; Math.random = () => .99; mergePets('1-0',2)");
assert.equal(run("equippedCopyCount(1,'1-0')"), 1, "Failed merges also reconcile slots");

run("game.adventure.collection = {'1-2-gold':2,'1-3':1,'1-0':8,'2-4-gold':3}; equipBestPets(1)");
assert.equal(run("game.adventure.equipped[1].join(',')"), "1-3,1-2-gold,1-2-gold");
run("toggleAutoEquipBest(1); game.salvage = 1000; Math.random = () => .99");
hatch(1);
assert.equal(run("game.adventure.equipped[1][0]"), "1-4", "Auto-equip updates after hatching a stronger pet");
run("game.adventure.collection['1-4'] = 6; mergePets('1-4',6)");
assert.equal(run("game.adventure.equipped[1][0]"), "1-4-gold", "Auto-equip ranks a newly merged gold pet");
run("saveGame(false); loadGame()");
assert.equal(run("game.adventure.autoEquipBest[1]"), true);
assert.equal(run("equippedCopyCount(1,'1-2-gold')"), 1);

function fireTimer(id) {
    const timer = pendingTimers.get(id);
    assert.ok(timer, "Expected a pending auto-hatch timer");
    pendingTimers.delete(id);
    timer.fn();
}
// Instant-animation setting still has a reveal pause and interval; no tight spending loop.
run("game = JSON.parse(JSON.stringify(defaultGame)); game.skipHatchAnimations = true; game.salvage = 500; Math.random = () => 0; currentStageView = 1; currentGameMode = 'companions'; companionView = 'eggs'; document.hidden = false");
assert.equal(run("startAutoHatch(1)"), true);
assert.equal(run("game.adventure.eggsHatched"), 1);
assert.equal(run("game.salvage"), 350);
assert.equal(run("startAutoHatch(1)"), false, "Repeated starts cannot create concurrent hatch loops");
assert.equal(run("hatchEgg(1)"), undefined, "Manual hatch is blocked while auto hatch is active");
assert.equal(nodes.get("hatchAutoStopButton").hidden, false);
for (let i = 0; i < 3; i++) {
    const revealPause = run("autoHatchSession.timer");
    assert.equal(pendingTimers.get(revealPause).delay, 900);
    fireTimer(revealPause);
    assert.equal(run("activeHatch"), null);
    const nextEggTimer = run("autoHatchSession.timer");
    assert.equal(pendingTimers.get(nextEggTimer).delay, 750);
    fireTimer(nextEggTimer);
}
assert.equal(run("autoHatchSession"), null, "Auto hatch stops when another egg is unaffordable");
assert.equal(run("game.adventure.eggsHatched"), 3);
assert.equal(run("game.salvage"), 50);
assert.equal(run("equippedCopyCount(1,'1-0')"), 3);
assert.equal(nodes.get("hatchAutoStopButton").hidden, true);

run("game.salvage = 1000; startAutoHatch(1)");
const stoppedTimer = run("autoHatchSession.timer"), staleAutoCallback = pendingTimers.get(stoppedTimer).fn;
const hatchedBeforeStop = run("game.adventure.eggsHatched");
run("stopAutoHatch()");
assert.ok(!pendingTimers.has(stoppedTimer));
staleAutoCallback();
assert.equal(run("game.adventure.eggsHatched"), hatchedBeforeStop);
assert.equal(run("activeHatch.phase"), "revealed", "Stopping preserves the already-paid reward");
run("closeHatchReveal(); startAutoHatch(1); currentStageView = 2; updateGame()");
assert.equal(run("autoHatchSession"), null, "Switching stage stops auto hatch");
run("closeHatchReveal(); currentStageView = 1; startAutoHatch(1); companionView = 'inventory'; checkAutoHatchContext()");
assert.equal(run("autoHatchSession"), null, "Inventory view stops auto hatch");
run("closeHatchReveal(); companionView = 'eggs'; startAutoHatch(1); document.hidden = true; checkAutoHatchContext()");
assert.equal(run("autoHatchSession"), null, "Background tabs must not spend currency");
run("closeHatchReveal(); document.hidden = false; game.salvage = 1000; startAutoHatch(1); saveGame(false); loadGame()");
assert.equal(run("autoHatchSession"), null, "Auto hatch never resumes spending when a save loads");
run("closeHatchReveal(); game.salvage = 1000; game.skipHatchAnimations = false; startAutoHatch(1)");
assert.equal(run("activeHatch.phase"), "rolling");
assert.equal(run("autoHatchSession.timer"), null, "A second egg waits until the reel reveals");
run("revealHatch(); stopAutoHatch(); closeHatchReveal()");
console.log("Passed: copy-by-copy equipment, owned-copy bounds, merge slot cleanup, Equip Best, saved auto-equip, serial auto-hatch, spending limits and stop/pause safety.");

// Effects preferences persist and never change the already-paid hatch reward.
run("game.effectsEnabled = false; saveGame(false); game.effectsEnabled = true; loadGame()");
assert.equal(run("game.effectsEnabled"), false);
run("game.salvage = 1000; game.skipHatchAnimations = false; currentStageView = 1");
const effectsHatches = run("game.adventure.eggsHatched");
run("hatchEgg(1)");
assert.equal(run("activeHatch.phase"), "revealed", "Effects off skips only the visual hatch");
assert.equal(run("game.salvage"), 850);
assert.equal(run("game.adventure.eggsHatched"), effectsHatches + 1);
run("closeHatchReveal(); game.effectsEnabled = true; syncVfxPreference(); hatchEgg(1)");
assert.equal(run("activeHatch.phase"), "rolling");
run("game.effectsEnabled = false; syncVfxPreference()");
assert.equal(run("activeHatch.phase"), "revealed");
assert.equal(run("activeHatch.timers").every(timer => !pendingTimers.has(timer)), true);
assert.equal(run("game.salvage"), 700);
assert.equal(run("game.adventure.eggsHatched"), effectsHatches + 2);
run("closeHatchReveal(); const legacyEffectsSave = JSON.parse(JSON.stringify(game)); delete legacyEffectsSave.effectsEnabled; loadGame(JSON.stringify(legacyEffectsSave))");
assert.equal(run("game.effectsEnabled"), true, "Older saves receive the new default");
run("clearVfx(); updateGame(); updateGame()");
assert.equal(run("liveVfx.size + vfxAnimations.size"), 0, "Routine UI updates must not replay navigation or particles");
console.log("Passed: saved effects toggle, legacy-save default, instant hatch with effects off, mid-roll cleanup, exactly-once reward and no passive render effects.");
