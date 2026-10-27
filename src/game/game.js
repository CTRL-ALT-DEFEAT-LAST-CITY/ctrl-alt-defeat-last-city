// =============================================
// LAST CITY
// CTRL + ALT + DEFEAT
// IT 485 CAPSTONE
// =============================================

const SAVE_KEY = "lastCitySaveV2";

// =============================================
// DEFAULT GAME
// =============================================

const defaultGame = {
    // Offline progress
    lastSeen: Date.now(),
    offlineEarnings: { salvage: 0, scrap: 0, parts: 0, circuits: 0, cores: 0 },
    offlineTimeAway: 0,
    showOfflineModal: false,
    onboarding: { version: 1, step: 0, done: false, revealed: {} },
    operator: { seen: {} },
    progress: { level: 1, xp: 0, allowance: 6, lastRefill: 0, spent: 0 },

    // Stage 1
    salvage: 0,
    clickPower: 1,
    totalClicks: 0,
    totalSalvage: 0,
    lifetimeSalvage: 0,
    playTimeSeconds: 0,
    sessionStartedAt: Date.now(),
    totalBuildingsBuilt: 0,
    totalSupplyDrops: 0,
    criticalClicks: 0,
    highestCombo: 0,
    highestSalvageRate: 0,
    introSeen: false,
    // Stamped on every save. src/game/migration.js uses it to decide whether a
    // loaded save predates the economy rebalance and needs repairing.
    saveVersion: typeof SAVE_VERSION === "number" ? SAVE_VERSION : 4,
    soundEnabled: true,
    // Added by this update. `expansion` holds every new system's state in one
    // namespace so the original save shape is untouched and an old save still
    // loads; normalizeExpansion() is defined in src/game/migration.js, which
    // index.html loads before this file for exactly this reason.
    expansion: typeof normalizeExpansion === "function" ? normalizeExpansion() : undefined,
    musicEnabled: true,
    musicVolume: 0.55,
    sfxVolume: 0.8,
    ambientEnabled: false,
    effectsEnabled: true,
    storyPopupsEnabled: true,
    dailyReward: normalizeDailyReward(),
    feedback: normalizeFeedback(),
    lastStageView: 1,
    story: normalizeStory(),
    glyphs: normalizeGlyphs(),
    economy: normalizeEconomy(),
    preservation: normalizePreservation(),
    skipHatchAnimations: false,
    buildings: {
        scavenger: 0,
        yard: 0,
        shelter: 0,
        workshop: 0,
        farm: 0,
        power: 0,
        factory: 0,
        citycenter: 0,
        well: 0, clinic: 0, recycler: 0, market: 0, foundry: 0, observatory: 0
    },
    buyAmount: 1,
    combo: 0,
    comboExpires: 0,
    cityTech: {
        sturdyGloves: 0,
        pulseTool: 0,
        critChance: 0,
        critAmplifier: 0,
        momentumCoil: 0,
        campEfficiency: 0,
        salvageMagnet: 0,
        dropScanner: 0,
        workforceTraining: 0,
        housingBlocks: 0,
        salvageAccelerator: 0,
        clickAmplifier: 0,
        communityHub: 0
    },
    dispatchReadyAt: 0,
    contractsClaimed: {},
    achievements: {},
    adventure: normalizeAdventure(),

    // Rebirth
    shards: 0,
    rebirths: 0,
    rebirthUpgrades: {
        efficient: 0,
        fastHands: 0,
        headStart: 0,
        autoClicker: 0,
        cheapBuild: 0,
        legacy: 0
    },

    // Stage 2
    stage2Unlocked: false,
    scrap: 0,
    scrapTokens: 0,
    stage2Resets: 0,
    stage2Upgrades: {
        scrapRate: 0,
        salvageBoost: 0,
        survivorSpeed: 0,
        scrapStorage: 0,
        deepSalvage: 0
    },
    stage2ResetUpgrades: {
        scrapIncome: 0,
        salvageBoost2: 0,
        survivorSpeed2: 0,
        scrapStorage2: 0,
        autoScavenge: 0,
        settlementLegacy: 0
    },

    // Stage 3
    stage3Unlocked: false,
    parts: 0,
    partTokens: 0,
    stage3Resets: 0,
    stage3Upgrades: {
        partRate: 0,
        scrapBoost: 0,
        salvageBoost3: 0,
        assemblySpeed: 0,
        autoAssembly: 0
    },
    stage3ResetUpgrades: {
        partIncome: 0,
        scrapBoost3: 0,
        salvageBoost3b: 0,
        assemblySpeed2: 0,
        autoAssembly2: 0,
        industryLegacy: 0
    },

    // Stage 4
    stage4Unlocked: false,
    circuits: 0,
    networkTokens: 0,
    stage4Resets: 0,
    stage4Upgrades: {
        circuitRate: 0,
        partBoost: 0,
        scrapBoost4: 0,
        salvageBoost4: 0,
        autoNetwork: 0,
        fieldPower: 0
    },
    stage4ResetUpgrades: {
        circuitIncome: 0,
        partBoost4: 0,
        scrapBoost4b: 0,
        salvageBoost4b: 0,
        autoNetwork2: 0,
        networkLegacy: 0
    },

    // Stage 5
    stage5Unlocked: false,
    cores: 0,
    ascensionTokens: 0,
    stage5Resets: 0,
    stage5Upgrades: {
        coreRate: 0,
        totalSalvage: 0,
        totalScrap: 0,
        totalPart: 0,
        totalCircuit: 0,
        ascension: 0,
        reactorFocus: 0,
        autoCore: 0
    },
    stage5ResetUpgrades: {
        coreIncome: 0,
        circuitBoost: 0,
        partBoost5: 0,
        scrapBoost5: 0,
        salvageBoost5: 0,
        autoAscension: 0,
        ascensionLegacy: 0,
        lastCity: 0
    },

    // Milestones
    wallReached: false,
    gameCompleted: false
};

let game = JSON.parse(JSON.stringify(defaultGame));

// =============================================
// BUILDING DEFINITIONS
// =============================================

const BUILDINGS = {
    scavenger: { name: "Scavenger Camp", baseCost: 15, growth: 1.25, output: .5, max: 30, icon: "🏕️", desc: "+0.5 base Salvage/sec · starter income · up to 30" },
    shelter: { name: "Crew Shelter", baseCost: 150, growth: 1.28, output: 0, icon: "🏠", desc: "+3 Population · stronger gathering and workforce" },
    workshop: { name: "Workshop", baseCost: 900, growth: 1.22, output: 10, icon: "🔧", desc: "+10 base Salvage/sec · production engine" },
    power: { name: "Power Plant", baseCost: 4500, growth: 1.65, output: 0, icon: "⚡", desc: "×1.18 building output per plant, up to 25 plants", max: 50 },
    citycenter: { name: "City Center", baseCost: 100000, growth: 1.35, output: 80, icon: "🏙️", desc: "+80 base Salvage/sec, +15 Population · build 4 to renew" }
};

const CONTRACTS = {
    // 250 Salvage was eight times everything a player has earned at 25 gathers
    // and bought seven Scavenger Camps outright - it skipped the whole
    // gather-build-automate opening the tutorial is teaching. The daily reward
    // was corrected for exactly this and this one was missed. 40 is a real
    // boost (two camps) without replacing the lesson.
    firstShift: { name: "First Shift", desc: "Gather Salvage 25 times", reward: "40 Salvage", check: () => game.totalClicks >= 25, claim: () => { game.salvage += 40; } },
    campNetwork: { name: "Camp Network", desc: "Build 5 Scavenger Camps", reward: "1 Salvage Shard", check: () => game.buildings.scavenger >= 5, claim: () => { game.shards += 1; } },
    growingCity: { name: "Growing City", desc: "Earn 2,500 total Salvage", reward: "750 Salvage", check: () => game.totalSalvage >= 2500, claim: () => { game.salvage += 750; } },
    workshopCrew: { name: "Workshop Crew", desc: "Build your first Workshop", reward: "2 Salvage Shards", check: () => game.buildings.workshop >= 1, claim: () => { game.shards += 2; } }
};

const ACHIEVEMENTS = {
    handsOn: { icon: "👆", name: "Hands On", desc: "Gather Salvage 100 times", check: () => game.totalClicks >= 100 },
    settlement: { icon: "🏕️", name: "Settlement", desc: "Own 10 buildings", check: () => totalBuildings() >= 10 },
    skyline: { icon: "🏙️", name: "Skyline", desc: "Build a City Center", check: () => game.buildings.citycenter >= 1 },
    reborn: { icon: "🌅", name: "Reborn", desc: "Rebirth once", check: () => game.rebirths >= 1 },
    industrial: { icon: "🏭", name: "Industrial", desc: "Open the Foundry", check: () => game.stage3Unlocked },
    firstCamp: { icon: "🔥", name: "First Spark", desc: "Build your first Scavenger Camp", check: () => game.buildings.scavenger >= 1 },
    busyHands: { icon: "🖱️", name: "Busy Hands", desc: "Gather Salvage 1,000 times", check: () => game.totalClicks >= 1000 },
    clickLegend: { icon: "👑", name: "Click Legend", desc: "Gather Salvage 10,000 times", check: () => game.totalClicks >= 10000 },
    momentumMaster: { icon: "⚡", name: "In the Zone", desc: "Reach 25 momentum stacks", check: () => game.highestCombo >= 25 },
    luckyStrike: { icon: "🎯", name: "Lucky Strike", desc: "Land your first critical click", check: () => game.criticalClicks >= 1 },
    criticalExpert: { icon: "💥", name: "Critical Expert", desc: "Land 100 critical clicks", check: () => game.criticalClicks >= 100 },
    growingCrew: { icon: "👥", name: "Growing Crew", desc: "Reach 25 Population", check: () => getPopulation() >= 25 },
    bustlingCity: { icon: "🏘️", name: "Bustling City", desc: "Reach 100 Population", check: () => getPopulation() >= 100 },
    builder: { icon: "🔨", name: "City Builder", desc: "Construct 100 buildings across all runs", check: () => game.totalBuildingsBuilt >= 100 },
    supplyRunner: { icon: "📦", name: "Supply Runner", desc: "Secure 10 Supply Drops", check: () => game.totalSupplyDrops >= 10 },
    contractor: { icon: "📜", name: "Trusted Contractor", desc: "Claim every City Contract", check: () => Object.keys(CONTRACTS).every(key => game.contractsClaimed[key]) },
    millionaire: { icon: "💰", name: "Millionaire", desc: "Earn 1 million lifetime Salvage", check: () => game.lifetimeSalvage >= 1e6 },
    billionaire: { icon: "💎", name: "Billionaire", desc: "Earn 1 billion lifetime Salvage", check: () => game.lifetimeSalvage >= 1e9 },
    powerhouse: { icon: "🚀", name: "Powerhouse", desc: "Produce 10,000 Salvage/sec", check: () => getSalvagePerSecond() >= 10000 },
    legacyBuilder: { icon: "🌄", name: "Legacy Builder", desc: "Rebirth 5 times", check: () => game.rebirths >= 5 },
    networkArchitect: { icon: "🌐", name: "Connected", desc: "Open the Relay", check: () => game.stage4Unlocked },
    ascendant: { icon: "🌌", name: "Ascendant", desc: "Open the Citadel", check: () => game.stage5Unlocked },
    // Was "max out a core upgrade" - level 40 after the price curves were
    // steepened is about fourteen hours of late-Ashfall income. Level 30 is a
    // real milestone a player passes during normal progression.
    fieldSpecialist: { icon: "🧪", name: "Upgrade Specialist", desc: "Reach level 30 on a core upgrade", check: () => Object.entries(TECH_UPGRADES).some(([key, def]) => game.cityTech[key] >= Math.min(30, def.max)) },
    dedicatedBuilder: { icon: "⏱️", name: "Dedicated Builder", desc: "Play for 30 minutes", check: () => game.playTimeSeconds >= 1800 },
    citySavior: { icon: "🏆", name: "Humanity's Future", desc: "Rebuild The Last City", check: () => game.gameCompleted }
};

const TECH_UPGRADES = {
    sturdyGloves: { name: "Salvage Tool", baseCost: 40, curve: "sturdyGloves", max: 40, desc: "First +1 gather power/level, then additive %, then ×1.12/level", icon: "🧤", role: "ACTIVE" },
    salvageAccelerator: { name: "Production Drive", baseCost: 120, curve: "salvageAccelerator", max: 40, desc: "First +1 base Salvage/sec/level, then additive % and ×1.12 all Salvage", icon: "🚀", role: "PRODUCTION" },
    salvageMagnet: { name: "Auto Harvester", baseCost: 250, growth: 2.6, max: 5, desc: "1 automatic gather/sec per level · kept on renewal", icon: "🧲", role: "AUTOMATION" },
    dropScanner: { name: "Supply Beacon", baseCost: 400, growth: 2, max: 4, desc: "+25% supply value and 5 seconds faster recharge per level", icon: "📡", role: "SUPPLIES" }
};

// =============================================
// UPGRADE TABLES
// =============================================

const REBIRTH_UPGRADES = {
    // Growth was 1.45, which put all twenty levels at 7,507 Shards while forty
    // renewals yield about 391 - the last level alone cost 2,329 against an
    // income of ~14 a renewal, so the top of the track could never be bought.
    // At 1.25 the whole board costs 686 and fills over a long game instead of
    // showing the player levels they will never reach.
    efficient: { name: "Salvage Legacy", cost: 2, growth: 1.25, max: 20, desc: "+12% permanent Salvage per level" },
    headStart: { name: "Head Start", cost: 4, max: 1, desc: "Renew with 1,000 Salvage and a Camp" },
    cheapBuild: { name: "Smart Construction", cost: 3, growth: 1.7, max: 5, desc: "-10% building costs per level (up to 50%)" }
};

