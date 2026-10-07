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
    soundEnabled: true,
    ambientEnabled: false,
    effectsEnabled: true,
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
    scavenger: { name: "Scavenger Camp", baseCost: 15, output: .5, icon: "🏕️", desc: "+0.5 base Salvage/sec · starter income" },
    shelter: { name: "Crew Shelter", baseCost: 150, growth: 1.23, output: 0, icon: "🏠", desc: "+3 Population · stronger gathering and workforce" },
    workshop: { name: "Workshop", baseCost: 900, growth: 1.22, output: 8, icon: "🔧", desc: "+8 base Salvage/sec · production engine" },
    power: { name: "Power Plant", baseCost: 4500, growth: 1.65, output: 0, icon: "⚡", desc: "×1.2 building output per plant", max: 50 },
    citycenter: { name: "City Center", baseCost: 100000, growth: 1.35, output: 80, icon: "🏙️", desc: "+80 base Salvage/sec, +15 Population · build 4 to renew" }
};

const CONTRACTS = {
    firstShift: { name: "First Shift", desc: "Gather Salvage 25 times", reward: "250 Salvage", check: () => game.totalClicks >= 25, claim: () => { game.salvage += 250; } },
    campNetwork: { name: "Camp Network", desc: "Build 5 Scavenger Camps", reward: "1 Salvage Shard", check: () => game.buildings.scavenger >= 5, claim: () => { game.shards += 1; } },
    growingCity: { name: "Growing City", desc: "Earn 2,500 total Salvage", reward: "750 Salvage", check: () => game.totalSalvage >= 2500, claim: () => { game.salvage += 750; } },
    workshopCrew: { name: "Workshop Crew", desc: "Build your first Workshop", reward: "2 Salvage Shards", check: () => game.buildings.workshop >= 1, claim: () => { game.shards += 2; } }
};

const ACHIEVEMENTS = {
    handsOn: { icon: "👆", name: "Hands On", desc: "Gather Salvage 100 times", check: () => game.totalClicks >= 100 },
    settlement: { icon: "🏕️", name: "Settlement", desc: "Own 10 buildings", check: () => totalBuildings() >= 10 },
    skyline: { icon: "🏙️", name: "Skyline", desc: "Build a City Center", check: () => game.buildings.citycenter >= 1 },
    reborn: { icon: "🌅", name: "Reborn", desc: "Rebirth once", check: () => game.rebirths >= 1 },
    industrial: { icon: "🏭", name: "Industrial", desc: "Unlock The Industry", check: () => game.stage3Unlocked },
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
    networkArchitect: { icon: "🌐", name: "Connected", desc: "Unlock The Network", check: () => game.stage4Unlocked },
    ascendant: { icon: "🌌", name: "Ascendant", desc: "Unlock The Ascension", check: () => game.stage5Unlocked },
    fieldSpecialist: { icon: "🧪", name: "Upgrade Specialist", desc: "Max out a core upgrade", check: () => Object.entries(TECH_UPGRADES).some(([key, def]) => game.cityTech[key] >= def.max) },
    dedicatedBuilder: { icon: "⏱️", name: "Dedicated Builder", desc: "Play for 30 minutes", check: () => game.playTimeSeconds >= 1800 },
    citySavior: { icon: "🏆", name: "Humanity's Future", desc: "Rebuild The Last City", check: () => game.gameCompleted }
};

const TECH_UPGRADES = {
    sturdyGloves: { name: "Salvage Tool", baseCost: 40, curve: "sturdyGloves", max: 40, desc: "First +1 gather power/level, then additive %, then ×1.35/level", icon: "🧤", role: "ACTIVE" },
    salvageAccelerator: { name: "Production Drive", baseCost: 120, curve: "salvageAccelerator", max: 40, desc: "First +1 base Salvage/sec/level, then additive % and ×1.3 all Salvage", icon: "🚀", role: "PRODUCTION" },
    salvageMagnet: { name: "Auto Harvester", baseCost: 250, growth: 2, max: 5, desc: "1 automatic gather/sec per level · kept on renewal", icon: "🧲", role: "AUTOMATION" },
    dropScanner: { name: "Supply Beacon", baseCost: 400, growth: 2, max: 4, desc: "+25% supply value and 5 seconds faster recharge per level", icon: "📡", role: "SUPPLIES" }
};

// =============================================
// UPGRADE TABLES
// =============================================

const REBIRTH_UPGRADES = {
    efficient: { name: "Salvage Legacy", cost: 2, growth: 1.45, max: 20, desc: "×1.25 permanent Salvage per level" },
    headStart: { name: "Head Start", cost: 4, max: 1, desc: "Renew with 1,000 Salvage and a Camp" },
    cheapBuild: { name: "Smart Construction", cost: 3, growth: 1.7, max: 5, desc: "-10% building costs per level (up to 50%)" }
};

const STAGE2_UPGRADES = {
    scrapRate: { name: "Scrap Drive", cost: 25, curve: "scrapRate", max: 40, desc: "First +1 base Scrap/sec/level, then additive % and ×1.35/level", role: "PRODUCTION" },
    survivorSpeed: { name: "Recovery Tools", cost: 60, curve: "survivorSpeed", max: 30, desc: "First +2 base Scrap/search and faster searches, then % and ×1.4 rewards", role: "ACTIVE" },
    scrapStorage: { name: "Expedition Crew", cost: 180, max: 1, desc: "Searches sites and earns keys automatically · kept on reset", role: "AUTOMATION" },
    salvageBoost: { name: "Salvage Supply Link", cost: 60, growth: 1.5, max: 20, desc: "×1.5 Salvage per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE2_RESET_UPGRADES = {
    scrapIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "×1.25 permanent local production per level" },
    salvageBoost2: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "×1.4 permanent Salvage per level" },
    settlementLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE3_UPGRADES = {
    partRate: { name: "Parts Drive", cost: 30, curve: "partRate", max: 40, desc: "First +1 base Parts/sec/level, then additive % and ×1.35/level", role: "PRODUCTION" },
    assemblySpeed: { name: "Forge Tools", cost: 80, curve: "assemblySpeed", max: 30, desc: "First +3 base Parts profit/order and faster jobs, then % and ×1.4 rewards", role: "ACTIVE" },
    autoAssembly: { name: "Auto Assembly", cost: 250, max: 1, desc: "Funds, builds and delivers orders automatically · kept on reset", role: "AUTOMATION" },
    scrapBoost: { name: "Scrap Supply Link", cost: 90, growth: 1.5, max: 20, desc: "×1.5 Scrap per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE3_RESET_UPGRADES = {
    partIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "×1.25 permanent local production per level" },
    scrapBoost3: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "×1.4 permanent Scrap per level" },
    industryLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE4_UPGRADES = {
    circuitRate: { name: "Circuit Drive", cost: 40, curve: "circuitRate", max: 40, desc: "First +1 base Circuits/sec/level, then additive % and ×1.35/level", role: "PRODUCTION" },
    fieldPower: { name: "Field Amplifier", cost: 100, curve: "fieldPower", max: 30, desc: "First +1 base Circuit/pickup and faster spawns, then % and ×1.4 rewards", role: "ACTIVE" },
    autoNetwork: { name: "Collection Drone", cost: 350, max: 1, desc: "Collects field nodes while you browse any tab · kept on reset", role: "AUTOMATION" },
    partBoost: { name: "Parts Supply Link", cost: 120, growth: 1.5, max: 20, desc: "×1.5 Parts per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE4_RESET_UPGRADES = {
    circuitIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "×1.25 permanent local production per level" },
    partBoost4: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "×1.4 permanent Parts per level" },
    networkLegacy: { name: "Zone Legacy", cost: 12, max: 1, desc: "×2 local production permanently" }
};