const STAGE2_UPGRADES = {
    scrapRate: { name: "Scrap Drive", cost: 350, curve: "scrapRate", max: 40, desc: "First +1 base Scrap/sec/level, then additive % and ×1.12/level", role: "PRODUCTION" },
    survivorSpeed: { name: "Recovery Tools", cost: 180, curve: "survivorSpeed", max: 30, desc: "First +2 base Scrap/search and faster searches, then % and ×1.14 rewards", role: "ACTIVE" },
    scrapStorage: { name: "Expedition Crew", cost: 180, max: 1, desc: "Searches sites and earns keys automatically · kept on reset", role: "AUTOMATION" },
    salvageBoost: { name: "Salvage Supply Link", cost: 60, growth: 1.5, max: 20, desc: "+12% Salvage per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE2_RESET_UPGRADES = {
    scrapIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "+12% permanent local production per level" },
    salvageBoost2: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "+15% permanent Salvage per level" },
    settlementLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE3_UPGRADES = {
    partRate: { name: "Parts Drive", cost: 500, curve: "partRate", max: 40, desc: "First +1 base Parts/sec/level, then additive % and ×1.12/level", role: "PRODUCTION" },
    assemblySpeed: { name: "Forge Tools", cost: 240, curve: "assemblySpeed", max: 30, desc: "First +3 base Parts profit/order and faster jobs, then % and ×1.14 rewards", role: "ACTIVE" },
    autoAssembly: { name: "Auto Assembly", cost: 250, max: 1, desc: "Funds, builds and delivers orders automatically · kept on reset", role: "AUTOMATION" },
    scrapBoost: { name: "Scrap Supply Link", cost: 90, growth: 1.5, max: 20, desc: "+12% Scrap per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE3_RESET_UPGRADES = {
    partIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "+12% permanent local production per level" },
    scrapBoost3: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "+15% permanent Scrap per level" },
    industryLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE4_UPGRADES = {
    circuitRate: { name: "Circuit Drive", cost: 300, curve: "circuitRate", max: 40, desc: "First +1 base Circuits/sec/level, then additive % and ×1.12/level", role: "PRODUCTION" },
    fieldPower: { name: "Field Amplifier", cost: 260, curve: "fieldPower", max: 30, desc: "First +1 base Circuit/pickup and faster spawns, then % and ×1.14 rewards", role: "ACTIVE" },
    autoNetwork: { name: "Collection Drone", cost: 350, max: 1, desc: "Collects field nodes while you browse any tab · kept on reset", role: "AUTOMATION" },
    partBoost: { name: "Parts Supply Link", cost: 120, growth: 1.5, max: 20, desc: "+12% Parts per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE4_RESET_UPGRADES = {
    circuitIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "+12% permanent local production per level" },
    partBoost4: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "+15% permanent Parts per level" },
    networkLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE5_UPGRADES = {
    coreRate: { name: "Core Drive", cost: 600, curve: "coreRate", max: 40, desc: "First +1 base Cores/sec/level, then additive % and ×1.12/level", role: "PRODUCTION" },
    reactorFocus: { name: "Reactor Focus", cost: 400, curve: "reactorFocus", max: 30, desc: "First +1 base Core/channel, then additive % and ×1.14 manual/auto rewards", role: "ACTIVE" },
    autoCore: { name: "Auto Channel", cost: 500, max: 1, desc: "Channels Cores every 4 seconds · kept on reset", role: "AUTOMATION" },
    totalCircuit: { name: "Circuit Supply Link", cost: 180, growth: 1.5, max: 20, desc: "+12% Circuits per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE5_RESET_UPGRADES = {
    coreIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "+12% permanent local production per level" },
    circuitBoost: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "+15% permanent Circuits per level" },
    lastCity: { name: "The Last City", cost: 40, max: 1, desc: "Defeat the Guardian, then rebuild — ×10 everything" }
};

// =============================================
// DOM REFS
// =============================================

const el = (id) => document.getElementById(id);

const salvageDisplay = el("salvage");
const scrapDisplay = el("scrap");
const partsDisplay = el("parts");
const circuitsDisplay = el("circuits");
const coresDisplay = el("cores");

const salvageRateDisplay = el("salvageRate");
const scrapRateDisplay = el("scrapRate");
const partsRateDisplay = el("partsRate");
const circuitsRateDisplay = el("circuitsRate");
const coresRateDisplay = el("coresRate");

const clickPowerDisplay = el("clickPower");
const clickPowerStat = el("clickPowerStat");
const totalClicksDisplay = el("totalClicks");

const shardsDisplay = el("shards");
const rebirthsDisplay = el("rebirths");
const stage2TokensDisplay = el("stage2Tokens");
const stage2ResetsDisplay = el("stage2Resets");

const energyButton = el("energyButton");
const rebirthButton = el("rebirthButton");
const stageResetButton = el("stageResetButton");
const dispatchButton = el("dispatchButton");
const buyAmountButtons = document.querySelectorAll(".buy-amount");
const soundButton = el("soundButton");
const introModal = el("introModal");
const introStartButton = el("introStartButton");

const saveButton = el("saveButton");
const resetButton = el("resetButton");
const saveStatus = el("saveStatus");
const notification = el("notification");

const stageTabs = document.querySelectorAll(".stage-tab");
const stagePanels = document.querySelectorAll(".stage-panel");
const gameModeTabs = document.querySelectorAll(".game-mode-tab");

let currentStageView = 1;
let currentGameMode = "city";
let audioContext;
const sfxLastTimes=new Map();
const sfxVoices=new Set();

function totalBuildings() {
    return Object.values(game.buildings).reduce((sum, count) => sum + count, 0);
}

// ---------------------------------------------------------------
// Economy safety net.
//
// Every multiplier in the game is now a bounded curve, so this should never
// fire in normal play. It exists because the alternative to a ceiling is a
// save holding 1e36 Salvage, which is unrecoverable for the player. A NaN or
// Infinity creeping in anywhere collapses to 1 rather than poisoning the save.
// ---------------------------------------------------------------
// A safety net for corrupt or impossible values, NOT a balance lever. It sat
// at 1e12 while a legitimately completed zone reached 1e11, so it was one
// order of magnitude from silently capping real play - and before the
// double-counted drive multiplier was fixed it was firing during normal
// completion. Raised so it only ever catches genuinely broken numbers.
const ECONOMY_MULTIPLIER_CEILING = 1e15;
let economyClampWarned = false;
function economySanityClamp(value, label) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    if (value <= ECONOMY_MULTIPLIER_CEILING) return value;
    if (!economyClampWarned) {
        economyClampWarned = true;
        console.warn("[LastCity] " + label + " hit the safety ceiling (" +
            value.toExponential(2) + "). Clamped to " + ECONOMY_MULTIPLIER_CEILING.toExponential(0) + ".");
    }
    return ECONOMY_MULTIPLIER_CEILING;
}

// ---------------------------------------------------------------
// The one channel through which this update's new systems (research, city
// services and companion levels) may touch production. It returns exactly 1
// when nothing has been earned, and 1 if the expansion scripts are absent, so
// an untouched save produces byte-identical output to the previous build.
// ---------------------------------------------------------------
function expansionMultiplier(stage) {
    if (typeof expansionProductionMultiplier !== "function") return 1;
    try {
        const value = expansionProductionMultiplier(stage);
        return Number.isFinite(value) && value > 0 ? value : 1;
    } catch (_) {
        return 1;
    }
}

// =============================================
// COST & PRODUCTION
// =============================================

function getBuildingCost(type) {
    const def = BUILDINGS[type];
    if (!def || (game.buildings[type] || 0) >= (def.max || 1000)) return Infinity;
    return Math.max(1, Math.ceil(def.baseCost * Math.pow(def.growth || 1.18, game.buildings[type] || 0) * buildingDiscount()));
}

// Smart Construction plus whatever the opened zones contribute (the Foundry's
// fabrication lines). Floored at half price so no stack makes building free.
function buildingDiscount() {
    const research = game.rebirthUpgrades.cheapBuild * 0.1;
    const zones = typeof stageSynergyBuildDiscount === "function" ? stageSynergyBuildDiscount() : 0;
    return Math.max(0.5, 1 - research - zones);
}

function getBuildingBatch(type) {
    const def = BUILDINGS[type];
    if (!def) return { count: 0, total: 0, nextCost: Infinity };
    // Allowance caps the batch BEFORE affordability does, so MAX can no
    // longer empty a banked balance into the board in one press.
    const ceiling = typeof allowanceLeft === "function" ? allowanceLeft() : 1000;
    const asked = game.buyAmount === "max" ? 1000 : Math.min(1000, Math.max(0, Number(game.buyAmount || 1)));
    const requested = Math.min(asked, ceiling);
    const owned = game.buildings[type] || 0, discount = buildingDiscount();
    let count = 0, total = 0, nextCost = getBuildingCost(type);
    while (count < requested && owned + count < (def.max || 1000) && Number.isFinite(nextCost) && total + nextCost <= game.salvage) {
        total += nextCost; count++;
        nextCost = Math.max(1, Math.ceil(def.baseCost * Math.pow(def.growth || 1.18, owned + count) * discount));
    }
    return { count, total, nextCost };
}

// (SALVAGE_LINK_STEPS and SALVAGE_LEGACY_STEP lived here. They scaled the
// seven retired cross-zone bonuses and the retired legacy-efficiency upgrade.
// None of those fields can be bought in this build, and the five-group
// pipeline below folds what remains of them into SYNERGY and RENEWAL, so both
// constants became unreachable and were removed.)

// ===============================================================
// THE PRODUCTION PIPELINE
//
// Every zone's income is built the same way, in five groups:
//
//     rate = BASE
//          x PRODUCTION   the zone's own production-drive upgrade
//          x RENEWAL      renewals here + the legacy upgrade
//          x SYNERGY      zones opened + supply links + capstones
//          x COMPANIONS   companions + glyphs
//          x EVENTS       temporary boosts (supply surges, city services)
//
// Five multiplicative groups, and INSIDE each group the parts are ADDED.
// That is the whole point: no single upgrade can multiply the entire economy
// on its own. The previous build multiplied roughly fifteen independent terms
// together, several of them exponential, which is why a deep account reached
// 1e36 Salvage/sec. Adding within a group keeps every bonus worth buying
// while the product of five bounded groups stays somewhere a player can read.
//
// If you add a bonus, put it INSIDE one of these groups. Do not multiply it
// in afterwards.
// ===============================================================

// What opening a zone permanently gives the zones before it. Moderate on
// purpose: all five open is +57% to Ashfall, not a new order of magnitude.
const STAGE_SYNERGY = {
    2: { production: 0.10, scope: "earlier", label: "Depot supply routes" },
    3: { production: 0.12, buildCost: 0.05, scope: "earlier", label: "Foundry fabrication" },
    4: { production: 0.15, automation: 0.50, scope: "earlier", label: "Relay coordination" },
    5: { production: 0.20, scope: "all", label: "Citadel civilisation grid" }
};

// Sum of the synergy a zone receives from every LATER zone the player has
// opened. Citadel's grid reaches every zone including itself.
function stageSynergyBonus(stage) {
    let bonus = 0;
    for (const key of Object.keys(STAGE_SYNERGY)) {
        const zone = Number(key);
        if (!isZoneUnlocked(zone)) continue;
        const def = STAGE_SYNERGY[zone];
        if (def.scope === "all" || zone > stage) bonus += def.production;
    }
    return bonus;
}

// Building-cost efficiency granted by later zones, as a fraction off.
function stageSynergyBuildDiscount() {
    let discount = 0;
    for (const key of Object.keys(STAGE_SYNERGY)) {
        const zone = Number(key);
        if (isZoneUnlocked(zone) && STAGE_SYNERGY[zone].buildCost) discount += STAGE_SYNERGY[zone].buildCost;
    }
    return Math.min(0.5, discount);
}

// How much of your gather power an Auto Harvester reproduces each second.
// Relay's coordination bonus raises it.
const AUTO_GATHER_EFFICIENCY = 0.3;
function autoGatherEfficiency() {
    let bonus = 0;
    for (const key of Object.keys(STAGE_SYNERGY)) {
        const zone = Number(key);
        if (isZoneUnlocked(zone) && STAGE_SYNERGY[zone].automation) bonus += STAGE_SYNERGY[zone].automation;
    }
    return AUTO_GATHER_EFFICIENCY * (1 + bonus);
}

// --- GROUP: RENEWAL ---------------------------------------------
// Renewals done in this zone plus the permanent legacy upgrade, added.
const LEGACY_UPGRADE_STEP = 0.12;
function renewalGroup(stage) {
    const legacyKey = { 1: "efficient", 2: "scrapIncome", 3: "partIncome", 4: "circuitIncome", 5: "coreIncome" }[stage];
    const table = stage === 1 ? game.rebirthUpgrades : game["stage" + stage + "ResetUpgrades"];
    const levels = Math.max(0, Number(table?.[legacyKey]) || 0);
    return stageResetMultiplier(stage) + levels * LEGACY_UPGRADE_STEP;
}

// --- GROUP: SYNERGY ---------------------------------------------
// Everything the rest of the civilisation does for this zone, added:
// zones opened, supply links bought in the next zone, the endgame capstone,
// and whatever an old save legitimately carried.
const CAPSTONE_BONUS = 2;          // The Last City: +200%, was a bare x10
function synergyGroup(stage) {
    let bonus = stageSynergyBonus(stage);
    bonus += Math.max(0, previousStageMultiplier(stage) - 1);
    if (stage === 1) bonus += Math.max(0, game.adventure.progression.beaconModules) * 0.15;
    if (game.stage5ResetUpgrades.lastCity) bonus += CAPSTONE_BONUS;
    // An old save's converted production, carried as a bonus rather than as
    // its own multiplier. Capped by the migration at 4.
    if (stage === 1) bonus += Math.max(0, (Number(game.economy.legacyProduction) || 1) - 1);
    return 1 + bonus;
}

// --- GROUP: COMPANIONS ------------------------------------------
// Companions and glyphs added together rather than multiplied, so collecting
// both is rewarded without the two compounding.
function companionGroup(stage) {
    const companions = Math.max(0, getCompanionMultiplier(stage) - 1);
    const glyphs = Math.max(0, getGlyphMultiplier(stage) - 1);
    return 1 + companions + glyphs;
}

// --- GROUP: EVENTS ----------------------------------------------
// Temporary and situational: supply surges, city services, feedback boosts.
function eventGroup(stage) {
    return feedbackResourceMultiplier() * expansionMultiplier(stage);
}

function getSalvageMultiplier(driveLevel = game.cityTech.salvageAccelerator) {
    const production = upgradeMultiplier('salvageAccelerator', driveLevel);
    const total = production * renewalGroup(1) * synergyGroup(1) * companionGroup(1) * eventGroup(1);
    return economySanityClamp(total, "salvage multiplier");
}

function getPopulation() {
    return game.buildings.shelter * (3 + game.cityTech.housingBlocks) + game.economy.legacyPopulation + game.buildings.citycenter * 15;
}

// Population bonuses saturate instead of growing without limit.
//
// These were linear in Population (0.02 per head), so a large settlement by
// itself multiplied production several times over and kept climbing with every
// shelter. The curve below rewards early growth at a similar rate but
// approaches a ceiling rather than running away.
function populationCurve(scale, span) {
    const population = Math.max(0, getPopulation());
    return scale * (1 - Math.exp(-population / span));
}

function getWorkforceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return populationCurve(1.5, 120) * (1 + game.cityTech.workforceTraining * 0.10) * hubBonus;
}

function getPopulationResourceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return populationCurve(0.55, 120) * (1 + game.cityTech.workforceTraining * 0.05) * hubBonus;
}