const STAGE5_UPGRADES = {
    coreRate: { name: "Core Drive", cost: 45, curve: "coreRate", max: 40, desc: "First +1 base Cores/sec/level, then additive % and ×1.35/level", role: "PRODUCTION" },
    reactorFocus: { name: "Reactor Focus", cost: 150, curve: "reactorFocus", max: 30, desc: "First +1 base Core/channel, then additive % and ×1.4 manual/auto rewards", role: "ACTIVE" },
    autoCore: { name: "Auto Channel", cost: 500, max: 1, desc: "Channels Cores every 4 seconds · kept on reset", role: "AUTOMATION" },
    totalCircuit: { name: "Circuit Supply Link", cost: 180, growth: 1.5, max: 20, desc: "×1.5 Circuits per level · kept on reset", role: "PREVIOUS ZONE" }
};

const STAGE5_RESET_UPGRADES = {
    coreIncome: { name: "Production Legacy", cost: 2, growth: 1.5, max: 20, desc: "×1.25 permanent local production per level" },
    circuitBoost: { name: "Supply Legacy", cost: 3, growth: 1.6, max: 20, desc: "×1.4 permanent Circuits per level" },
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

function totalBuildings() {
    return Object.values(game.buildings).reduce((sum, count) => sum + count, 0);
}

// =============================================
// COST & PRODUCTION
// =============================================

function getBuildingCost(type) {
    const def = BUILDINGS[type];
    if (!def || (game.buildings[type] || 0) >= (def.max || 1000)) return Infinity;
    return Math.max(1, Math.ceil(def.baseCost * Math.pow(def.growth || 1.18, game.buildings[type] || 0) * Math.max(.5, 1 - game.rebirthUpgrades.cheapBuild * .1)));
}

function getBuildingBatch(type) {
    const def = BUILDINGS[type];
    if (!def) return { count: 0, total: 0, nextCost: Infinity };
    const requested = game.buyAmount === "max" ? 1000 : Math.min(1000, Math.max(0, Number(game.buyAmount || 1)));
    const owned = game.buildings[type] || 0, discount = Math.max(.5, 1 - game.rebirthUpgrades.cheapBuild * .1);
    let count = 0, total = 0, nextCost = getBuildingCost(type);
    while (count < requested && owned + count < (def.max || 1000) && Number.isFinite(nextCost) && total + nextCost <= game.salvage) {
        total += nextCost; count++;
        nextCost = Math.max(1, Math.ceil(def.baseCost * Math.pow(def.growth || 1.18, owned + count) * discount));
    }
    return { count, total, nextCost };
}

function getSalvageMultiplier(driveLevel = game.cityTech.salvageAccelerator) {
    let mult = Math.pow(1.25, game.rebirthUpgrades.efficient) * upgradeMultiplier('salvageAccelerator', driveLevel)
        * game.economy.legacyProduction * stageResetMultiplier(1) * previousStageMultiplier(1);
    mult *= (1 + game.stage2Upgrades.deepSalvage * .5) * (1 + game.stage3Upgrades.salvageBoost3 * .15)
        * (1 + game.stage4Upgrades.salvageBoost4 * .2) * (1 + game.stage5Upgrades.totalSalvage * .5)
        * (1 + game.stage3ResetUpgrades.salvageBoost3b * .75) * (1 + game.stage4ResetUpgrades.salvageBoost4b)
        * (1 + game.stage5ResetUpgrades.salvageBoost5 * 1.5);
    mult *= getCompanionMultiplier(1) * getGlyphMultiplier(1) * (1 + game.adventure.progression.beaconModules * .15);
    if (game.rebirthUpgrades.legacy) mult *= 2;
    if (game.stage5Upgrades.ascension) mult *= 2;
    if (game.stage5ResetUpgrades.lastCity) mult *= 10;
    return mult * feedbackResourceMultiplier();
}

function getPopulation() {
    return game.buildings.shelter * (3 + game.cityTech.housingBlocks) + game.economy.legacyPopulation + game.buildings.citycenter * 15;
}

function getWorkforceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return getPopulation() * 0.02 * (1 + game.cityTech.workforceTraining * 0.10) * hubBonus;
}

function getPopulationResourceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return getPopulation() * 0.0075 * (1 + game.cityTech.workforceTraining * 0.05) * hubBonus;
}

function getSalvagePerSecond(driveLevel = game.cityTech.salvageAccelerator) {
    let base = game.economy.legacyOutput + Object.entries(BUILDINGS).reduce((sum, [key, def]) => sum + (game.buildings[key] || 0) * def.output, 0);
    base *= Math.pow(1.2, game.buildings.power) * (1 + game.cityTech.campEfficiency * .1) * (1 + getWorkforceBonus());
    base += (game.cityTech.salvageMagnet + game.rebirthUpgrades.autoClicker) * getClickPower();
    base += upgradeFlatBonus('salvageAccelerator', driveLevel);
    return base * getSalvageMultiplier(driveLevel);
}

function getClickPower(toolLevel = game.cityTech.sturdyGloves) {
    const base = game.clickPower + game.rebirthUpgrades.fastHands + game.cityTech.pulseTool * 4 + Math.floor(getPopulation() / 3);
    return upgradeAmount('sturdyGloves', base, toolLevel) * Math.pow(2, game.cityTech.clickAmplifier);
}

function getMomentumBonus() {
    return game.combo * (0.02 + (game.cityTech.momentumCoil * 0.02));
}

function getSupplyDropValue() {
    const boost = feedbackResourceMultiplier();
    return Math.max(40, getSalvagePerSecond() / boost * 25) * (1 + game.cityTech.dropScanner * 0.25) * boost;
}

function getTechCost(def, level) { return economyUpgradeCost(def, level); }

function getScrapPerSecond(driveLevel = game.stage2Upgrades.scrapRate) {
    if (!game.stage2Unlocked) return 0;
    let base = upgradeAmount('scrapRate', 1 + infrastructureIncome(2), driveLevel) * infrastructureMultiplier(2) * simulatorStageMultiplier(2) * previousStageMultiplier(2);
    base *= (1 + game.stage2ResetUpgrades.survivorSpeed2 * .25) * (1 + game.stage4Upgrades.scrapBoost4 * .2) * (1 + game.stage5Upgrades.totalScrap * .5) * (1 + game.stage4ResetUpgrades.scrapBoost4b * .75) * (1 + game.stage5ResetUpgrades.scrapBoost5);
    if (game.stage2ResetUpgrades.settlementLegacy) base *= 2;
    if (game.stage5Upgrades.ascension) base *= 2;
    if (game.stage5ResetUpgrades.lastCity) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(2) * getGlyphMultiplier(2) * feedbackResourceMultiplier();
}

function getPartsPerSecond(driveLevel = game.stage3Upgrades.partRate) {
    if (!game.stage3Unlocked) return 0;
    let base = upgradeAmount('partRate', 1 + infrastructureIncome(3), driveLevel) * infrastructureMultiplier(3) * simulatorStageMultiplier(3) * previousStageMultiplier(3);
    base *= (1 + game.stage3ResetUpgrades.assemblySpeed2 * .3) * (1 + game.stage5Upgrades.totalPart * .5) * (1 + game.stage5ResetUpgrades.partBoost5 * .75);
    if (game.stage3ResetUpgrades.industryLegacy) base *= 2;
    if (game.stage5Upgrades.ascension) base *= 2;
    if (game.stage5ResetUpgrades.lastCity) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(3) * getGlyphMultiplier(3) * feedbackResourceMultiplier();
}

function getCircuitsPerSecond(driveLevel = game.stage4Upgrades.circuitRate) {
    if (!game.stage4Unlocked) return 0;
    let base = upgradeAmount('circuitRate', 1 + infrastructureIncome(4), driveLevel) * infrastructureMultiplier(4) * simulatorStageMultiplier(4) * previousStageMultiplier(4);
    if (game.stage4ResetUpgrades.networkLegacy) base *= 2;
    if (game.stage5Upgrades.ascension) base *= 2;
    if (game.stage5ResetUpgrades.lastCity) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(4) * getGlyphMultiplier(4) * feedbackResourceMultiplier();
}