// --- GROUP: BASE ------------------------------------------------
// What the city physically produces before any multiplier: the buildings,
// the power that runs them, the survivors who staff them, and the harvesters
// that gather on your behalf.
function getSalvageBase(driveLevel = game.cityTech.salvageAccelerator) {
    const buildings = Object.entries(BUILDINGS)
        .reduce((sum, [key, def]) => sum + (game.buildings[key] || 0) * def.output, 0);
    let base = game.economy.legacyOutput + buildings;
    // Power plants are x1.2 each, bounded at 25. Fifty plants was x9,100 on
    // its own; twenty-five is already a long grind, so the cap is invisible
    // in normal play and stops the tail from exploding.
    base *= Math.pow(1.18, Math.min(25, Math.max(0, game.buildings.power)));
    // City bonuses are ADDED to each other, not multiplied.
    base *= 1 + game.cityTech.campEfficiency * 0.1 + getWorkforceBonus();
    // Auto Harvesters gather for you at a fraction of your own gather power.
    base += game.cityTech.salvageMagnet * getClickPower() * autoGatherEfficiency();
    base += upgradeFlatBonus('salvageAccelerator', driveLevel);
    return base;
}

function getSalvagePerSecond(driveLevel = game.cityTech.salvageAccelerator) {
    return getSalvageBase(driveLevel) * getSalvageMultiplier(driveLevel);
}

// Population deliberately does NOT appear here.
//
// It used to add floor(population / 3) to gather power, while also driving
// the workforce bonus on production - the same survivors counted twice. Worse,
// Auto Harvester converts gather power into passive income, so every Crew
// Shelter fed a shelter -> gather -> passive loop that outran the buildings
// the game is actually about. Population now does one job: production.
function getClickPower(toolLevel = game.cityTech.sturdyGloves) {
    const base = game.clickPower + game.cityTech.pulseTool * 4;
    return upgradeAmount('sturdyGloves', base, toolLevel) * Math.pow(2, game.cityTech.clickAmplifier);
}

function getMomentumBonus() {
    return game.combo * (0.02 + (game.cityTech.momentumCoil * 0.02));
}

function getSupplyDropValue() {
    const boost = feedbackResourceMultiplier();
    // Supply Depots built in the city view raise the payload. Guarded so the
    // original value is returned when the expansion layer is not present.
    let depots = 1;
    if (typeof expansionSupplyDropBonus === "function") {
        try {
            const value = expansionSupplyDropBonus();
            if (Number.isFinite(value) && value > 0) depots = value;
        } catch (_) { depots = 1; }
    }
    return Math.max(40, getSalvagePerSecond() / boost * 25) * (1 + game.cityTech.dropScanner * 0.25) * boost * depots;
}

function getTechCost(def, level) { return economyUpgradeCost(def, level); }

// Zones 2-5 run the same five groups as Ashfall. The only per-zone parts are
// the base (that zone's own drive upgrade and infrastructure) and its local
// capstone. Everything that used to be a separate multiplier here - the
// survivor-speed, boost and legacy chains, the ascension flags - is either a
// retired upgrade this build cannot sell or now lives inside SYNERGY.
function zoneBase(stage, driveLevel) {
    const driveKey = { 2: 'scrapRate', 3: 'partRate', 4: 'circuitRate', 5: 'coreRate' }[stage];
    // FLAT part of the drive upgrade only. upgradeAmount() would also apply
    // upgradeMultiplier(), which zonePerSecond applies again as the PRODUCTION
    // group - the drive was being counted twice, x65.9 squared at max level,
    // which is why a built-out zone ran past the safety clamp at 1e12.
    let base = (1 + infrastructureIncome(stage) + upgradeFlatBonus(driveKey, driveLevel))
        * infrastructureMultiplier(stage) * simulatorStageMultiplier(stage);
    // Survivors raise every zone's output, added to the zone's own bonuses.
    base *= 1 + getPopulationResourceBonus();
    return base;
}

// A zone's own permanent capstone, bought once with that zone's tokens.
const ZONE_CAPSTONE = { 2: 'settlementLegacy', 3: 'industryLegacy', 4: 'networkLegacy', 5: 'ascensionLegacy' };
function zoneCapstoneBonus(stage) {
    const key = ZONE_CAPSTONE[stage];
    return key && game['stage' + stage + 'ResetUpgrades'][key] ? 1 : 0;
}

function zonePerSecond(stage, driveLevel) {
    if (!isZoneUnlocked(stage)) return 0;
    const drive = { 2: 'scrapRate', 3: 'partRate', 4: 'circuitRate', 5: 'coreRate' }[stage];
    const production = upgradeMultiplier(drive, driveLevel);
    let synergy = synergyGroup(stage) + zoneCapstoneBonus(stage);
    if (stage === 5 && game.adventure.bossDefeated) synergy += 1;
    const total = zoneBase(stage, driveLevel) * production * renewalGroup(stage)
        * synergy * companionGroup(stage) * eventGroup(stage);
    return economySanityClamp(total, "zone " + stage + " rate");
}

function getScrapPerSecond(driveLevel = game.stage2Upgrades.scrapRate) { return zonePerSecond(2, driveLevel); }
function getPartsPerSecond(driveLevel = game.stage3Upgrades.partRate) { return zonePerSecond(3, driveLevel); }
function getCircuitsPerSecond(driveLevel = game.stage4Upgrades.circuitRate) { return zonePerSecond(4, driveLevel); }
function getCoresPerSecond(driveLevel = game.stage5Upgrades.coreRate) { return zonePerSecond(5, driveLevel); }

// =============================================
// WALL DETECTION
// =============================================

function isWallReached() {
    return game.buildings.citycenter >= 4;
}

// =============================================
// REBIRTH REQUIREMENTS (per-rebirth gating)
// =============================================

function getRebirthRequirement() {
    const milestone = cityRenewalMilestone(), fee = cityRenewalFee();
    return {
        name: !isWallReached() ? "City Renewal — Build 4 City Centers" : !milestone.ready ? milestone.text : fee && game.salvage < fee ? "Fund the next City Renewal" : "City Renewal",
        check: () => isWallReached() && milestone.ready && game.salvage >= fee,
        display: () => `${isWallReached() ? "✅" : "🔒"} City Centers: ${formatNumber(game.buildings.citycenter)}/4 · No waiting required<br>${milestone.ready ? "✓" : "🔒"} ${milestone.text}${fee ? '<br>Renewal fund: ' + formatNumber(game.salvage) + '/' + formatNumber(fee) + ' Salvage' : ''}`
    };
}

// =============================================
// BUY BUILDING
// =============================================

function buyBuilding(type) {
    if (!BUILDINGS[type] || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const batch = getBuildingBatch(type);
    if (batch.count === 0) {
        // Tell the player WHICH limit stopped them.
        const out = typeof allowanceLeft === "function" && allowanceLeft() < 1;
        showNotification(out
            ? "No build allowance left \u00b7 next in " + allowanceNextIn() + "s"
            : "Not enough Salvage!");
        return;
    }
    if (typeof spendAllowance === "function" && !spendAllowance(batch.count)) {
        showNotification("No build allowance left \u00b7 next in " + allowanceNextIn() + "s");
        return;
    }
    const rateBefore = getSalvagePerSecond();
    game.salvage -= batch.total;
    game.buildings[type] += batch.count;
    game.totalBuildingsBuilt += batch.count;
    // Say what the purchase actually bought. "Constructed!" on its own leaves
    // the player to spot the change in the wallet themselves, and a building
    // whose benefit is indirect (Shelters, Power Plants) looks like it did
    // nothing at all.
    const gained = getSalvagePerSecond() - rateBefore;
    const delta = gained > 0 ? ` · +${formatNumber(gained)} Salvage/sec` : "";
    showNotification(`${BUILDINGS[type].name} ×${batch.count} constructed${delta}`);
    if (typeof grantXp === "function") grantXp("building");
    playSfx("build");
    spawnBurst(el("buy" + type.charAt(0).toUpperCase() + type.slice(1)), "#65baff", 12);
    updateGame();
    terminalPurchase(el("buy" + type.charAt(0).toUpperCase() + type.slice(1)));
    saveGame(false);
}

// =============================================
// WIRE UP BUILDING BUTTONS
// =============================================

function setupBuildingButtons() {
    const panel = document.querySelector(".building-panel");
    for (const [key, def] of Object.entries(BUILDINGS)) {
        if (el(key + "Owned")) continue;
        const card = document.createElement("div");
        card.className = "building-card";
        card.dataset.building = key;
        const suffix = key[0].toUpperCase() + key.slice(1);
        card.innerHTML = `<div class="building-top"><div class="building-icon">${def.icon}</div><div><h3>${def.name}</h3><p>${def.desc}</p></div></div><div class="building-stats"><span>Owned <strong id="${key}Owned">0</strong></span><span>Cost <strong><span id="${key}Cost">${def.baseCost}</span> ⚙️</strong></span></div><button id="buy${suffix}" class="buy-button">Build <span><span id="${key}Cost2">${def.baseCost}</span> ⚙️</span></button>`;
        panel?.appendChild(card);
    }
    // Sort old and new buildings by price so upgrades bridge gaps naturally.
    const cards = panel ? [...panel.querySelectorAll(".building-card")] : [];
    cards.sort((a, b) => {
        const type = card => card.dataset.building || card.querySelector(".buy-button")?.id?.slice(3).toLowerCase();
        return (BUILDINGS[type(a)]?.baseCost || 0) - (BUILDINGS[type(b)]?.baseCost || 0);
    }).forEach(card => panel.appendChild(card));
    Object.keys(BUILDINGS).forEach(type => {
        const btnId = "buy" + type.charAt(0).toUpperCase() + type.slice(1);
        const btn = document.getElementById(btnId);
        if (!btn) {
            console.warn("Missing buy button:", btnId);
            return;
        }
        btn.addEventListener("click", () => buyBuilding(type));
        const card = btn.closest?.('.building-card');
        if (card && !el('buildingPreview-' + type)) {
            const preview = document.createElement('div'); preview.id = 'buildingPreview-' + type; preview.className = 'building-preview';
            card.insertBefore(preview,btn);
        }
    });
}

buyAmountButtons.forEach(button => {
    button.addEventListener("click", () => {
        game.buyAmount = button.dataset.amount === "max" ? "max" : Number(button.dataset.amount);
        buyAmountButtons.forEach(b => b.classList.toggle("active", b === button));
        updateGame();
    });
});

// =============================================
// REBIRTH
// =============================================

function calculateRebirthShards() {
    let highestTier = 0;
    if (game.buildings.citycenter > 0) highestTier = 8;
    else if (game.buildings.factory > 0) highestTier = 7;
    else if (game.buildings.power > 0) highestTier = 6;
    else if (game.buildings.farm > 0) highestTier = 5;
    else if (game.buildings.workshop > 0) highestTier = 4;
    else if (game.buildings.shelter > 0) highestTier = 3;
    else if (game.buildings.yard > 0) highestTier = 2;
    else if (game.buildings.scavenger > 0) highestTier = 1;

    // Base 2 + tier bonus + depth bonus
    let shards = 2 + Math.floor(highestTier / 2);
    shards += Math.floor(game.rebirths / 5);

    return Math.min(shards, 50);
}

function doRebirth() {
    if (!gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const req = getRebirthRequirement();

    if (!req.check()) {
        showNotification("❌ " + req.name + " — requirements not met!");
        return;
    }

    const gained = calculateRebirthShards();
    if (glyphAuto) stopGlyphAuto("Auto-roll stopped by city renewal.");
    celebrateEvent("rebirth", "A new legacy begins", `Rebirth ${formatNumber(game.rebirths + 1)} · +50% permanent Salvage · +${formatNumber(gained)} Shards`);
    game.shards += gained;
    if (typeof grantXp === "function") grantXp("renewal");
    game.rebirths++;

    // Reset Stage 1
    const retainedBuildings = { ...game.buildings }, retainedEconomy = { ...game.economy }, retainedTech = { ...game.cityTech };
    const harvester = game.cityTech.salvageMagnet;
    game.salvage = 0;
    game.buildings = { ...defaultGame.buildings };
    game.economy = normalizeEconomy();
    game.cityTech = { sturdyGloves: 0, pulseTool: 0, critChance: 0, critAmplifier: 0, momentumCoil: 0, campEfficiency: 0, salvageMagnet: 0, dropScanner: 0, workforceTraining: 0, housingBlocks: 0, salvageAccelerator: 0, clickAmplifier: 0, communityHub: 0 };
    game.cityTech.salvageMagnet = harvester;
    if (preservationOwned(1)) game.cityTech = retainedTech;
    if (preservationOwned(1, 'buildings')) { game.buildings = retainedBuildings; game.economy = retainedEconomy; }
    // Later-zone boards aren't part of a City renewal. City corrections follow
    // the blueprint, independently of whether buildings have been archived.
    game.economy.legacyUpgradeMultipliers = { ...retainedEconomy.legacyUpgradeMultipliers };
    game.economy.legacyFlatLevels = { ...retainedEconomy.legacyFlatLevels };
    if (!preservationOwned(1)) {
        game.economy.legacyUpgradeMultipliers.sturdyGloves = 1;
        game.economy.legacyUpgradeMultipliers.salvageAccelerator = 1;
        game.economy.legacyFlatLevels.sturdyGloves = 0;
        game.economy.legacyFlatLevels.salvageAccelerator = 0;
    }
    game.combo = 0;
    game.totalSalvage = 0;

    if (game.rebirthUpgrades.headStart > 0) { game.salvage = 1000; game.buildings.scavenger = Math.max(1, game.buildings.scavenger); }

    showNotification(`Rebirth! +${gained} Salvage Shards.`);

    game.wallReached = false;
    // The city layout belongs to the run, so it is cleared here; research,
    // companions, discoveries and combat records are permanent and are not.
    if (typeof expansionOnRebirth === "function") expansionOnRebirth();
    updateGame();
    saveGame(false);
}

// =============================================
// STAGE RESETS
// =============================================

function doStage2Reset() { return resetSimulatorStage(2); }
function doStage3Reset() { return resetSimulatorStage(3); }
function doStage4Reset() { return resetSimulatorStage(4); }
function doStage5Reset() { return resetSimulatorStage(5); }
function resetSimulatorStage(stage) {
    if (!canStageReset(stage)) return showNotification('Reach Drive Lv ' + stageResetRequiredLevel(stage) + ' and fund ' + formatNumber(stageResetFee(stage)) + ' ' + ZONES[stage].label + ' before resetting.');
    if (glyphAuto) stopGlyphAuto('Auto-roll stopped by stage reset.');
    const reward = stageResetReward(stage), old = game['stage' + stage + 'Upgrades'];
    const keys = {2:['salvageBoost','scrapStorage'],3:['scrapBoost','autoAssembly'],4:['partBoost','autoNetwork'],5:['totalCircuit','autoCore']}[stage];
    const tokens = {2:'scrapTokens',3:'partTokens',4:'networkTokens',5:'ascensionTokens'}[stage];
    game[tokens] += reward; game['stage' + stage + 'Resets']++; game[ZONES[stage].currency] = 0;
    game['stage' + stage + 'Upgrades'] = preservationOwned(stage) ? { ...old } : { ...defaultGame['stage' + stage + 'Upgrades'], ...Object.fromEntries(keys.map(key => [key, old[key]])) };
    if (!preservationOwned(stage)) for (const [key, curve] of Object.entries(UPGRADE_CURVES)) {
        if (curve.stage === stage) { game.economy.legacyUpgradeMultipliers[key] = 1; game.economy.legacyFlatLevels[key] = 0; }
    }
    if (stage === 3) { game.adventure.progression.production = null; game.adventure.assembly = []; }
    if (typeof expansionOnStageReset === "function") expansionOnStageReset(stage);
    celebrateEvent('rebirth', 'Stronger next run', '+35% permanent zone production · +' + reward + ' tokens');
    showNotification(resetKeepSummary(stage) + '. Currency resets' + (preservationOwned(stage) ? '.' : ', production and activity tools reset.'));
    updateGame(); saveGame(false); return true;
}

function canStageReset(stage) {
    if (!gameStarted || window.LastCityCloud?.isSwitching?.()) return false;
    if (!isZoneUnlocked(stage)) return false;
    const levels = { 2: game.stage2Upgrades.scrapRate, 3: game.stage3Upgrades.partRate, 4: game.stage4Upgrades.circuitRate, 5: game.stage5Upgrades.coreRate };
    return levels[stage] >= stageResetRequiredLevel(stage) && game[ZONES[stage].currency] >= stageResetFee(stage);
}

function getStageResetInfo(stage) {
    const resetData = {
        2: { name: "Settlement", count: game.stage2Resets, target: 3, level: game.stage2Upgrades.scrapRate, rate: "Scrap Drive", next: "Stage 3" },
        3: { name: "Industry", count: game.stage3Resets, target: 4, level: game.stage3Upgrades.partRate, rate: "Parts Drive", next: "Stage 4" },
        4: { name: "Network", count: game.stage4Resets, target: 5, level: game.stage4Upgrades.circuitRate, rate: "Circuit Drive", next: "Stage 5" },
        5: { name: "Ascension", count: game.stage5Resets, target: 5, level: game.stage5Upgrades.coreRate, rate: "Core Drive", next: "permanent power" }
    };
    return resetData[stage];
}

// =============================================
// UPGRADE PURCHASES
// =============================================

function buyRebirthUpgrade(key) {
    const def = REBIRTH_UPGRADES[key];
    if (!def || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const cost = economyUpgradeCost(def, game.rebirthUpgrades[key]);
    if (game.rebirthUpgrades[key] >= def.max) return;
    if (game.shards < cost) {
        showNotification("Not enough Shards!");
        return;
    }
    game.shards -= cost;
    game.rebirthUpgrades[key]++;
    showNotification(`${def.name} upgraded!`);
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}

function buyTechUpgrade(key) {
    const def = TECH_UPGRADES[key];
    if (!def || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const level = game.cityTech[key];
    const cost = getTechCost(def, level);
    if (level >= def.max) return;
    if (game.salvage < cost) {
        showNotification("Not enough Salvage!");
        return;
    }
    if (typeof spendAllowance === "function" && !spendAllowance(1)) {
        showNotification("No build allowance left \u00b7 next in " + allowanceNextIn() + "s");
        return;
    }
    game.salvage -= cost;
    game.cityTech[key]++;
    if (typeof grantXp === "function") grantXp("upgrade");
    celebrateUpgrade();
    showNotification(`${def.name} improved!`);
    updateGame();
    saveGame(false);
}

function buyUpgrade(stage, key) {
    const tables = {
        2: { up: STAGE2_UPGRADES, cur: game.scrap, currency: "Scrap", state: game.stage2Upgrades },
        3: { up: STAGE3_UPGRADES, cur: game.parts, currency: "Parts", state: game.stage3Upgrades },
        4: { up: STAGE4_UPGRADES, cur: game.circuits, currency: "Circuits", state: game.stage4Upgrades },
        5: { up: STAGE5_UPGRADES, cur: game.cores, currency: "Cores", state: game.stage5Upgrades }
    };
    const t = tables[stage];
    if (!t || !t.up[key] || !isZoneUnlocked(stage) || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const def = t.up[key], cost = economyUpgradeCost(def, t.state[key]);
    if (t.state[key] >= def.max) return;
    if (t.cur < cost) {
        showNotification(`Not enough ${t.currency}!`);
        return;
    }
    if (typeof spendAllowance === "function" && !spendAllowance(1)) {
        showNotification("No build allowance left \u00b7 next in " + allowanceNextIn() + "s");
        return;
    }
    if (typeof grantXp === "function") grantXp("upgrade");
    if (stage === 2) game.scrap -= cost;
    if (stage === 3) game.parts -= cost;
    if (stage === 4) game.circuits -= cost;
    if (stage === 5) game.cores -= cost;
    t.state[key]++;
    showNotification(`${def.name} upgraded!`);
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}

function buyResetUpgrade(stage, key) {
    if (!isZoneUnlocked(stage)) return;
    if (stage === 5 && key === "lastCity" && !game.adventure.bossDefeated) {
        return showNotification("Defeat the Citadel Guardian before rebuilding The Last City.");
    }
    const tables = {
        2: { up: STAGE2_RESET_UPGRADES, cur: game.scrapTokens, state: game.stage2ResetUpgrades, name: "Settlement Tokens" },
        3: { up: STAGE3_RESET_UPGRADES, cur: game.partTokens, state: game.stage3ResetUpgrades, name: "Industry Tokens" },
        4: { up: STAGE4_RESET_UPGRADES, cur: game.networkTokens, state: game.stage4ResetUpgrades, name: "Network Tokens" },
        5: { up: STAGE5_RESET_UPGRADES, cur: game.ascensionTokens, state: game.stage5ResetUpgrades, name: "Ascension Tokens" }
    };
    const t = tables[stage];
    if (!t || !t.up[key] || !isZoneUnlocked(stage) || !gameStarted || window.LastCityCloud?.isSwitching?.()) return;
    const def = t.up[key], cost = economyUpgradeCost(def, t.state[key]);
    if (t.state[key] >= def.max) return;
    if (t.cur < cost) {
        showNotification(`Not enough ${t.name}!`);
        return;
    }
    if (stage === 2) game.scrapTokens -= cost;
    if (stage === 3) game.partTokens -= cost;
    if (stage === 4) game.networkTokens -= cost;
    if (stage === 5) game.ascensionTokens -= cost;
    t.state[key]++;

    if (stage === 5 && key === "lastCity") {
        game.gameCompleted = true;
        showNotification("🏆 THE LAST CITY IS REBUILT! YOU WIN!");
    } else {
        showNotification(`${def.name} upgraded!`);
    }
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}

// =============================================
// CLICK HANDLERS
// =============================================

// ---------------------------------------------------------------
// Manual gathering rate limit
//
// A tester focused the gather button and had a script send Space about 100
// times, which the game happily paid out in full. Manual gathering is now
// capped with a one-second sliding window: roughly a fast human's ceiling,
// high enough that nobody clicking by hand will ever reach it. Input over the
// cap is ignored, never punished - no bans, no lost progress, and passive
// production is untouched because this guard only sits in the click handler.
//
// This is a client-side check and can be defeated by anyone willing to edit
// the page. It is here to keep honest scores honest; a real leaderboard would
// have to validate rates on a server rather than trust this file.
// ---------------------------------------------------------------
const GATHER_LIMIT_PER_SECOND = { pointer: 12, touch: 20 };
const GATHER_WINDOW_MS = 1000;
let gatherAccepted = [];
let gatherPointerType = "";
let gatherBlocked = 0;
let gatherNoticeAt = 0;

function gatherInputIsTouch() {
    // Judge the input that actually triggered this gather, never the device.
    // Touch and pen get the mobile allowance; a mouse, a keyboard, a synthetic
    // click and anything unrecognised get the stricter desktop one.
    //
    // The old version fell back to navigator.maxTouchPoints when the pointer
    // type was unknown, which is exactly backwards for a limiter: the inputs
    // with no pointer type are keyboard and script-driven clicks, so on any
    // touch-capable machine - every phone, every touchscreen laptop - an
    // autoclicker was handed 20 a second instead of 12. Unknown input is the
    // input to be strict with.
    return gatherPointerType === "touch" || gatherPointerType === "pen";
}

function gatherRateLimit() {
    return gatherInputIsTouch() ? GATHER_LIMIT_PER_SECOND.touch : GATHER_LIMIT_PER_SECOND.pointer;
}
function acceptManualGather(now = Date.now()) {
    const cutoff = now - GATHER_WINDOW_MS;
    while (gatherAccepted.length && gatherAccepted[0] <= cutoff) gatherAccepted.shift();
    const limit = gatherRateLimit();
    if (gatherAccepted.length >= limit) {
        gatherBlocked++;
        // Told once, quietly, so a genuinely fast player understands the cap
        // instead of thinking the button broke.
        if (now - gatherNoticeAt > 8000) {
            gatherNoticeAt = now;
            if (typeof showNotification === "function") {
                showNotification("Gathering is capped at " + limit + " per second.");
            }
        }
        return false;
    }
    gatherAccepted.push(now);
    return true;
}
function resetGatherRateLimit() { gatherAccepted = []; gatherBlocked = 0; gatherNoticeAt = 0; gatherPointerType = ""; }

for (const id of ["energyButton", "mobileGather"]) {
    const button = el(id);
    if (!button) continue;
    button.addEventListener("pointerdown", event => { gatherPointerType = event.pointerType || ""; });
    // A held Space or Enter repeats keydown for as long as the key is down.
    // The repeat presses are refused here so holding the key cannot stand in
    // for pressing it.
    button.addEventListener("keydown", event => {
        if (event.repeat && (event.key === " " || event.key === "Spacebar" || event.key === "Enter")) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

energyButton.addEventListener("click", function () {
    if (!acceptManualGather()) return;
    // Momentum order. The reward is calculated from the momentum the player
    // had BEFORE this press, and this press then builds momentum for the next
    // one. Incrementing first meant the very first click of a fresh game was
    // already earning a momentum bonus it had not earned yet, so the number
    // awarded never quite matched the +1 the interface promised.
    const isCritical = Math.random() < game.cityTech.critChance * 0.08;
    let click = getClickPower() * (1 + getMomentumBonus());
    game.combo = Math.min(25, game.combo + 1);
    game.comboExpires = Date.now() + 2500;
    if (isCritical) click *= 2 + (game.cityTech.critAmplifier * 0.5);
    click *= getSalvageMultiplier();
    game.salvage += click;
    game.totalSalvage += click;
    game.lifetimeSalvage += click;
    game.totalClicks++;
    if (typeof grantXp === "function") grantXp("gather");
    if (isCritical) game.criticalClicks++;
    game.highestCombo = Math.max(game.highestCombo, game.combo);
    const feedbackAnchor=gatherFeedbackAnchor || energyButton;
    showFloatingGain(feedbackAnchor, `${isCritical ? "CRITICAL! " : ""}+${formatNumber(click)} ⚙️`);
    spawnBurst(feedbackAnchor, isCritical ? "#aa8cff" : "#ffc247", isCritical ? 20 : 10);
    playSfx(isCritical ? "critical" : "click");
    pulseResource(1, isCritical);
    terminalGather(isCritical,feedbackAnchor);
    animateVfx(feedbackAnchor, [{ transform: "scale(.97)" }, { transform: "scale(1)" }], { duration: 140 });
    updateGame();
});

dispatchButton.addEventListener("click", () => {
    const now = Date.now();
    if (now < game.dispatchReadyAt) return;
    const reward = getSupplyDropValue();
    game.salvage += reward;
    game.totalSalvage += reward;
    game.lifetimeSalvage += reward;
    game.totalSupplyDrops++;
    game.dispatchReadyAt = now + 60000 - game.cityTech.dropScanner * 5000;
    showFloatingGain(dispatchButton, `+${formatNumber(reward)} ⚙️`);
    spawnBurst(dispatchButton, "#65baff", 18);
    pulseResource(1, true);
    playSfx("dispatch");
    showNotification("Supply drop secured!");
    updateGame();
    saveGame(false);
});

function claimContract(key) {
    const contract = CONTRACTS[key];
    if (!contract || game.contractsClaimed[key] || !contract.check()) return;
    const salvageBefore = game.salvage;
    contract.claim();
    game.lifetimeSalvage += Math.max(0, game.salvage - salvageBefore);
    game.contractsClaimed[key] = true;
    if (typeof grantXp === "function") grantXp("contract");
    celebrateUpgrade();
    showNotification(`Contract complete: ${contract.reward}!`);
    updateGame();
    saveGame(false);
}

rebirthButton.addEventListener("click", () => openRenewalPreview(1));
stageResetButton.addEventListener("click", function () {
    openRenewalPreview(currentStageView);
});

// =============================================
// TAB SWITCHING
// =============================================

stageTabs.forEach(tab => {
    tab.addEventListener("click", function () {
        const stage = parseInt(tab.dataset.stage);
        if (!isZoneUnlocked(stage)) {
            pulseVfx(tab, "rgba(255,160,130,.55)");
            return showNotification('ERROR: Zone locked. '+ZONES[stage - 1].quest);
        }
        if (stage === currentStageView) return;

        const previousStage=currentStageView;
        currentStageView = stage;
        game.lastStageView = stage;
        stageTabs.forEach(t => t.setAttribute("aria-pressed", String(Number(t.dataset.stage) === stage)));
        stageTabs.forEach(t => t.classList.remove("active"));
        stagePanels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        el(`stage${stage}Panel`).classList.add("active");
        updateGame();
        animateNavigation(tab);
        terminalZoneTravel(previousStage,stage);
        scrollPlayerSection();
    });
});

gameModeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        switchGameMode(tab.dataset.mode);
    });
});

// =============================================
// OFFLINE PROGRESS
// =============================================

const MAX_OFFLINE_HOURS = 8;

function applyOfflineProgress() {
    const now = Date.now();
    const lastSeen = game.lastSeen || now;
    const elapsedSeconds = Math.floor((now - lastSeen) / 1000);
    const cappedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_HOURS * 3600);

    if (cappedSeconds < 60) {
        game.lastSeen = now;
        game.showOfflineModal = false;
        return;
    }

    const rate = 0.5;
    const s = getSalvagePerSecond() * cappedSeconds * rate;
    const sc = getScrapPerSecond() * cappedSeconds * rate;
    const p = getPartsPerSecond() * cappedSeconds * rate;
    const ci = getCircuitsPerSecond() * cappedSeconds * rate;
    const co = getCoresPerSecond() * cappedSeconds * rate;

    game.salvage += s;
    game.scrap += sc;
    game.parts += p;
    game.circuits += ci;
    game.cores += co;
    // Offline Salvage counts toward the run total as well as the lifetime
    // total. Without this, "Earn 2,500 total Salvage" ignored everything the
    // city produced while the tab was closed, which reads as a lost reward.
    game.totalSalvage += s;
    game.lifetimeSalvage += s;
    game.highestSalvageRate = Math.max(game.highestSalvageRate, getSalvagePerSecond());

    game.offlineEarnings = { salvage: s, scrap: sc, parts: p, circuits: ci, cores: co };
    game.offlineTimeAway = cappedSeconds;
    game.showOfflineModal = true;
    game.lastSeen = now;
}

function formatTimeAway(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

function showOfflineModal() {
    if(el('terminalBootModal')?.open)return;
    if (!gameStarted) return;
    // A repaired save is explained before anything else, including the
    // welcome-back panel, so the player is never shown changed numbers first.
    if (pendingSaveReport) { showSaveRecoveryNotice(); return; }
    if (!game.showOfflineModal) return;
    const e = game.offlineEarnings;
    const timeAway = formatTimeAway(game.offlineTimeAway);
    const modal = document.createElement("div");
    modal.className = "offline-modal";
    modal.innerHTML = `
        <div class="offline-modal-content">
            <h2>⏰ Welcome Back!</h2>
            <p>You were away for <strong>${timeAway}</strong></p>
            <p class="offline-subtitle">Your city kept working (50% efficiency)</p>
            <div class="offline-earnings">
                ${e.salvage > 0 ? `<div class="offline-item">⚙️ +${formatNumber(Math.floor(e.salvage))} Salvage</div>` : ""}
                ${e.scrap > 0 ? `<div class="offline-item">🔩 +${formatNumber(Math.floor(e.scrap))} Scrap</div>` : ""}
                ${e.parts > 0 ? `<div class="offline-item">⚙️ +${formatNumber(Math.floor(e.parts))} Parts</div>` : ""}
                ${e.circuits > 0 ? `<div class="offline-item">🔌 +${formatNumber(Math.floor(e.circuits))} Circuits</div>` : ""}
                ${e.cores > 0 ? `<div class="offline-item">🔮 +${formatNumber(Math.floor(e.cores))} Cores</div>` : ""}
            </div>
            <button onclick="closeOfflineModal()" class="offline-close-btn">Collect & Continue</button>
        </div>
    `;
    document.body.appendChild(modal);
    if(typeof terminalPowerCycle==='function')terminalPowerCycle(modal.querySelector('.offline-modal-content'));
    game.showOfflineModal = false;
}

function closeOfflineModal() {
    const modal = document.querySelector(".offline-modal");
    if (modal) modal.remove();
    saveGame(false);
    scheduleLorePopup();
}

window.closeOfflineModal = closeOfflineModal;

// =============================================
// GAME LOOP
// =============================================

function gameLoop() {
    if (!gameStarted) return;
    if (el('terminalBootModal')?.open) return;
    if (window.LastCityCloud?.isSwitching()) return;
    game.playTimeSeconds++;
    if (game.combo > 0 && Date.now() > game.comboExpires) {
        game.combo = Math.max(0, game.combo - 5);
        game.comboExpires = game.combo > 0 ? Date.now() + 400 : 0;
    }
    const salvagePerSecond = getSalvagePerSecond();
    game.salvage += salvagePerSecond;
    game.scrap += getScrapPerSecond();
    game.parts += getPartsPerSecond();
    game.circuits += getCircuitsPerSecond();
    game.cores += getCoresPerSecond();
    game.totalSalvage += salvagePerSecond;
    game.lifetimeSalvage += salvagePerSecond;
    game.highestSalvageRate = Math.max(game.highestSalvageRate, salvagePerSecond);

    runSimulatorAutomation();

    if (isWallReached() && !game.wallReached) {
        game.wallReached = true;
        showNotification(getRebirthRequirement().check() ? "🌅 CITY RENEWAL READY — Rebirth available!" : "City built! Complete the displayed renewal milestone and funding requirement.");
    }

    tickFeedback();
    updateGame();
}

setInterval(() => { if (typeof refillAllowance === "function") refillAllowance(); }, 1000);
setInterval(gameLoop, 1000);
setInterval(() => {
    if (gameStarted) saveGame(false);
    else if (introModal?.open) renderStartupPage();
}, 5000);

// =============================================
// UPDATE UI
// =============================================

function updateGame() {
    syncVfxPreference();
    checkAutoHatchContext();
    checkGlyphAutoContext();
    checkAchievements();
    checkStoryUnlocks();
    if (soundButton) {
        soundButton.textContent = game.soundEnabled ? "🔊 Sound" : "🔇 Sound";
        soundButton.setAttribute("aria-pressed", String(game.soundEnabled));
    }
    buyAmountButtons.forEach(button => {
        const amount = button.dataset.amount === "max" ? "max" : Number(button.dataset.amount);
        button.classList.toggle("active", amount === game.buyAmount);
    });
    // Flooring every balance made the counter look frozen at 0 for the first
    // few seconds of a new game, and made it skip whenever income was
    // fractional. formatBalance keeps one decimal below 10 and whole numbers
    // above it, so the number always visibly moves.
    salvageDisplay.textContent  = formatBalance(game.salvage);
    scrapDisplay.textContent    = formatBalance(game.scrap);
    partsDisplay.textContent    = formatBalance(game.parts);
    circuitsDisplay.textContent = formatBalance(game.circuits);
    coresDisplay.textContent    = formatBalance(game.cores);

    salvageRateDisplay.textContent  = formatNumber(getSalvagePerSecond());
    scrapRateDisplay.textContent    = formatNumber(getScrapPerSecond());
    partsRateDisplay.textContent    = formatNumber(getPartsPerSecond());
    circuitsRateDisplay.textContent = formatNumber(getCircuitsPerSecond());
    coresRateDisplay.textContent    = formatNumber(getCoresPerSecond());

    const cp = getClickPower();
    if (clickPowerDisplay) clickPowerDisplay.textContent = formatNumber(cp);
    if (clickPowerStat)    clickPowerStat.textContent = formatNumber(cp);
    if (totalClicksDisplay) totalClicksDisplay.textContent = formatNumber(game.totalClicks);

    const totalClicks2 = el("totalClicks2");
    if (totalClicks2) totalClicks2.textContent = formatNumber(game.totalClicks);

    const totalSalvageEl = el("totalSalvage");
    if (totalSalvageEl) totalSalvageEl.textContent = formatNumber(Math.floor(game.totalSalvage));

    const salvageRateTop = el("salvageRateTop");
    if (salvageRateTop) salvageRateTop.textContent = formatNumber(getSalvagePerSecond());

    const populationDisplay = el("population");
    const workforceBonus = el("workforceBonus");
    if (populationDisplay) populationDisplay.textContent = formatNumber(getPopulation());
    if (workforceBonus) workforceBonus.textContent = `+${Math.round(getWorkforceBonus() * 100)}%`;

    const comboCount = el("comboCount");
    const comboBar = el("comboBar");
    const comboBonus = el("comboBonus");
    if (comboCount) comboCount.textContent = `${game.combo}x`;
    if (comboBar) comboBar.style.width = `${(game.combo / 25) * 100}%`;
    if (comboBonus) comboBonus.textContent = game.combo > 0
        ? `+${Math.round(getMomentumBonus() * 100)}% click power · keep it going!`
        : "Keep clicking for a momentum bonus";

    if (shardsDisplay) shardsDisplay.textContent = formatNumber(game.shards);
    if (rebirthsDisplay) rebirthsDisplay.textContent = formatNumber(game.rebirths);
    if (stage2TokensDisplay) stage2TokensDisplay.textContent = formatNumber(game.scrapTokens);
    if (stage2ResetsDisplay) stage2ResetsDisplay.textContent = formatNumber(game.stage2Resets);

    // Buildings
    Object.keys(BUILDINGS).forEach(type => {
        const cost = getBuildingCost(type);
        const owned = game.buildings[type];
        const maxed = owned >= (BUILDINGS[type].max || 1000);
        const batch = getBuildingBatch(type);

        const ownedEl = el(type + "Owned");
        if (ownedEl) ownedEl.textContent = formatNumber(owned);

        const costEl1 = el(type + "Cost");
        const costEl2 = el(type + "Cost2");
        if (costEl1) costEl1.textContent = maxed ? "MAX" : game.buyAmount === 1 ? formatNumber(cost) : (batch.count ? formatNumber(batch.total) : formatNumber(cost));
        if (costEl2) costEl2.textContent = maxed ? "MAX" : game.buyAmount === 1 ? formatNumber(cost) : (batch.count ? formatNumber(batch.total) : formatNumber(cost));

        const btnId = "buy" + type.charAt(0).toUpperCase() + type.slice(1);
        const btn = el(btnId);
        if (btn) {
            btn.disabled = batch.count === 0;
            btn.firstChild.textContent = maxed ? "MAXED " : game.buyAmount === "max" ? "Build MAX " : `Build ×${game.buyAmount} `;
        }
    });

    // Rebirth button + requirement display
    if (rebirthButton) {
        const req = getRebirthRequirement();
        const canRebirth = req.check();

        rebirthButton.disabled = !canRebirth;
        rebirthButton.textContent = canRebirth
            ? `🌅 REBIRTH (+${calculateRebirthShards()} Shards)`
            : `🔒 ${req.name}`;
    }

    const reqDisplay = el("rebirthRequirement");
    if (reqDisplay) {
        const req = getRebirthRequirement();
        reqDisplay.innerHTML = `
            <span class="req-title">Next Rebirth Requirement</span>
            ${req.display()}
            <small>Renewal production: ×${formatNumber(stageResetMultiplier(1))} → ×${formatNumber(nextStageResetMultiplier(1))}. ${resetKeepSummary(1)}. Currency resets${preservationOwned(1) ? '' : ', City upgrades reset'}${preservationOwned(1, 'buildings') ? '' : ', City buildings reset'}.</small>
        `;
    }

    // Stage reset button
    if (stageResetButton) {
        const showReset = currentGameMode === "upgrades" && currentStageView >= 2;
        const info = currentStageView >= 2 ? getStageResetInfo(currentStageView) : null;
        stageResetButton.parentElement.style.display = showReset ? "block" : "none";
        if (info) {
            stageResetButton.disabled = !canStageReset(currentStageView);
            stageResetButton.textContent = `🔄 ${info.name} Reset (+${stageResetReward(currentStageView)} Tokens)`;
            el("stageResetHint").textContent = canStageReset(currentStageView)
                ? `Permanent production ×${formatNumber(stageResetMultiplier(currentStageView))} → ×${formatNumber(nextStageResetMultiplier(currentStageView))}. ${resetKeepSummary(currentStageView)}. Currency resets${preservationOwned(currentStageView) ? '' : ', production and activity tools reset'}.`
                : `Raise ${info.rate} to Lv ${stageResetRequiredLevel(currentStageView)} (${info.level}/${stageResetRequiredLevel(currentStageView)}) and fund ${formatNumber(stageResetFee(currentStageView))} ${ZONES[currentStageView].label}. No timer requirement.`;
        }
    }

    // Upgrade shops
    if (currentGameMode === "upgrades") {
        renderRebirthUpgrades();
        renderTechUpgrades();
        if (currentStageView === 2) renderStageUpgrades(2, STAGE2_UPGRADES, game.stage2Upgrades, "scrap");
        if (currentStageView === 3) renderStageUpgrades(3, STAGE3_UPGRADES, game.stage3Upgrades, "parts");
        if (currentStageView === 4) renderStageUpgrades(4, STAGE4_UPGRADES, game.stage4Upgrades, "circuits");
        if (currentStageView === 5) renderStageUpgrades(5, STAGE5_UPGRADES, game.stage5Upgrades, "cores");
        renderResetUpgrades();
        renderPreservation();
    }
    updateMilestone();
    updateUpgradeReadyCount();
    renderPurchaseOutlook();
    renderDispatch();
    renderContracts();
    renderAchievements();
    renderStats();
    renderTutorialHint();
    renderCityVisual();
    renderAdventure();
    renderWorldUI();
    renderGlyphs();
    renderPlayerUI();
    refreshTerminalUI();
    if (typeof renderExpansion === "function") renderExpansion();

    // Tab locks
    stageTabs.forEach(tab => {
        const s = parseInt(tab.dataset.stage);
        tab.classList.toggle("locked",
            (s === 2 && !game.stage2Unlocked) ||
            (s === 3 && !game.stage3Unlocked) ||
            (s === 4 && !game.stage4Unlocked) ||
            (s === 5 && !game.stage5Unlocked)
        );
    });

    if (saveStatus) {
        saveStatus.textContent = `Rebirths: ${game.rebirths} | Stage 2 Resets: ${game.stage2Resets}`;
    }
}

function renderTutorialHint() {
    const hint = el("tutorialHint");
    if (!hint) return;
    if (currentGameMode === "stats") hint.textContent = "Your lifetime record survives every Rebirth.";
    else if (currentGameMode === "stories") hint.textContent = "Recover stories through zone milestones. Your archive survives city renewals.";
    else if (currentGameMode === "glyphs") hint.textContent = "Every glyph copy contributes until its cap. Buffs multiply across collections and remain permanent. Luck improves draw odds.";
    else if (currentGameMode === "upgrades") hint.textContent = "Ready cards show what improves next. Auto Harvesters survive renewal; production tools reset. Shard upgrades are permanent.";
    else if (currentGameMode === "companions") hint.textContent = "Buy eggs with this zone's currency. Equip up to 3 companions; pets survive resets.";
    else if (game.totalClicks < 5) hint.textContent = "Tap Gather Salvage to begin rebuilding.";
    else if (game.buildings.scavenger < 1) hint.textContent = "Your first Scavenger Camp creates passive Salvage every second.";
    else if (game.buildings.shelter < 1) hint.textContent = "Build Shelters to grow Population and strengthen your workforce.";
    else hint.textContent = "Keep momentum up for stronger clicks. Check contracts for quick rewards.";
}

function renderCityVisual() {
    const visual = el("cityVisual");
    const description = el("cityDescription");
    if (!visual || !description) return;
    if (game.stage5Unlocked) { visual.textContent = "🌌🏙️"; description.textContent = "The last city reaches beyond the ruins."; }
    else if (game.stage4Unlocked) { visual.textContent = "🌐🏙️"; description.textContent = "Networks carry power through a city reborn."; }
    else if (game.stage3Unlocked) { visual.textContent = "🏭🏙️"; description.textContent = "Factories hum. The city is learning to build itself."; }
    else if (game.buildings.citycenter > 0) { visual.textContent = "🏙️"; description.textContent = "A real skyline rises from the dust."; }
    else if (totalBuildings() >= 10) { visual.textContent = "🏘️"; description.textContent = "A settlement is taking shape around the camps."; }
    else { visual.textContent = "🏕️"; description.textContent = "Gather Salvage. Grow your city. Build 4 City Centers to begin a new legacy."; }
    visual.classList.toggle("city-thriving", totalBuildings() >= 10);
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function renderStats() {
    const statsPanel = el("statsPanel");
    if (!statsPanel) return;
    const badgeCount = Object.keys(ACHIEVEMENTS).filter(key => game.achievements[key]).length;
    const contracts = Object.keys(game.contractsClaimed).length;
    const stages = 1 + Number(game.stage2Unlocked) + Number(game.stage3Unlocked) + Number(game.stage4Unlocked) + Number(game.stage5Unlocked);
    const rank = game.gameCompleted ? "Last City" : game.stage5Unlocked ? "Ascendant" : game.stage4Unlocked ? "Network Architect" : game.stage3Unlocked ? "Industrialist" : game.stage2Unlocked ? "Settlement Leader" : game.rebirths > 0 ? "Pathfinder" : "Rookie";
    const sessionSeconds = Math.max(0, Math.floor((Date.now() - game.sessionStartedAt) / 1000));
    const values = {
        statPlayTime: formatDuration(game.playTimeSeconds), statSessionTime: formatDuration(sessionSeconds), statTotalClicks: formatNumber(game.totalClicks), statCriticalClicks: formatNumber(game.criticalClicks),
        statLifetimeSalvage: formatNumber(Math.floor(game.lifetimeSalvage)), statBestRate: `${formatNumber(game.highestSalvageRate)}/sec`, statBuildingsBuilt: formatNumber(game.totalBuildingsBuilt), statHighestCombo: `${game.highestCombo}x`,
        statSupplyDrops: formatNumber(game.totalSupplyDrops), statContracts: `${contracts}/${Object.keys(CONTRACTS).length}`, statBadges: `${badgeCount} / ${Object.keys(ACHIEVEMENTS).length}`, statPopulation: formatNumber(getPopulation()),
        statRebirths: formatNumber(game.rebirths), statStage2Resets: formatNumber(game.stage2Resets), statStagesUnlocked: `${stages} / 5`, statShards: formatNumber(game.shards), cityRank: rank
    };
    Object.entries(values).forEach(([id, value]) => { const node = el(id); if (node) node.textContent = value; });
}

function renderDispatch() {
    if (!dispatchButton) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((game.dispatchReadyAt - now) / 1000));
    const ready = remaining === 0;
    dispatchButton.disabled = !ready;
    el("dispatchStatus").textContent = ready ? "READY" : "RECHARGING";
    el("dispatchStatus").classList.toggle("recharging", !ready);
    dispatchButton.textContent = ready ? "CALL SUPPLY DROP" : `SUPPLY DROP IN ${remaining}s`;
    el("dispatchTimer").textContent = ready
        ? `Current payload: ${formatNumber(getSupplyDropValue())} Salvage`
        : "Your crew is preparing the next crate.";
}

function renderContracts() {
    const container = el("contractList");
    if (!container) return;
    container.innerHTML = "";
    Object.entries(CONTRACTS).forEach(([key, contract]) => {
        const claimed = !!game.contractsClaimed[key];
        const complete = contract.check();
        const item = document.createElement("div");
        item.className = `contract ${claimed ? "claimed" : complete ? "complete" : ""}`;
        item.innerHTML = `<div><strong>${contract.name}</strong><span>${contract.desc}</span></div><button ${(!complete || claimed) ? "disabled" : ""}>${claimed ? "CLAIMED" : complete ? `CLAIM ${contract.reward}` : contract.reward}</button>`;
        const button = item.querySelector("button");
        if (complete && !claimed) button.onclick = () => claimContract(key);
        container.appendChild(item);
    });
}

function renderAchievements() {
    const container = el("achievementGrid");
    if (!container) return;
    const unlocked = Object.keys(ACHIEVEMENTS).filter(key => game.achievements[key]).length;
    el("badgeProgress").textContent = `${unlocked} / ${Object.keys(ACHIEVEMENTS).length}`;
    container.innerHTML = "";
    Object.entries(ACHIEVEMENTS).forEach(([key, badge]) => {
        const unlockedBadge = !!game.achievements[key];
        const card = document.createElement("div");
        card.className = `achievement ${unlockedBadge ? "unlocked" : ""}`;
        card.innerHTML = `<span>${unlockedBadge ? badge.icon : "🔒"}</span><div><strong>${badge.name}</strong><small>${badge.desc}</small></div>`;
        container.appendChild(card);
    });
}

function updateMilestone() {
    const title = el("milestoneTitle");
    const detail = el("milestoneDetail");
    const bar = el("milestoneBar");
    const percent = el("milestonePercent");
    if (!title || !detail || !bar || !percent) return;
    const objective = zoneObjective(currentStageView);
    const complete = currentStageView < 5 ? isZoneUnlocked(currentStageView + 1) : game.adventure.bossDefeated;
    const guide = complete ? null : firstCityGuide();
    const progress = complete ? 100 : (guide ? guide.progress : objective.progress) * 100;
    title.textContent = complete ? ZONES[currentStageView].name + " — objective complete" : guide?.title || ZONES[currentStageView].quest;
    detail.textContent = guide ? guide.detail + ' Zone goal: 4 City Centers + 3 beacon modules.' : objective.detail;
    const rounded = Math.floor(progress);
    bar.style.width = `${rounded}%`;
    percent.textContent = `${rounded}%`;
}

function updateUpgradeReadyCount() {
    const badge = el("upgradeReadyCount");
    if (!badge) return;
    const shops = currentStageView === 1 ? [[TECH_UPGRADES, game.cityTech, game.salvage], [REBIRTH_UPGRADES, game.rebirthUpgrades, game.shards]]
        : [[{2:STAGE2_UPGRADES,3:STAGE3_UPGRADES,4:STAGE4_UPGRADES,5:STAGE5_UPGRADES}[currentStageView], game["stage"+currentStageView+"Upgrades"], game[ZONES[currentStageView].currency]],
           [{2:STAGE2_RESET_UPGRADES,3:STAGE3_RESET_UPGRADES,4:STAGE4_RESET_UPGRADES,5:STAGE5_RESET_UPGRADES}[currentStageView], game["stage"+currentStageView+"ResetUpgrades"], game[{2:"scrapTokens",3:"partTokens",4:"networkTokens",5:"ascensionTokens"}[currentStageView]]]];
    const ready = shops.reduce((sum, [table, state, currency]) => sum + Object.entries(table).filter(([key, def]) =>
        state[key] < def.max && currency >= economyUpgradeCost(def, state[key]) && !(key === "lastCity" && !game.adventure.bossDefeated)).length, 0);
    const archivedReady = Object.entries(PRESERVATION[currentStageView]).filter(([key, def]) => preservationUnlocked(currentStageView,key) && !preservationOwned(currentStageView,key) && game[ZONES[currentStageView].currency] >= def.cost).length;
    const buildingsReady = currentStageView === 1 ? Object.keys(BUILDINGS).filter(key => game.salvage >= getBuildingCost(key)).length
        : Object.entries(INFRASTRUCTURE[currentStageView]).filter(([key,def]) => infrastructureLevel(key) < def.max && game[ZONES[currentStageView].currency] >= infrastructureCost(def,infrastructureLevel(key))).length;
    const count = ready + archivedReady + buildingsReady;
    badge.hidden = count === 0; badge.textContent = count > 9 ? "9+" : count;
}

// =============================================
// RENDER UPGRADES
// =============================================

// Currency funding, not upgrade level: CSS renders and animates the meter.
function purchaseProgressMarkup(balance, cost, maxed = false, blocked = false) {
    if (maxed) return '<span class="purchase-status">Fully upgraded</span>';
    const percent = Math.floor(Math.min(1, Math.max(0, balance / Math.max(1, cost))) * 100);
    const status = blocked ? "Defeat Guardian first" : percent >= 100 ? "Ready to buy" : percent + "% funded";
    return `<span class="purchase-progress${percent >= 100 && !blocked ? " funded" : ""}"><span class="purchase-track" role="progressbar" aria-label="Purchase funding" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${status}" style="--purchase-progress:${percent}%"><span></span></span><span class="purchase-status">${status}</span></span>`;
}

function renderPurchaseOutlook() {
    const stage = currentStageView, mount = el("nextPurchase" + stage);
    if (!mount) return;
    const tables = {
        1: [TECH_UPGRADES, game.cityTech], 2: [STAGE2_UPGRADES, game.stage2Upgrades],
        3: [STAGE3_UPGRADES, game.stage3Upgrades], 4: [STAGE4_UPGRADES, game.stage4Upgrades],
        5: [STAGE5_UPGRADES, game.stage5Upgrades]
    };
    const [table, state] = tables[stage], currency = ZONES[stage].currency, balance = game[currency];
    const choices = Object.entries(table).filter(([key, def]) => state[key] < def.max)
        .map(([key, def]) => ({ name: def.name, cost: economyUpgradeCost(def, state[key]), view: 'tools', target: '#' + (stage === 1 ? 'techUpgrades' : 'stage' + stage + 'Upgrades') + ' [data-economy-upgrade="' + key + '"]' }));
    for (const [key,def] of Object.entries(PRESERVATION[stage])) {
        if (preservationUnlocked(stage,key) && !preservationOwned(stage,key)) choices.push({name:def.name,cost:def.cost,view:'research',target:'[data-preservation="' + key + '"]'});
    }
    for (const [key, def] of Object.entries(INFRASTRUCTURE[stage] || {})) {
        if (infrastructureLevel(key) < def.max) choices.push({ name: def.name, cost: infrastructureCost(def, infrastructureLevel(key)), view:'buildings', target:'[data-choice="' + key + '"]' });
    }
    if (stage === 1) for (const [key, def] of Object.entries(BUILDINGS)) if (Number.isFinite(getBuildingCost(key))) choices.push({ name: def.name, cost: getBuildingCost(key), view:'buildings', target:'#buy' + key.charAt(0).toUpperCase() + key.slice(1) });
    const candidates = currentGameMode === 'upgrades' && purchaseView !== 'research' ? choices.filter(choice => choice.view === purchaseView) : choices;
    const next = candidates.sort((a, b) => a.cost - b.cost)[0];
    if (mount.dataset.navigationMounted !== 'yes') {
        mount.innerHTML = '<div id="nextPurchaseInfo' + stage + '" class="next-purchase-info"></div><button id="nextPurchaseLink' + stage + '" type="button" class="secondary-button"></button>';
        mount.dataset.navigationMounted = 'yes';
    }
    const markup = next ? `<p class="eyebrow">LOWEST-COST OPTION</p><strong>${next.name}</strong>${purchaseProgressMarkup(balance, next.cost)}<small>${balance >= next.cost ? "Ready for purchase" : formatNumber(next.cost - balance) + " " + ZONES[stage].label + " to go"}</small>${purchaseEtaMarkup(balance,next.cost,stage)}`
        : '<p class="eyebrow">UPGRADE STATUS</p><strong>All resource upgrades complete</strong><small>Keep building your legacy.</small>';
    const info = el('nextPurchaseInfo' + stage), link = el('nextPurchaseLink' + stage);
    if (info && info.innerHTML !== markup) info.innerHTML = markup;
    if (link) {
        link.hidden = !next;
        if (next) {
            link.dataset.shopLink = next.view; link.dataset.shopTarget = next.target;
            link.textContent = 'Find in ' + next.view.charAt(0).toUpperCase() + next.view.slice(1) + ' →';
        }
    }
}

function renderRebirthUpgrades() {
    const container = el("rebirthUpgrades");
    if (!container) return;
    // Reuse cards so income ticks do not interrupt touch or keyboard input.
    Object.entries(REBIRTH_UPGRADES).forEach(([key, def]) => {
        const level = game.rebirthUpgrades[key];
        const cost = economyUpgradeCost(def, level);
        const maxed = level >= def.max;
        const canAfford = game.shards >= cost;
        const btn = container.querySelector('[data-economy-upgrade="' + key + '"]') || document.createElement("button");
        btn.dataset.economyUpgrade = key;
        btn.className = "upgrade-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `
            <div class="upgrade-name">${def.name}</div>
            <div class="upgrade-desc">${def.desc}</div>
            <div class="upgrade-meta">
                <span>Lv ${level}/${def.max}</span>
                <span>${maxed ? "MAXED" : formatNumber(cost) + " 💎"}</span>
            </div>
        `;
        if (!maxed) {
            const effect = key === 'headStart' ? 'Next renewal: 1,000 starter Salvage and at least one Camp.'
                : key === 'cheapBuild' ? outputChangeMarkup(getBuildingCost('scavenger'),projectedPurchase(['rebirthUpgrades'],key,1,()=>getBuildingCost('scavenger')),'Salvage for next Camp')
                : purchaseForecastMarkup(1,['rebirthUpgrades'],key);
            if (effect) btn.innerHTML += '<div class="upgrade-effect">' + effect + '</div>';
        }
        btn.innerHTML += purchaseProgressMarkup(game.shards, cost, maxed);
        if (!maxed) btn.onclick = () => buyRebirthUpgrade(key);
        if (!btn.parentNode) container.appendChild(btn);
    });
}

function renderTechUpgrades() {
    const container = el("techUpgrades");
    if (!container) return;
    // Reuse cards so income ticks do not interrupt touch or keyboard input.
    Object.entries(TECH_UPGRADES).forEach(([key, def]) => {
        const level = game.cityTech[key];
        const maxed = level >= def.max;
        const cost = getTechCost(def, level);
        const canAfford = game.salvage >= cost;
        const btn = container.querySelector('[data-economy-upgrade="' + key + '"]') || document.createElement("button");
        btn.dataset.economyUpgrade = key;
        btn.className = "upgrade-card tech-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `<div class="tech-icon">${def.icon}</div><small class="upgrade-role">${def.role}</small><div class="upgrade-name">${def.name}</div><div class="upgrade-desc">${def.desc}</div><div class="upgrade-effect">${maxed ? "Fully upgraded" : key === "salvageMagnet" ? purchaseForecastMarkup(1,['cityTech'],key) + '<small>' + level + ' → ' + (level+1) + ' automatic gathers/sec</small>' : upgradeEffectText(1, key, def, level)}</div><div class="upgrade-meta"><span>Lv ${level}/${def.max}</span><span>${maxed ? "MAXED" : formatNumber(cost) + " ⚙️"}</span></div>`;
        btn.innerHTML += purchaseProgressMarkup(game.salvage, cost, maxed);
        if (!maxed) btn.innerHTML += purchaseEtaMarkup(game.salvage,cost,1);
        if (!maxed) btn.onclick = () => buyTechUpgrade(key);
        if (!btn.parentNode) container.appendChild(btn);
    });
}

function renderStageUpgrades(stage, table, state, currency) {
    const container = el(`stage${stage}Upgrades`);
    if (!container) return;
    // Reuse cards so income ticks do not interrupt touch or keyboard input.
    const current = stage === 2 ? game.scrap : stage === 3 ? game.parts : stage === 4 ? game.circuits : game.cores;
    Object.entries(table).forEach(([key, def]) => {
        const level = state[key];
        const cost = economyUpgradeCost(def, level);
        const maxed = level >= def.max;
        const canAfford = current >= cost;
        const btn = container.querySelector('[data-economy-upgrade="' + key + '"]') || document.createElement("button");
        btn.dataset.economyUpgrade = key;
        btn.className = "upgrade-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `
            <small class="upgrade-role">${def.role}</small><div class="upgrade-name">${def.name}</div>
            <div class="upgrade-desc">${def.desc}</div><div class="upgrade-effect">${maxed ? "Fully upgraded" : upgradeEffectText(stage, key, def, level)}</div>
            <div class="upgrade-meta">
                <span>Lv ${level}/${def.max}</span>
                <span>${maxed ? "MAXED" : formatNumber(cost) + " " + currency}</span>
            </div>
        `;
        btn.innerHTML += purchaseProgressMarkup(current, cost, maxed);
        if (!maxed) btn.innerHTML += purchaseEtaMarkup(current,cost,stage);
        if (!maxed) btn.onclick = () => buyUpgrade(stage, key);
        if (!btn.parentNode) container.appendChild(btn);
    });
}

function renderResetUpgrades() {
    const map = {
        2: { container: "stage2ResetUpgrades", table: STAGE2_RESET_UPGRADES, state: game.stage2ResetUpgrades, tokens: game.scrapTokens },
        3: { container: "stage3ResetUpgrades", table: STAGE3_RESET_UPGRADES, state: game.stage3ResetUpgrades, tokens: game.partTokens },
        4: { container: "stage4ResetUpgrades", table: STAGE4_RESET_UPGRADES, state: game.stage4ResetUpgrades, tokens: game.networkTokens },
        5: { container: "stage5ResetUpgrades", table: STAGE5_RESET_UPGRADES, state: game.stage5ResetUpgrades, tokens: game.ascensionTokens }
    };
    Object.entries(map).forEach(([stage, cfg]) => {
        const container = el(cfg.container);
        if (!container) return;
        // Reuse cards so income ticks do not interrupt touch or keyboard input.
        Object.entries(cfg.table).forEach(([key, def]) => {
            const level = cfg.state[key];
        const cost = economyUpgradeCost(def, level);
            const maxed = level >= def.max;
            const canAfford = cfg.tokens >= cost;
            const bossLocked = key === "lastCity" && !game.adventure.bossDefeated;
            const btn = container.querySelector('[data-economy-upgrade="' + key + '"]') || document.createElement("button");
        btn.dataset.economyUpgrade = key;
            btn.className = "upgrade-card" + (maxed ? " maxed" : "");
            btn.disabled = maxed || !canAfford || bossLocked;
            btn.innerHTML = `
                <div class="upgrade-name">${def.name}</div>
                <div class="upgrade-desc">${def.desc}</div>
                <div class="upgrade-meta">
                    <span>Lv ${level}/${def.max}</span>
                    <span>${maxed ? "MAXED" : formatNumber(cost) + " 🪙"}</span>
                </div>
            `;
            if (!maxed) {
                const previewStage = ({salvageBoost2:1,scrapBoost3:2,partBoost4:3,circuitBoost:4})[key] || Number(stage);
                const effect = purchaseForecastMarkup(previewStage,['stage'+stage+'ResetUpgrades'],key);
                if (effect) btn.innerHTML += '<div class="upgrade-effect">' + effect + '</div>';
            }
            btn.innerHTML += purchaseProgressMarkup(cfg.tokens, cost, maxed, bossLocked);
            if (!maxed) btn.onclick = () => buyResetUpgrade(parseInt(stage), key);
            if (!btn.parentNode) container.appendChild(btn);
        });
    });
}

// =============================================
// SAVE / LOAD
// =============================================

function getSaveKey() {
    return window.LastCityCloud ? window.LastCityCloud.getSaveKey() : SAVE_KEY;
}

function saveGame(showMsg = true) {
    game.lastSeen = Date.now();
    if (typeof SAVE_VERSION === "number") game.saveVersion = SAVE_VERSION;
    try {
        localStorage.setItem(getSaveKey(), JSON.stringify(game));
        startupSaveAvailable = true;
        terminalProgressSavedAt=Date.now();
    } catch (error) {
        if (showMsg) showNotification("Browser storage unavailable. Check your cloud save status.");
        window.LastCityCloud?.onSave(showMsg);
        return;
    }
    window.LastCityCloud?.onSave(showMsg);
    const indicator = el("autoSaveIndicator");
    if (indicator) {
        indicator.textContent = "● Progress saved";
        indicator.classList.add("saved");
        setTimeout(() => { indicator.textContent = "● Auto-save ready"; indicator.classList.remove("saved"); }, 1400);
    }
    if (showMsg) showNotification("Game saved!");
    if (!gameStarted) renderStartupPage();
}

function loadGame(snapshot) {
    clearTerminalSession();
    el('zoneHelpModal')?.close?.();
    clearRenewalPreview();
    clearFeedbackSession();
    startupSaveAvailable = false;
    dailyClaimError = '';
    clearLorePopupSession();
    if (glyphAuto) stopGlyphAuto("Auto-roll stopped when loading a save.");
    glyphManualReadyAt = 0;
    glyphMessage = "Auto-roll is off. Choose when to spend your currency.";
    if (autoHatchSession) stopAutoHatch("Auto hatch stopped when loading a save.");
    const saved = snapshot === undefined ? localStorage.getItem(getSaveKey()) : snapshot;
    if (!saved) {
        game = JSON.parse(JSON.stringify(defaultGame));
        game.onboarding = normalizeOnboarding(null, {});
        if (typeof normalizeProgress === "function") game.progress = normalizeProgress(null);
        game.lastSeen = Date.now();
        game.sessionStartedAt = Date.now();
        queueUnpresentedLore();
        notifyExpansionLoaded();
        updateGame();
        return;
    }
    try {
        const loaded = JSON.parse(saved);
        // Repair a save written before the economy rebalance BEFORE it becomes
        // the live game, so the broken numbers never reach the loop or the UI.
        pendingSaveReport = null;
        if (typeof migrateSaveEconomy === "function") {
            try {
                const report = migrateSaveEconomy(loaded);
                if (report && (report.changed?.length || report.inflated)) pendingSaveReport = report;
            } catch (error) { console.error("[LastCity] save migration failed:", error); }
        }
        game = {
            ...defaultGame,
            ...loaded,
            ambientEnabled: loaded.ambientEnabled === true,
            storyPopupsEnabled: loaded.storyPopupsEnabled !== false,
            dailyReward: normalizeDailyReward(loaded.dailyReward),
            feedback: normalizeFeedback(loaded.feedback),
            lastStageView: Number.isInteger(loaded.lastStageView) && loaded.lastStageView >= 1 && loaded.lastStageView <= 5
                ? loaded.lastStageView : [5,4,3,2,1].find(stage => stage === 1 || loaded['stage' + stage + 'Unlocked']),
            story: normalizeStory(loaded.story),
            expansion: typeof normalizeExpansion === "function" ? normalizeExpansion(loaded.expansion) : loaded.expansion,
            musicEnabled: loaded.musicEnabled !== false,
            musicVolume: Number.isFinite(loaded.musicVolume) ? loaded.musicVolume : 0.55,
            sfxVolume: Number.isFinite(loaded.sfxVolume) ? loaded.sfxVolume : 0.8,
            glyphs: normalizeGlyphs(loaded.glyphs),
            onboarding: normalizeOnboarding(loaded.onboarding, loaded),
            operator: { seen: { ...(loaded.operator?.seen || {}) } },
            progress: typeof normalizeProgress === "function" ? normalizeProgress(loaded.progress, loaded) : loaded.progress,
            preservation: normalizePreservation(loaded.preservation),
            sessionStartedAt: Date.now(),
            buildings: { ...defaultGame.buildings, ...(loaded.buildings || {}) },
            cityTech: { ...defaultGame.cityTech, ...(loaded.cityTech || {}) },
            contractsClaimed: { ...defaultGame.contractsClaimed, ...(loaded.contractsClaimed || {}) },
            achievements: { ...defaultGame.achievements, ...(loaded.achievements || {}) },
            adventure: normalizeAdventure(loaded.adventure),
            rebirthUpgrades: { ...defaultGame.rebirthUpgrades, ...(loaded.rebirthUpgrades || {}) },
            stage2Upgrades: { ...defaultGame.stage2Upgrades, ...(loaded.stage2Upgrades || {}) },
            stage2ResetUpgrades: { ...defaultGame.stage2ResetUpgrades, ...(loaded.stage2ResetUpgrades || {}) },
            stage3Upgrades: { ...defaultGame.stage3Upgrades, ...(loaded.stage3Upgrades || {}) },
            stage3ResetUpgrades: { ...defaultGame.stage3ResetUpgrades, ...(loaded.stage3ResetUpgrades || {}) },
            stage4Upgrades: { ...defaultGame.stage4Upgrades, ...(loaded.stage4Upgrades || {}) },
            economy: migrateEconomy(loaded),
            stage4ResetUpgrades: { ...defaultGame.stage4ResetUpgrades, ...(loaded.stage4ResetUpgrades || {}) },
            stage5Upgrades: { ...defaultGame.stage5Upgrades, ...(loaded.stage5Upgrades || {}) },
            stage5ResetUpgrades: { ...defaultGame.stage5ResetUpgrades, ...(loaded.stage5ResetUpgrades || {}) }
        };
        startupSaveAvailable = true;
        // Second migration pass: now that `game` exists, the current formulas
        // can say what this city really produces, and the stored balances are
        // brought into line with that rather than with the old curves.
        if (pendingSaveReport && typeof normalizeEconomyBalances === "function") {
            try {
                const rebuilt = normalizeEconomyBalances();
                if (rebuilt.length) pendingSaveReport.changed.push(...rebuilt);
            } catch (error) { console.error("[LastCity] balance normalization failed:", error); }
        }
        feedbackOfflineCalculation = true;
        try { applyOfflineProgress(); } finally { feedbackOfflineCalculation = false; }
    } catch (e) {
        console.error(e);
        game = JSON.parse(JSON.stringify(defaultGame));
        startupSaveAvailable = false;
    }
    queueUnpresentedLore();
    notifyExpansionLoaded();
    updateGame();
    if (pendingSaveReport) armSaveRecoveryNotice();
    else setTimeout(showOfflineModal, 500);
}

// ---------------------------------------------------------------
// Legacy save notice
//
// A returning player whose save was repaired is told exactly what happened and
// given a choice, rather than being dropped into a city whose numbers silently
// changed underneath them.
// ---------------------------------------------------------------
let pendingSaveReport = null;
let saveRecoveryTimer = 0;

// The player is still on the startup screen when the save is repaired, and the
// route from there into the city differs (intro card, terminal boot, cloud
// switch) with no single point that always runs. Rather than hooking each one,
// the notice waits for the city to actually be on screen with nothing else
// open, then shows itself once.
function armSaveRecoveryNotice() {
    if (saveRecoveryTimer) return;
    const started = Date.now();
    saveRecoveryTimer = setInterval(() => {
        if (!pendingSaveReport || Date.now() - started > 120000) {
            clearInterval(saveRecoveryTimer);
            saveRecoveryTimer = 0;
            return;
        }
        if (!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.()) return;
        if (document.querySelector("dialog[open]") || document.querySelector(".offline-modal")) return;
        clearInterval(saveRecoveryTimer);
        saveRecoveryTimer = 0;
        showSaveRecoveryNotice();
    }, 300);
}

function showSaveRecoveryNotice() {
    const report = pendingSaveReport;
    // Keep the report pending while the startup screen is still up; the city
    // boot path calls back here once the player has actually pressed PLAY.
    if (!report || !gameStarted) return;
    if (document.getElementById("saveRecoveryModal")) return;
    pendingSaveReport = null;

    const dialog = document.createElement("dialog");
    dialog.id = "saveRecoveryModal";
    dialog.className = "save-recovery-modal";
    dialog.setAttribute("aria-labelledby", "saveRecoveryTitle");
    const lines = (report.changed || []).map(line => "<li>" + line + "</li>").join("");
    const detail = report.inflated
        ? "<p>It was built under the old production curves, which grew exponentially and pushed its " +
          "numbers far past anything the rebalanced economy can produce. It has been updated for the " +
          "new economy: your city still stands, and its output has been recalculated with the " +
          "current formulas rather than the old ones.</p>"
        : "<p>It has been updated for the new economy.</p>";
    dialog.innerHTML =
        '<div class="recovery-shell">' +
          '<p class="eyebrow">SAVE UPDATED</p>' +
          '<h2 id="saveRecoveryTitle">An older Last City save was detected</h2>' +
          detail +
          '<p>Everything you achieved is intact — renewals, zones, buildings, upgrades, ' +
          'companions, glyphs, research, stories and achievements all carried over. ' +
          'What changed:</p>' +
          '<ul class="recovery-list">' + (lines || "<li>Save format updated.</li>") + '</ul>' +
          '<div class="recovery-actions">' +
            '<button type="button" id="saveRecoveryKeep" class="recovery-primary">Continue with Balanced Save</button>' +
            '<button type="button" id="saveRecoveryReset" class="recovery-secondary">Start Fresh</button>' +
          '</div>' +
          '<p class="recovery-note">Starting fresh cannot be undone.</p>' +
        '</div>';
    document.body.appendChild(dialog);
    dialog.addEventListener("cancel", event => event.preventDefault());
    document.getElementById("saveRecoveryKeep")?.addEventListener("click", () => {
        dialog.close(); dialog.remove();
        saveGame(false);
        showNotification("Balanced save loaded.");
        showOfflineModal();
    });
    document.getElementById("saveRecoveryReset")?.addEventListener("click", () => {
        dialog.close(); dialog.remove();
        startFreshCity("Fresh city started.");
    });
    try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
    document.getElementById("saveRecoveryKeep")?.focus?.({ preventScroll: true });
}

// A clean slate without the confirm() prompt that resetAllProgress uses, for
// paths where the player has already chosen this in a dialog.
function startFreshCity(message) {
    clearFeedbackSession();
    clearLorePopupSession();
    clearRenewalPreview();
    if (glyphAuto) stopGlyphAuto("Auto-roll stopped.");
    if (autoHatchSession) stopAutoHatch("Auto hatch stopped.");
    try { localStorage.removeItem(getSaveKey()); } catch (_) { }
    game = JSON.parse(JSON.stringify(defaultGame));
    game.lastSeen = Date.now();
    game.sessionStartedAt = Date.now();
    currentStageView = 1;
    stageTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.stage === "1"));
    stagePanels.forEach(panel => panel.classList.toggle("active", panel.id === "stage1Panel"));
    clearVfx();
    clearTerminalSession();
    switchGameMode("city");
    notifyExpansionLoaded();
    saveGame(false);
    updateGame();
    if (message) showNotification(message);
}

// Called after every load path (new game, device save, cloud save, account
// switch) so the added systems re-read the save they have just been handed.
function notifyExpansionLoaded() {
    if (typeof migrateExpansionState === "function") {
        try { migrateExpansionState(game); } catch (error) { console.error(error); }
    }
    try { window.LastCityExpansion?.onLoad?.(); } catch (error) { console.error(error); }
    try { window.LastCityAudio?.syncPreferences?.(); } catch (_) { }
}

saveButton.addEventListener("click", () => saveGame(true));
function resetAllProgress() {
    if (window.LastCityCloud?.isSwitching?.()) return;
    if (!confirm("Reset EVERYTHING? This cannot be undone.")) return;
    clearFeedbackSession();
    clearLorePopupSession();
    clearRenewalPreview();
    if (glyphAuto) stopGlyphAuto("Auto-roll stopped by full reset.");
    glyphManualReadyAt = 0;
    glyphMessage = "Auto-roll is off. Choose when to spend your currency.";
    if (autoHatchSession) stopAutoHatch("Auto hatch stopped by full reset.");
    localStorage.removeItem(getSaveKey());
    game = JSON.parse(JSON.stringify(defaultGame));
    stopAmbientAudio();
    closeStartupPanels();
    dailyClaimError = '';
    game.lastSeen = Date.now();
    currentStageView = 1;
    storySelected = "prologue";
    storyScope = "all";
    stageTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.stage === "1"));
    stagePanels.forEach(panel => panel.classList.toggle("active", panel.id === "stage1Panel"));
    clearVfx();
    clearTerminalSession();
    switchGameMode("city");
    saveGame(false);
    showNotification("Full reset.");
    if(typeof terminalPowerCycle==='function')terminalPowerCycle(el('stage1Panel'));
}
resetButton.addEventListener("click", resetAllProgress);

// =============================================
// NOTIFICATION
// =============================================

// A wallet balance: never floored to a misleading 0, never noisy once large.
function formatBalance(value) {
    if (!Number.isFinite(value)) return "0";
    const amount = Math.max(0, value);
    if (amount > 0 && amount < 10) return (Math.floor(amount * 10) / 10).toFixed(1);
    return formatNumber(Math.floor(amount));
}

// Readable units all the way up.
//
// This used to switch to scientific notation at one MILLION, which is why
// testers saw "1.00e6" while still in Ashfall. A player passes a million
// total Salvage within ten minutes of a first run; that is not an enormous
// number and should not read like one. Suffixes now carry to a quintillion,
// and scientific notation is kept for values that genuinely have no name.
const NUMBER_SUFFIXES = [
    { at: 1e18, suffix: "Qi" }, { at: 1e15, suffix: "Qa" }, { at: 1e12, suffix: "T" },
    { at: 1e9, suffix: "B" }, { at: 1e6, suffix: "M" }, { at: 1e3, suffix: "K" }
];
function formatNumber(value) {
    if (Number.isNaN(value)) return "0";
    if (!Number.isFinite(value)) return value < 0 ? "−∞" : "∞";
    const abs = Math.abs(value);
    if (abs >= 1e21) return value.toExponential(2).replace("e+", "e");
    for (let i = 0; i < NUMBER_SUFFIXES.length; i++) {
        const unit = NUMBER_SUFFIXES[i];
        if (abs < unit.at) continue;
        let scaled = value / unit.at, suffix = unit.suffix;
        // 999,999 would otherwise round to "1000K" instead of "1.0M".
        if (Math.abs(scaled) >= 999.95 && i > 0) { scaled /= 1000; suffix = NUMBER_SUFFIXES[i - 1].suffix; }
        return (Math.abs(scaled) < 100 ? scaled.toFixed(1) : String(Math.round(scaled))) + suffix;
    }
    return value.toLocaleString("en-US", { maximumFractionDigits: abs < 1000 ? 1 : 0 });
}

function showFloatingGain(anchor, text) {
    if (typeof terminalPrintGain === 'function') return terminalPrintGain(anchor,text);
    const layer = el("fxLayer");
    if (!layer || !anchor || !canPlayVfx()) return;
    const rect = anchor.getBoundingClientRect();
    const gain = document.createElement("span");
    gain.className = "floating-gain" + (text.startsWith('CRITICAL!')?' critical-gain':'');
    gain.textContent = text;
    gain.style.left = `${rect.left + rect.width / 2 + (Math.random() - 0.5) * 36}px`;
    gain.style.top = `${rect.top + 12}px`;
    mountVfx(gain);
}

function spawnBurst(anchor, color, amount = 8) {
    const layer = el("fxLayer");
    if (!layer || !anchor || !canPlayVfx()) return;
    const rect = anchor.getBoundingClientRect();
    for (let i = 0; i < amount; i++) {
        const particle = document.createElement("i");
        particle.className = "spark";
        particle.style.left = `${rect.left + rect.width / 2}px`;
        particle.style.top = `${rect.top + rect.height / 2}px`;
        particle.style.background = color;
        const angle=i/amount*Math.PI*2, distance=45+Math.random()*45;
        particle.style.setProperty("--x", `${Math.cos(angle)*distance}px`);
        particle.style.setProperty("--y", `${Math.sin(angle)*distance}px`);
        particle.style.animationDelay = `${Math.random() * 80}ms`;
        if (!mountVfx(particle)) break;
    }
}

function celebrateUpgrade() {
    playSfx("upgrade");
    terminalPurchase();
    if (!canPlayVfx()) return;
    const anchor = document.activeElement?.classList.contains("upgrade-card")
        ? document.activeElement : document.querySelector(".game-mode-tabs");
    spawnBurst(anchor, "#aa8cff", 14);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const flash = document.createElement("div");
    flash.className = "purchase-flash";
    Object.assign(flash.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
    mountVfx(flash);
    document.body.classList.remove("upgrade-celebration");
    void document.body.offsetWidth;
    document.body.classList.add("upgrade-celebration");
}

// Queue milestone celebrations so simultaneous badges do not overwrite each other.
const celebrationQueue = [];
let celebrationActive = false;

function checkAchievements() {
    Object.entries(ACHIEVEMENTS).forEach(([key, badge]) => {
        if (!game.achievements[key] && badge.check()) {
            game.achievements[key] = true;
            celebrateEvent("achievement", badge.name, badge.desc, badge.icon);
        }
    });
}

function celebrateEvent(kind, title, detail, icon = "🌅") {
    celebrationQueue.push({ kind, title, detail, icon });
    showNextCelebration();
}

function showNextCelebration() {
    if (celebrationActive || celebrationQueue.length === 0) return;
    celebrationActive = true;
    const { kind, title, detail, icon } = celebrationQueue.shift();
    const card = document.createElement("div");
    card.className = `milestone-celebration ${kind}-celebration`;
    card.setAttribute("role", "status");
    const symbol = document.createElement("span");
    symbol.className = "celebration-symbol";
    symbol.textContent = icon;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const label = document.createElement("small");
    label.textContent = { rebirth: "CITY RENEWAL", achievement: "ACHIEVEMENT UNLOCKED", hatch: "EGG HATCHED", zone: "ZONE UNLOCKED", boss: "BOSS DEFEATED" }[kind] || "MILESTONE";
    const caption = document.createElement("p");
    caption.textContent = detail;
    card.append(symbol, label, heading, caption);
    document.body.appendChild(card);
    spawnBurst(card, kind === "rebirth" ? "#aa8cff" : "#ffc247", kind === "rebirth" ? 32 : 18);
    playSfx("upgrade");
    if (kind === "rebirth" && canPlayVfx()) {
        const wave = document.createElement("div");
        wave.className = "rebirth-wave";
        mountVfx(wave, 1300);
    }
    setTimeout(() => {
        card.remove();
        celebrationActive = false;
        showNextCelebration();
    }, 2600);
}

function showNotification(msg) {
    terminalTransmission(msg);
}

function playSfx(type = "click") {
    if (!game.soundEnabled || document.hidden || window.LastCityCloud?.isSwitching?.() || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
        const now=Date.now(), cooldown={ui:60,click:70,beep:250,failure:250,hatch:500,rebirth:1000}[type] || 120;
        if(sfxVoices.size+(type==='hatch'?3:type==='travel'?2:1)>12 || now-(sfxLastTimes.get(type)??-Infinity)<cooldown)return;
        sfxLastTimes.set(type,now);
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume()?.catch?.(()=>{});
        const notes = { click:[110,.12,'triangle'],clack:[95,.055,'square'],ui:[440,.035,'sine'],beep:[660,.055,'sine'],failure:[85,.1,'sawtooth'],boot:[240,.16,'sine'],travel:[190,.25,'sine'],rebirth:[55,.5,'triangle'],hatch:[261.63,.45,'sine'],build:[140,.14,'triangle'],upgrade:[180,.16,'triangle'],critical:[900,.14,'sine'],dispatch:[500,.18,'triangle'] };
        const [frequency, duration, wave] = notes[type] || notes.click;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        if (type === "upgrade" || type === "dispatch") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, audioContext.currentTime + duration);
        else oscillator.frequency.exponentialRampToValueAtTime(frequency*(type==='critical'?2:type==='travel'?1.8:.45),audioContext.currentTime+duration);
        gain.gain.setValueAtTime(.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.045, audioContext.currentTime + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        sfxVoices.add(oscillator);
        oscillator.stop(audioContext.currentTime + duration);
        oscillator.onended=()=>{sfxVoices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        if(type==='hatch')for(const note of [329.63,392]){
            const voice=audioContext.createOscillator(),volume=audioContext.createGain();voice.type='sine';voice.frequency.value=note;
            volume.gain.setValueAtTime(.015,audioContext.currentTime);volume.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.45);
            voice.connect(volume).connect(audioContext.destination);voice.start();voice.stop(audioContext.currentTime+.45);
            sfxVoices.add(voice);
            voice.onended=()=>{sfxVoices.delete(voice);voice.disconnect();volume.disconnect();};
        }
        if(type==='travel' && audioContext.createBuffer && audioContext.createBufferSource && audioContext.createBiquadFilter){
            const samples=Math.floor(audioContext.sampleRate*.3),buffer=audioContext.createBuffer(1,samples,audioContext.sampleRate),data=buffer.getChannelData(0);
            // A private deterministic noise sequence, never the gameplay RNG.
            let seed=189;for(let i=0;i<samples;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
            const wind=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),volume=audioContext.createGain();wind.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(500,audioContext.currentTime);filter.frequency.exponentialRampToValueAtTime(1600,audioContext.currentTime+.25);
            volume.gain.setValueAtTime(.0001,audioContext.currentTime);volume.gain.exponentialRampToValueAtTime(.025,audioContext.currentTime+.08);volume.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.3);
            wind.connect(filter).connect(volume).connect(audioContext.destination);
            let delay,echo;if(audioContext.createDelay){delay=audioContext.createDelay(.5);echo=audioContext.createGain();delay.delayTime.value=.13;echo.gain.value=.2;volume.connect(delay).connect(echo).connect(audioContext.destination);}
            sfxVoices.add(wind);wind.start();wind.stop(audioContext.currentTime+.45);
            wind.onended=()=>{sfxVoices.delete(wind);wind.disconnect();filter.disconnect();volume.disconnect();delay?.disconnect();echo?.disconnect();};
        }
    } catch (_) { }
}

function showIntroModal() {
    if (!gameStarted && introModal && !introModal.open) {
        introModal.hidden = false;
        renderPlayerUI();
        introModal.showModal();
        animateVfx(introModal.querySelector(".intro-card"),
            [{ opacity: .4, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]);
    }
}
function closeIntroModal({deferOffline=false}={}) {
    if (!introModal || gameStarted || window.LastCityCloud?.isSwitching?.() || el('accountModal')?.open) return;
    closeStartupPanels();
    const stage = isZoneUnlocked(game.lastStageView) ? game.lastStageView : 1;
    currentStageView = stage;
    stageTabs.forEach(tab => tab.classList.toggle('active', Number(tab.dataset.stage) === stage));
    stagePanels.forEach(panel => panel.classList.toggle('active', panel.id === 'stage' + stage + 'Panel'));
    gameStarted = true;
    game.sessionStartedAt = Date.now();
    game.introSeen = true;
    introModal.close();
    introModal.hidden = true;
    ambientAudioArmed = true;
    syncAmbientAudio();
    playSfx("upgrade");
    saveGame(false);
    updateGame();
    (stage === 1 ? energyButton : el('milestoneAction'))?.focus?.({ preventScroll: true });
    if(!deferOffline)showOfflineModal();
}

function toggleGameSound() {
    if (window.LastCityCloud?.isSwitching?.()) return;
    game.soundEnabled = !game.soundEnabled;
    if(!game.soundEnabled)silenceGameAudio();
    soundButton.textContent = game.soundEnabled ? "🔊 Sound" : "🔇 Sound";
    soundButton.setAttribute("aria-pressed", String(game.soundEnabled));
    if (game.soundEnabled) playSfx("click");
    ambientAudioArmed = true;
    syncAmbientAudio(); renderStartupSettings();
    saveGame(false);
}
soundButton.addEventListener("click", toggleGameSound);
introStartButton.addEventListener("click", launchCityTerminal);

// =============================================
// START
// =============================================

setupBuildingButtons();
loadGame();
initAdventureUI();
initVfx();
initWorldUI();
initGlyphUI();
initPlayerUI();
showIntroModal();

// Small bridge used by the account module; saves still use the existing game loader.
window.LastCityGame = {
    snapshot: () => JSON.parse(JSON.stringify(game)),
    load: snapshot => {
        closeHatchReveal();
        if (mergeSelection) closePetMerge();
        currentStageView = 1;
        stageTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.stage === "1"));
        stagePanels.forEach(panel => panel.classList.toggle("active", panel.id === "stage1Panel"));
        loadGame(snapshot);
    },
    saveLocal: () => saveGame(false)
};