function getCoresPerSecond(driveLevel = game.stage5Upgrades.coreRate) {
    if (!game.stage5Unlocked) return 0;
    let base = upgradeAmount('coreRate', 1 + infrastructureIncome(5), driveLevel) * infrastructureMultiplier(5) * simulatorStageMultiplier(5);
    if (game.stage5ResetUpgrades.ascensionLegacy) base *= 2;
    if (game.adventure.bossDefeated) base *= 2;
    if (game.stage5Upgrades.ascension) base *= 2;
    if (game.stage5ResetUpgrades.lastCity) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(5) * getGlyphMultiplier(5) * feedbackResourceMultiplier();
}

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
        showNotification("Not enough Salvage!");
        return;
    }
    game.salvage -= batch.total;
    game.buildings[type] += batch.count;
    game.totalBuildingsBuilt += batch.count;
    showNotification(`${BUILDINGS[type].name} ×${batch.count} constructed!`);
    playSfx("build");
    spawnBurst(el("buy" + type.charAt(0).toUpperCase() + type.slice(1)), "#65baff", 12);
    updateGame();
    pulseVfx(el("buy" + type.charAt(0).toUpperCase() + type.slice(1))?.closest?.(".building-card"));
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
    celebrateEvent("rebirth", "A new legacy begins", `Rebirth ${formatNumber(game.rebirths + 1)} · ×2 permanent Salvage · +${formatNumber(gained)} Shards`);
    game.shards += gained;
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
    celebrateEvent('rebirth', 'Stronger next run', '×1.5 permanent zone production · +' + reward + ' tokens');
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
    game.salvage -= cost;
    game.cityTech[key]++;
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

energyButton.addEventListener("click", function () {
    game.combo = Math.min(25, game.combo + 1);
    game.comboExpires = Date.now() + 2500;
    const isCritical = Math.random() < game.cityTech.critChance * 0.08;
    let click = getClickPower() * (1 + getMomentumBonus());
    if (isCritical) click *= 2 + (game.cityTech.critAmplifier * 0.5);
    click *= getSalvageMultiplier();
    game.salvage += click;
    game.totalSalvage += click;
    game.lifetimeSalvage += click;
    game.totalClicks++;
    if (isCritical) game.criticalClicks++;
    game.highestCombo = Math.max(game.highestCombo, game.combo);
    showFloatingGain(energyButton, `${isCritical ? "CRITICAL! " : ""}+${formatNumber(click)} ⚙️`);
    spawnBurst(energyButton, isCritical ? "#aa8cff" : "#ffc247", isCritical ? 20 : 10);
    playSfx(isCritical ? "critical" : "click");
    pulseResource(1, isCritical);
    animateVfx(energyButton, [{ transform: "scale(.97)" }, { transform: "scale(1)" }], { duration: 140 });
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
    celebrateUpgrade();
    showNotification(`Contract complete: ${contract.reward}!`);
    updateGame();
    saveGame(false);
}

rebirthButton.addEventListener("click", doRebirth);
stageResetButton.addEventListener("click", function () {
    if (currentStageView === 2) doStage2Reset();
    else if (currentStageView === 3) doStage3Reset();
    else if (currentStageView === 4) doStage4Reset();
    else if (currentStageView === 5) doStage5Reset();
});

// =============================================
// TAB SWITCHING
// =============================================

stageTabs.forEach(tab => {
    tab.addEventListener("click", function () {
        const stage = parseInt(tab.dataset.stage);
        if (!isZoneUnlocked(stage)) {
            pulseVfx(tab, "rgba(255,160,130,.55)");
            return showNotification(ZONES[stage - 1].quest);
        }
        if (stage === currentStageView) return;

        currentStageView = stage;
        game.lastStageView = stage;
        stageTabs.forEach(t => t.setAttribute("aria-pressed", String(Number(t.dataset.stage) === stage)));
        stageTabs.forEach(t => t.classList.remove("active"));
        stagePanels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        el(`stage${stage}Panel`).classList.add("active");
        updateGame();
        animateNavigation(tab);
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
    if (!gameStarted) return;
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
    salvageDisplay.textContent  = formatNumber(Math.floor(game.salvage));
    scrapDisplay.textContent    = formatNumber(Math.floor(game.scrap));
    partsDisplay.textContent    = formatNumber(Math.floor(game.parts));
    circuitsDisplay.textContent = formatNumber(Math.floor(game.circuits));
    coresDisplay.textContent    = formatNumber(Math.floor(game.cores));

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
            <small>Renewal production: ×${formatNumber(stageResetMultiplier(1))} → ×${formatNumber(stageResetMultiplier(1) * 2)}. ${resetKeepSummary(1)}. Currency resets${preservationOwned(1) ? '' : ', City upgrades reset'}${preservationOwned(1, 'buildings') ? '' : ', City buildings reset'}.</small>
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
                ? `Permanent production ×${formatNumber(stageResetMultiplier(currentStageView))} → ×${formatNumber(stageResetMultiplier(currentStageView) * 1.5)}. ${resetKeepSummary(currentStageView)}. Currency resets${preservationOwned(currentStageView) ? '' : ', production and activity tools reset'}.`
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
    else if (currentGameMode === "glyphs") hint.textContent = "Your best glyph activates automatically. Improve Luck for rarer discoveries; duplicates become Essence.";
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
    const progress = complete ? 100 : objective.progress * 100;
    title.textContent = complete ? ZONES[currentStageView].name + " — objective complete" : ZONES[currentStageView].quest;
    detail.textContent = objective.detail;
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
    const count = ready + archivedReady;
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
        .map(([key, def]) => ({ name: def.name, cost: economyUpgradeCost(def, state[key]) }));
    for (const [key,def] of Object.entries(PRESERVATION[stage])) {
        if (preservationUnlocked(stage,key) && !preservationOwned(stage,key)) choices.push({name:def.name,cost:def.cost});
    }
    for (const [key, def] of Object.entries(INFRASTRUCTURE[stage] || {})) {
        if (infrastructureLevel(key) < def.max) choices.push({ name: def.name, cost: infrastructureCost(def, infrastructureLevel(key)) });
    }
    if (stage === 1) for (const [key, def] of Object.entries(BUILDINGS)) if (Number.isFinite(getBuildingCost(key))) choices.push({ name: def.name, cost: getBuildingCost(key) });
    const next = choices.sort((a, b) => a.cost - b.cost)[0];
    const markup = next ? `<p class="eyebrow">NEXT INVESTMENT</p><strong>${next.name}</strong>${purchaseProgressMarkup(balance, next.cost)}<small>${balance >= next.cost ? "Ready for purchase" : formatNumber(next.cost - balance) + " " + ZONES[stage].label + " to go"}</small>${purchaseEtaMarkup(balance,next.cost,stage)}`
        : '<p class="eyebrow">UPGRADE STATUS</p><strong>All resource upgrades complete</strong><small>Keep building your legacy.</small>';
    if (mount.innerHTML !== markup) mount.innerHTML = markup;
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
        btn.innerHTML = `<div class="tech-icon">${def.icon}</div><small class="upgrade-role">${def.role}</small><div class="upgrade-name">${def.name}</div><div class="upgrade-desc">${def.desc}</div><div class="upgrade-effect">${maxed ? "Fully upgraded" : key === "salvageMagnet" ? level + " → " + (level + 1) + " automatic gathers/sec" : key === "dropScanner" ? (60 - level * 5) + "s → " + (55 - level * 5) + "s supply recharge" : upgradeEffectText(1, key, def, level)}</div><div class="upgrade-meta"><span>Lv ${level}/${def.max}</span><span>${maxed ? "MAXED" : formatNumber(cost) + " ⚙️"}</span></div>`;
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
    try {
        localStorage.setItem(getSaveKey(), JSON.stringify(game));
        startupSaveAvailable = true;
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
        game.lastSeen = Date.now();
        game.sessionStartedAt = Date.now();
        queueUnpresentedLore();
        updateGame();
        return;
    }
    try {
        const loaded = JSON.parse(saved);
        game = {
            ...defaultGame,
            ...loaded,
            ambientEnabled: loaded.ambientEnabled === true,
            dailyReward: normalizeDailyReward(loaded.dailyReward),
            feedback: normalizeFeedback(loaded.feedback),
            lastStageView: Number.isInteger(loaded.lastStageView) && loaded.lastStageView >= 1 && loaded.lastStageView <= 5
                ? loaded.lastStageView : [5,4,3,2,1].find(stage => stage === 1 || loaded['stage' + stage + 'Unlocked']),
            story: normalizeStory(loaded.story),
            glyphs: normalizeGlyphs(loaded.glyphs),
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
        feedbackOfflineCalculation = true;
        try { applyOfflineProgress(); } finally { feedbackOfflineCalculation = false; }
    } catch (e) {
        console.error(e);
        game = JSON.parse(JSON.stringify(defaultGame));
        startupSaveAvailable = false;
    }
    queueUnpresentedLore();
    updateGame();
    setTimeout(showOfflineModal, 500);
}

saveButton.addEventListener("click", () => saveGame(true));
function resetAllProgress() {
    if (window.LastCityCloud?.isSwitching?.()) return;
    if (!confirm("Reset EVERYTHING? This cannot be undone.")) return;
    clearFeedbackSession();
    clearLorePopupSession();
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
    switchGameMode("city");
    saveGame(false);
    showNotification("Full reset.");
}
resetButton.addEventListener("click", resetAllProgress);

// =============================================
// NOTIFICATION
// =============================================

function formatNumber(value) {
    if (Number.isNaN(value)) return "0";
    if (!Number.isFinite(value)) return value < 0 ? "−∞" : "∞";
    // Keep small values legible; use scientific notation from one million.
    if (Math.abs(value) >= 1e6) return value.toExponential(2).replace("e+", "e");
    return value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) < 1000 ? 1 : 0 });
}

function showFloatingGain(anchor, text) {
    const layer = el("fxLayer");
    if (!layer || !anchor || !canPlayVfx()) return;
    const rect = anchor.getBoundingClientRect();
    const gain = document.createElement("span");
    gain.className = "floating-gain";
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
        particle.style.setProperty("--x", `${(Math.random() - 0.5) * 150}px`);
        particle.style.setProperty("--y", `${-20 - Math.random() * 110}px`);
        particle.style.animationDelay = `${Math.random() * 80}ms`;
        if (!mountVfx(particle)) break;
    }
}

function celebrateUpgrade() {
    playSfx("upgrade");
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
    notification.textContent = msg;
    notification.classList.add("show");
    setTimeout(() => notification.classList.remove("show"), 2000);
}

function playSfx(type = "click") {
    if (!game.soundEnabled || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume();
        const notes = { click: [430, .045, "sine"], build: [300, .1, "triangle"], upgrade: [620, .14, "sine"], critical: [820, .16, "square"], dispatch: [500, .18, "triangle"] };
        const [frequency, duration, wave] = notes[type] || notes.click;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        if (type === "upgrade" || type === "dispatch") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, audioContext.currentTime + duration);
        gain.gain.setValueAtTime(.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.045, audioContext.currentTime + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
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
function closeIntroModal() {
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
    (stage === 1 ? energyButton : el('worldExploreButton'))?.focus?.({ preventScroll: true });
    showOfflineModal();
}

function toggleGameSound() {
    if (window.LastCityCloud?.isSwitching?.()) return;
    game.soundEnabled = !game.soundEnabled;
    soundButton.textContent = game.soundEnabled ? "🔊 Sound" : "🔇 Sound";
    soundButton.setAttribute("aria-pressed", String(game.soundEnabled));
    if (game.soundEnabled) playSfx("click");
    ambientAudioArmed = true;
    syncAmbientAudio(); renderStartupSettings();
    saveGame(false);
}
soundButton.addEventListener("click", toggleGameSound);
introStartButton.addEventListener("click", closeIntroModal);

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
