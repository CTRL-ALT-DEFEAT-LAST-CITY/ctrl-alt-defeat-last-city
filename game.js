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
    effectsEnabled: true,
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
        autoNetwork: 0
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
        ascension: 0
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
    scavenger:  { name: "Scavenger Camp",  baseCost: 15,     output: 0.2,  icon: "🏕️" },
    yard:       { name: "Salvage Yard",    baseCost: 120,    output: 1.5,  icon: "🏚️" },
    shelter:    { name: "Shelter",         baseCost: 700,    output: 1,    icon: "🏠" },
    workshop:   { name: "Workshop",        baseCost: 3500,   output: 12,   icon: "🔧" },
    farm:       { name: "Hydro Farm",      baseCost: 18000,  output: 25,   icon: "🌾" },
    power:      { name: "Power Plant",     baseCost: 90000,  output: 1.18, icon: "⚡" },
    factory:    { name: "Factory",         baseCost: 500000, output: 180,  icon: "🏭" },
    citycenter: { name: "City Center",     baseCost: 3000000,output: 1200, icon: "🏙️" },
    well: { name: "Water Well", baseCost: 55, output: .6, icon: "💧" },
    clinic: { name: "Community Clinic", baseCost: 420, output: 3, icon: "🏥" },
    recycler: { name: "Recycling Station", baseCost: 1800, output: 7, icon: "♻️" },
    foundry: { name: "Small Foundry", baseCost: 11000, output: 35, icon: "⚒️" },
    market: { name: "Trade Market", baseCost: 50000, output: 85, icon: "🏪" },
    observatory: { name: "Observatory", baseCost: 250000, output: 350, icon: "🔭" }
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
    fieldSpecialist: { icon: "🧪", name: "Field Specialist", desc: "Max out any Field Tech upgrade", check: () => Object.entries(TECH_UPGRADES).some(([key, def]) => game.cityTech[key] >= def.max) },
    dedicatedBuilder: { icon: "⏱️", name: "Dedicated Builder", desc: "Play for 30 minutes", check: () => game.playTimeSeconds >= 1800 },
    citySavior: { icon: "🏆", name: "Humanity's Future", desc: "Rebuild The Last City", check: () => game.gameCompleted }
};

const TECH_UPGRADES = {
    sturdyGloves: { name: "Sturdy Gloves", baseCost: 40, max: 10, desc: "+1 base click power per level", icon: "🧤" },
    pulseTool: { name: "Pulse Tool", baseCost: 140, max: 10, desc: "+4 base click power per level", icon: "🔨" },
    critChance: { name: "Critical Scanner", baseCost: 300, max: 5, desc: "+8% critical click chance per level", icon: "🎯" },
    critAmplifier: { name: "Impact Amplifier", baseCost: 750, max: 5, desc: "+0.5× critical click value per level", icon: "💥" },
    momentumCoil: { name: "Momentum Coil", baseCost: 220, max: 5, desc: "+2% click power per momentum stack", icon: "⚡" },
    campEfficiency: { name: "Camp Efficiency", baseCost: 180, max: 10, desc: "+10% building Salvage output per level", icon: "🏕️" },
    salvageMagnet: { name: "Salvage Magnet", baseCost: 500, max: 10, desc: "+0.5 Salvage/sec per level", icon: "🧲" },
    dropScanner: { name: "Drop Scanner", baseCost: 650, max: 5, desc: "+20% Supply Drop value per level", icon: "📡" },
    workforceTraining: { name: "Workforce Training", baseCost: 350, max: 10, desc: "+10% Population bonus strength per level", icon: "🧑‍🏫" },
    housingBlocks: { name: "Housing Blocks", baseCost: 800, max: 10, desc: "+1 Population from each Shelter per level", icon: "🏘️" },
    clickAmplifier: { name: "Click Amplifier", baseCost: 4500, growth: 2.25, max: 3, desc: "×2 all click rewards per level", icon: "🖱️" },
    salvageAccelerator: { name: "Salvage Accelerator", baseCost: 7200, growth: 2.4, max: 3, desc: "×2 all Salvage production per level", icon: "🚀" },
    communityHub: { name: "Community Hub", baseCost: 9000, max: 1, desc: "×1.5 Population bonuses to every resource", icon: "🏛️" }
};

// =============================================
// UPGRADE TABLES
// =============================================

const REBIRTH_UPGRADES = {
    efficient:  { name: "Efficient Salvage", cost: 2,  max: 10, desc: "+25% Salvage income" },
    fastHands:  { name: "Fast Hands",        cost: 3,  max: 10, desc: "+1 click power" },
    headStart:  { name: "Head Start",        cost: 8,  max: 1,  desc: "Start with 1,000 Salvage" },
    autoClicker:{ name: "Auto-Clicker",      cost: 10, max: 5,  desc: "Auto-click 1x/sec" },
    cheapBuild: { name: "Cheap Construction",cost: 12, max: 5,  desc: "-10% building costs" },
    legacy:     { name: "Legacy",            cost: 50, max: 1,  desc: "x2 all income" }
};

const STAGE2_UPGRADES = {
    scrapRate:     { name: "Scrap Rate",      cost: 25,    max: 20, desc: "+1 Scrap/sec" },
    salvageBoost:  { name: "Salvage Boost",   cost: 60,    max: 10, desc: "+10% Salvage gain" },
    survivorSpeed: { name: "Survivor Speed",  cost: 120,   max: 10, desc: "+25% Scrap gain" },
    scrapStorage:  { name: "Scrap Storage",   cost: 250,   max: 10, desc: "+50% max Scrap" },
    deepSalvage:   { name: "Deep Salvage",    cost: 600,   max: 5,  desc: "x1.5 Salvage multiplier" }
};

const STAGE2_RESET_UPGRADES = {
    scrapIncome:   { name: "Scrap Income +",  cost: 2,  max: 10, desc: "+25% Scrap/sec (perm)" },
    salvageBoost2: { name: "Salvage Boost +", cost: 3,  max: 10, desc: "+50% Salvage (perm)" },
    survivorSpeed2:{ name: "Survivor Speed +",cost: 5,  max: 5,  desc: "+25% Scrap (perm)" },
    scrapStorage2: { name: "Scrap Storage +", cost: 8,  max: 5,  desc: "+100% max Scrap (perm)" },
    autoScavenge:  { name: "Auto-Scavenge",   cost: 12, max: 1,  desc: "Passive Scrap gen (perm)" },
    settlementLegacy:{ name: "Settlement Legacy", cost: 25, max: 1, desc: "x2 Stage 2 output (perm)" }
};

const STAGE3_UPGRADES = {
    partRate:      { name: "Part Rate",       cost: 30,    max: 20, desc: "+1 Part/sec" },
    scrapBoost:    { name: "Scrap Boost",     cost: 180,   max: 10, desc: "+15% Scrap gain" },
    salvageBoost3: { name: "Salvage Boost",   cost: 450,   max: 10, desc: "+15% Salvage gain" },
    assemblySpeed: { name: "Assembly Speed",  cost: 1000,  max: 10, desc: "+25% Part rate" },
    autoAssembly:  { name: "Auto-Assembly",   cost: 3000,  max: 1,  desc: "Passive Part gen" }
};

const STAGE3_RESET_UPGRADES = {
    partIncome:    { name: "Part Income +",   cost: 2,  max: 10, desc: "+25% Parts/sec (perm)" },
    scrapBoost3:   { name: "Scrap Boost +",   cost: 3,  max: 10, desc: "+50% Scrap (perm)" },
    salvageBoost3b:{ name: "Salvage Boost +", cost: 5,  max: 10, desc: "+75% Salvage (perm)" },
    assemblySpeed2:{ name: "Assembly Speed +",cost: 8,  max: 5,  desc: "+30% Part rate (perm)" },
    autoAssembly2: { name: "Auto-Assembly",   cost: 12, max: 1,  desc: "Passive Part gen (perm)" },
    industryLegacy:{ name: "Industrial Legacy",cost: 30,max: 1,  desc: "x2 Stage 3 output (perm)" }
};

const STAGE4_UPGRADES = {
    circuitRate:  { name: "Circuit Rate",  cost: 60,     max: 20, desc: "+1 Circuit/sec" },
    partBoost:    { name: "Part Boost",    cost: 500,    max: 10, desc: "+20% Part gain" },
    scrapBoost4:  { name: "Scrap Boost",   cost: 1200,   max: 10, desc: "+20% Scrap gain" },
    salvageBoost4:{ name: "Salvage Boost", cost: 3000,   max: 10, desc: "+20% Salvage gain" },
    autoNetwork:  { name: "Auto-Network",  cost: 8000,   max: 1,  desc: "Passive Circuit gen" }
};

const STAGE4_RESET_UPGRADES = {
    circuitIncome:{ name: "Circuit Income +",cost: 2,  max: 10, desc: "+25% Circuits/sec (perm)" },
    partBoost4:   { name: "Part Boost +",    cost: 3,  max: 10, desc: "+50% Parts (perm)" },
    scrapBoost4b: { name: "Scrap Boost +",   cost: 5,  max: 10, desc: "+75% Scrap (perm)" },
    salvageBoost4b:{ name: "Salvage Boost +",cost: 8,  max: 10, desc: "+100% Salvage (perm)" },
    autoNetwork2: { name: "Auto-Network",    cost: 15, max: 1,  desc: "Passive Circuit gen (perm)" },
    networkLegacy:{ name: "Network Legacy",  cost: 35, max: 1,  desc: "x2 Stage 4 output (perm)" }
};

const STAGE5_UPGRADES = {
    coreRate:     { name: "Core Rate",      cost: 100,     max: 20, desc: "+1 Core/sec" },
    totalSalvage: { name: "Total Salvage",  cost: 400,     max: 10, desc: "+50% Salvage" },
    totalScrap:   { name: "Total Scrap",    cost: 1000,    max: 10, desc: "+50% Scrap" },
    totalPart:    { name: "Total Part",     cost: 2500,    max: 10, desc: "+50% Parts" },
    totalCircuit: { name: "Total Circuit",  cost: 6000,    max: 10, desc: "+50% Circuits" },
    ascension:    { name: "Ascension",      cost: 20000,   max: 1,  desc: "x2 ALL currencies" }
};

const STAGE5_RESET_UPGRADES = {
    coreIncome:    { name: "Core Income +",   cost: 2,  max: 10, desc: "+25% Cores/sec (perm)" },
    circuitBoost:  { name: "Circuit Boost +", cost: 3,  max: 10, desc: "+50% Circuits (perm)" },
    partBoost5:    { name: "Part Boost +",    cost: 5,  max: 10, desc: "+75% Parts (perm)" },
    scrapBoost5:   { name: "Scrap Boost +",   cost: 8,  max: 10, desc: "+100% Scrap (perm)" },
    salvageBoost5: { name: "Salvage Boost +", cost: 12, max: 10, desc: "+150% Salvage (perm)" },
    autoAscension: { name: "Auto-Ascension",  cost: 20, max: 1,  desc: "Passive Core gen (perm)" },
    ascensionLegacy:{ name: "Ascension Legacy",cost: 50, max: 1, desc: "x2 Stage 5 output (perm)" },
    lastCity:      { name: "The Last City",   cost: 200,max: 1,  desc: "Defeat the Guardian, then rebuild — ×10 everything" }
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
    const owned = game.buildings[type] || 0;
    const discount = 1 - (game.rebirthUpgrades.cheapBuild * 0.10);
    return Math.floor(def.baseCost * Math.pow(1.12, owned) * discount);
}

function getBuildingBatch(type) {
    const requested = game.buyAmount === "max" ? Infinity : Number(game.buyAmount || 1);
    let count = 0;
    let total = 0;
    let nextCost = getBuildingCost(type);
    while (count < requested && total + nextCost <= game.salvage) {
        total += nextCost;
        count++;
        const def = BUILDINGS[type];
        const discount = 1 - (game.rebirthUpgrades.cheapBuild * 0.10);
        nextCost = Math.floor(def.baseCost * Math.pow(1.12, game.buildings[type] + count) * discount);
    }
    return { count, total, nextCost };
}

function getSalvageMultiplier() {
    let mult = 1;
    mult *= 1 + (game.rebirthUpgrades.efficient * 0.25);
    mult *= 1 + (game.stage2Upgrades.salvageBoost * 0.10);
    mult *= 1 + (game.stage2Upgrades.deepSalvage * 0.50);
    mult *= 1 + (game.stage3Upgrades.salvageBoost3 * 0.15);
    mult *= 1 + (game.stage4Upgrades.salvageBoost4 * 0.20);
    mult *= 1 + (game.stage5Upgrades.totalSalvage * 0.50);
    mult *= 1 + (game.stage2ResetUpgrades.salvageBoost2 * 0.50);
    mult *= 1 + (game.stage3ResetUpgrades.salvageBoost3b * 0.75);
    mult *= 1 + (game.stage4ResetUpgrades.salvageBoost4b * 1.00);
    mult *= 1 + (game.stage5ResetUpgrades.salvageBoost5 * 1.50);
    mult *= Math.pow(2, game.cityTech.salvageAccelerator);
    mult *= getCompanionMultiplier(1);
    mult *= 1 + game.adventure.progression.beaconModules * .15;
    if (game.rebirthUpgrades.legacy > 0) mult *= 2;
    if (game.stage5ResetUpgrades.lastCity > 0) mult *= 10;
    return mult;
}

function getPopulation() {
    const housingBonus = game.cityTech.housingBlocks;
    return game.buildings.shelter * (1 + housingBonus)
        + game.buildings.farm * 2
        + game.buildings.citycenter * 15;
}

function getWorkforceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return getPopulation() * 0.02 * (1 + game.cityTech.workforceTraining * 0.10) * hubBonus;
}

function getPopulationResourceBonus() {
    const hubBonus = game.cityTech.communityHub > 0 ? 1.5 : 1;
    return getPopulation() * 0.0075 * (1 + game.cityTech.workforceTraining * 0.05) * hubBonus;
}

function getSalvagePerSecond() {
    let base = Object.entries(BUILDINGS).reduce((sum, [key, def]) => sum + (key === "power" || key === "shelter" ? 0 : (game.buildings[key] || 0) * def.output), 0);
    base *= Math.pow(1.18, game.buildings.power);
    base *= 1 + (game.cityTech.campEfficiency * 0.10);
    base *= 1 + getWorkforceBonus();
    base += game.cityTech.salvageMagnet * 0.5;
    return base * getSalvageMultiplier();
}

function getClickPower() {
    const base = game.clickPower + game.rebirthUpgrades.fastHands + game.cityTech.sturdyGloves + (game.cityTech.pulseTool * 4) + Math.floor(getPopulation() / 3);
    return base * Math.pow(2, game.cityTech.clickAmplifier);
}

function getMomentumBonus() {
    return game.combo * (0.02 + (game.cityTech.momentumCoil * 0.02));
}

function getSupplyDropValue() {
    return Math.max(40, getSalvagePerSecond() * 25) * (1 + game.cityTech.dropScanner * 0.20);
}

function getTechCost(def, level) {
    return Math.floor(def.baseCost * Math.pow(def.growth || 1.42, level));
}

function getScrapPerSecond() {
    if (!game.stage2Unlocked) return 0;
    // Every newly unlocked stage has a small starter trickle, avoiding a dead start.
    let base = 1 + game.stage2Upgrades.scrapRate + infrastructureIncome(2);
    base *= 1 + (game.stage2Upgrades.survivorSpeed * 0.25);
    base *= 1 + (game.stage2ResetUpgrades.scrapIncome * 0.25);
    base *= 1 + (game.stage2ResetUpgrades.survivorSpeed2 * 0.25);
    if (game.stage2ResetUpgrades.autoScavenge > 0) base += 1;
    if (game.stage2ResetUpgrades.settlementLegacy > 0) base *= 2;
    base *= 1 + (game.stage3Upgrades.scrapBoost * 0.15);
    base *= 1 + (game.stage4Upgrades.scrapBoost4 * 0.20);
    base *= 1 + (game.stage5Upgrades.totalScrap * 0.50);
    base *= 1 + (game.stage3ResetUpgrades.scrapBoost3 * 0.50);
    base *= 1 + (game.stage4ResetUpgrades.scrapBoost4b * 0.75);
    base *= 1 + (game.stage5ResetUpgrades.scrapBoost5 * 1.00);
    if (game.stage5ResetUpgrades.lastCity > 0) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(2);
}

function getPartsPerSecond() {
    if (!game.stage3Unlocked) return 0;
    let base = 1 + game.stage3Upgrades.partRate + infrastructureIncome(3);
    base *= 1 + (game.stage3Upgrades.assemblySpeed * 0.25);
    base *= 1 + (game.stage3ResetUpgrades.partIncome * 0.25);
    if (game.stage3ResetUpgrades.autoAssembly2 > 0) base += 1;
    if (game.stage3ResetUpgrades.industryLegacy > 0) base *= 2;
    base *= 1 + (game.stage4Upgrades.partBoost * 0.20);
    base *= 1 + (game.stage5Upgrades.totalPart * 0.50);
    base *= 1 + (game.stage4ResetUpgrades.partBoost4 * 0.50);
    base *= 1 + (game.stage5ResetUpgrades.partBoost5 * 0.75);
    if (game.stage5ResetUpgrades.lastCity > 0) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(3);
}

function getCircuitsPerSecond() {
    if (!game.stage4Unlocked) return 0;
    let base = 1 + game.stage4Upgrades.circuitRate + infrastructureIncome(4);
    base *= 1 + (game.stage4ResetUpgrades.circuitIncome * 0.25);
    if (game.stage4ResetUpgrades.autoNetwork2 > 0) base += 1;
    if (game.stage4ResetUpgrades.networkLegacy > 0) base *= 2;
    base *= 1 + (game.stage5Upgrades.totalCircuit * 0.50);
    base *= 1 + (game.stage5ResetUpgrades.circuitBoost * 0.50);
    if (game.stage5ResetUpgrades.lastCity > 0) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(4);
}

function getCoresPerSecond() {
    if (!game.stage5Unlocked) return 0;
    let base = 1 + game.stage5Upgrades.coreRate;
    base *= 1 + (game.stage5ResetUpgrades.coreIncome * 0.25);
    if (game.stage5ResetUpgrades.autoAscension > 0) base += 1;
    if (game.stage5ResetUpgrades.ascensionLegacy > 0) base *= 2;
    if (game.stage5Upgrades.ascension > 0) base *= 2;
    if (game.stage5ResetUpgrades.lastCity > 0) base *= 10;
    return base * (1 + getPopulationResourceBonus()) * getCompanionMultiplier(5) * (game.adventure.bossDefeated ? 2 : 1);
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
    return {
        name: "City Renewal — Build 4 City Centers",
        check: () => isWallReached(),
        display: () => `${isWallReached() ? "✅" : "🔒"} City Centers: ${formatNumber(game.buildings.citycenter)}/4 · No waiting required`
    };
}

// =============================================
// BUY BUILDING
// =============================================

function buyBuilding(type) {
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
        card.innerHTML = `<div class="building-top"><div class="building-icon">${def.icon}</div><div><h3>${def.name}</h3><p>+${def.output} Salvage/sec</p></div></div><div class="building-stats"><span>Owned <strong id="${key}Owned">0</strong></span><span>Cost <strong><span id="${key}Cost">${def.baseCost}</span> ⚙️</strong></span></div><button id="buy${suffix}" class="buy-button">Build <span><span id="${key}Cost2">${def.baseCost}</span> ⚙️</span></button>`;
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
    const req = getRebirthRequirement();

    if (!req.check()) {
        showNotification("❌ " + req.name + " — requirements not met!");
        return;
    }

    const gained = calculateRebirthShards();
    celebrateEvent("rebirth", "A new legacy begins", `Rebirth ${formatNumber(game.rebirths + 1)} · +${formatNumber(gained)} Salvage Shards`);
    game.shards += gained;
    game.rebirths++;

    // Reset Stage 1
    game.salvage = 0;
    game.buildings = Object.fromEntries(Object.keys(BUILDINGS).map(key => [key, 0]));
    game.cityTech = { sturdyGloves: 0, pulseTool: 0, critChance: 0, critAmplifier: 0, momentumCoil: 0, campEfficiency: 0, salvageMagnet: 0, dropScanner: 0, workforceTraining: 0, housingBlocks: 0, salvageAccelerator: 0, clickAmplifier: 0, communityHub: 0 };
    game.combo = 0;
    game.totalSalvage = 0;

    if (game.rebirthUpgrades.headStart > 0) game.salvage = 1000;

    showNotification(`Rebirth! +${gained} Salvage Shards.`);

    game.wallReached = false;
    updateGame();
    saveGame(false);
}

// =============================================
// STAGE RESETS
// =============================================

function doStage2Reset() {
    if (!canStageReset(2)) return showNotification("Build 3 Scrap Rate levels before resetting.");
    game.scrapTokens += 3;
    game.stage2Resets++;
    game.scrap = 0;
    game.stage2Upgrades = { scrapRate: 0, salvageBoost: 0, survivorSpeed: 0, scrapStorage: 0, deepSalvage: 0 };
    showNotification("Stage 2 Reset! +3 Settlement Tokens. Your depot keys are kept.");
    updateGame();
    saveGame(false);
}

function doStage3Reset() {
    if (!canStageReset(3)) return showNotification("Build 3 Part Rate levels before resetting.");
    game.partTokens += 3;
    game.stage3Resets++;
    game.parts = 0;
    game.stage3Upgrades = { partRate: 0, scrapBoost: 0, salvageBoost3: 0, assemblySpeed: 0, autoAssembly: 0 };
    showNotification("Stage 3 Reset! +3 Industry Tokens. Your deliveries are kept.");
    updateGame();
    saveGame(false);
}

function doStage4Reset() {
    if (!canStageReset(4)) return showNotification("Build 3 Circuit Rate levels before resetting.");
    game.networkTokens += 3;
    game.stage4Resets++;
    game.circuits = 0;
    game.stage4Upgrades = { circuitRate: 0, partBoost: 0, scrapBoost4: 0, salvageBoost4: 0, autoNetwork: 0 };
    showNotification("Stage 4 Reset! +3 Network Tokens. Your connected routes are kept.");
    updateGame();
    saveGame(false);
}

function doStage5Reset() {
    if (!canStageReset(5)) return showNotification("Build 3 Core Rate levels before resetting.");
    game.ascensionTokens += 3;
    game.stage5Resets++;
    game.cores = 0;
    game.stage5Upgrades = { coreRate: 0, totalSalvage: 0, totalScrap: 0, totalPart: 0, totalCircuit: 0, ascension: 0 };
    showNotification("Stage 5 Reset! +3 Ascension Tokens");
    updateGame();
    saveGame(false);
}

function canStageReset(stage) {
    if (!isZoneUnlocked(stage)) return false;
    const levels = { 2: game.stage2Upgrades.scrapRate, 3: game.stage3Upgrades.partRate, 4: game.stage4Upgrades.circuitRate, 5: game.stage5Upgrades.coreRate };
    return levels[stage] >= 3;
}

function getStageResetInfo(stage) {
    const resetData = {
        2: { name: "Settlement", count: game.stage2Resets, target: 3, level: game.stage2Upgrades.scrapRate, rate: "Scrap Rate", next: "Stage 3" },
        3: { name: "Industry", count: game.stage3Resets, target: 4, level: game.stage3Upgrades.partRate, rate: "Part Rate", next: "Stage 4" },
        4: { name: "Network", count: game.stage4Resets, target: 5, level: game.stage4Upgrades.circuitRate, rate: "Circuit Rate", next: "Stage 5" },
        5: { name: "Ascension", count: game.stage5Resets, target: 5, level: game.stage5Upgrades.coreRate, rate: "Core Rate", next: "permanent power" }
    };
    return resetData[stage];
}

// =============================================
// UPGRADE PURCHASES
// =============================================

function buyRebirthUpgrade(key) {
    const def = REBIRTH_UPGRADES[key];
    if (game.rebirthUpgrades[key] >= def.max) return;
    if (game.shards < def.cost) {
        showNotification("Not enough Shards!");
        return;
    }
    game.shards -= def.cost;
    game.rebirthUpgrades[key]++;
    showNotification(`${def.name} upgraded!`);
    celebrateUpgrade();
    updateGame();
    saveGame(false);
}

function buyTechUpgrade(key) {
    const def = TECH_UPGRADES[key];
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
    const def = t.up[key];
    if (t.state[key] >= def.max) return;
    if (t.cur < def.cost) {
        showNotification(`Not enough ${t.currency}!`);
        return;
    }
    if (stage === 2) game.scrap -= def.cost;
    if (stage === 3) game.parts -= def.cost;
    if (stage === 4) game.circuits -= def.cost;
    if (stage === 5) game.cores -= def.cost;
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
    const def = t.up[key];
    if (t.state[key] >= def.max) return;
    if (t.cur < def.cost) {
        showNotification(`Not enough ${t.name}!`);
        return;
    }
    if (stage === 2) game.scrapTokens -= def.cost;
    if (stage === 3) game.partTokens -= def.cost;
    if (stage === 4) game.networkTokens -= def.cost;
    if (stage === 5) game.ascensionTokens -= def.cost;
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
    game.dispatchReadyAt = now + 60000;
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
        stageTabs.forEach(t => t.classList.remove("active"));
        stagePanels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        el(`stage${stage}Panel`).classList.add("active");
        updateGame();
        animateNavigation(tab);
    });
});

gameModeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        if (currentGameMode === tab.dataset.mode) return;
        currentGameMode = tab.dataset.mode;
        document.body.classList.toggle("upgrades-open", currentGameMode === "upgrades");
        document.body.classList.toggle("stats-open", currentGameMode === "stats");
        document.body.classList.toggle("companions-open", currentGameMode === "companions");
        gameModeTabs.forEach(t => t.classList.toggle("active", t === tab));
        updateGame();
        animateNavigation(tab);
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
}

window.closeOfflineModal = closeOfflineModal;

// =============================================
// GAME LOOP
// =============================================

function gameLoop() {
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

    if (game.rebirthUpgrades.autoClicker > 0) {
        const autoGain = game.rebirthUpgrades.autoClicker * game.clickPower * getSalvageMultiplier();
        game.salvage += autoGain;
        game.totalSalvage += autoGain;
        game.lifetimeSalvage += autoGain;
    }

    if (isWallReached() && !game.wallReached) {
        game.wallReached = true;
        showNotification("🌅 CITY RENEWAL READY — Rebirth available!");
    }

    updateGame();
}

setInterval(gameLoop, 1000);
setInterval(() => saveGame(false), 5000);

// =============================================
// UPDATE UI
// =============================================

function updateGame() {
    syncVfxPreference();
    checkAutoHatchContext();
    checkAchievements();
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
        const batch = getBuildingBatch(type);

        const ownedEl = el(type + "Owned");
        if (ownedEl) ownedEl.textContent = formatNumber(owned);

        const costEl1 = el(type + "Cost");
        const costEl2 = el(type + "Cost2");
        if (costEl1) costEl1.textContent = game.buyAmount === 1 ? formatNumber(cost) : (batch.count ? formatNumber(batch.total) : formatNumber(cost));
        if (costEl2) costEl2.textContent = game.buyAmount === 1 ? formatNumber(cost) : (batch.count ? formatNumber(batch.total) : formatNumber(cost));

        const btnId = "buy" + type.charAt(0).toUpperCase() + type.slice(1);
        const btn = el(btnId);
        if (btn) {
            btn.disabled = batch.count === 0;
            btn.firstChild.textContent = game.buyAmount === "max" ? "Build MAX " : `Build ×${game.buyAmount} `;
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
        `;
    }

    // Stage reset button
    if (stageResetButton) {
        const showReset = currentGameMode === "upgrades" && currentStageView >= 2;
        const info = currentStageView >= 2 ? getStageResetInfo(currentStageView) : null;
        stageResetButton.parentElement.style.display = showReset ? "block" : "none";
        if (info) {
            stageResetButton.disabled = !canStageReset(currentStageView);
            stageResetButton.textContent = `🔄 ${info.name} Reset (+3 Tokens)`;
            el("stageResetHint").textContent = canStageReset(currentStageView)
                ? `${info.rate} milestone complete. Reset for permanent upgrades. Zone quests unlock the next stage.`
                : `Raise ${info.rate} to Lv 3 to reset (${info.level}/3).`;
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
    else if (currentGameMode === "upgrades") hint.textContent = "Gold-edged cards are ready to buy. Field Tech resets on Rebirth; Shard upgrades do not.";
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
    const shops = [
        [REBIRTH_UPGRADES, game.rebirthUpgrades, game.shards],
        [TECH_UPGRADES, game.cityTech, game.salvage],
        [STAGE2_UPGRADES, game.stage2Upgrades, game.scrap], [STAGE2_RESET_UPGRADES, game.stage2ResetUpgrades, game.scrapTokens],
        [STAGE3_UPGRADES, game.stage3Upgrades, game.parts], [STAGE3_RESET_UPGRADES, game.stage3ResetUpgrades, game.partTokens],
        [STAGE4_UPGRADES, game.stage4Upgrades, game.circuits], [STAGE4_RESET_UPGRADES, game.stage4ResetUpgrades, game.networkTokens],
        [STAGE5_UPGRADES, game.stage5Upgrades, game.cores], [STAGE5_RESET_UPGRADES, game.stage5ResetUpgrades, game.ascensionTokens]
    ];
    const ready = shops.reduce((sum, [table, state, currency]) => sum + Object.entries(table).filter(([key, def]) =>
        state[key] < def.max && currency >= (def.baseCost === undefined ? def.cost : getTechCost(def, state[key]))
        && !(key === "lastCity" && !game.adventure.bossDefeated)).length, 0);
    badge.hidden = ready === 0;
    badge.textContent = ready > 9 ? "9+" : ready;
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
        .map(([key, def]) => ({ name: def.name, cost: stage === 1 ? getTechCost(def, state[key]) : def.cost }));
    for (const [key, def] of Object.entries(INFRASTRUCTURE[stage] || {})) {
        if (infrastructureLevel(key) < def.max) choices.push({ name: def.name, cost: infrastructureCost(def, infrastructureLevel(key)) });
    }
    const next = choices.sort((a, b) => a.cost - b.cost)[0];
    const markup = next ? `<p class="eyebrow">NEXT INVESTMENT</p><strong>${next.name}</strong>${purchaseProgressMarkup(balance, next.cost)}<small>${balance >= next.cost ? "Ready for purchase" : formatNumber(next.cost - balance) + " " + ZONES[stage].label + " to go"}</small>`
        : '<p class="eyebrow">UPGRADE STATUS</p><strong>All resource upgrades complete</strong><small>Keep building your legacy.</small>';
    if (mount.innerHTML !== markup) mount.innerHTML = markup;
}

function renderRebirthUpgrades() {
    const container = el("rebirthUpgrades");
    if (!container) return;
    container.innerHTML = "";
    Object.entries(REBIRTH_UPGRADES).forEach(([key, def]) => {
        const level = game.rebirthUpgrades[key];
        const maxed = level >= def.max;
        const canAfford = game.shards >= def.cost;
        const btn = document.createElement("button");
        btn.className = "upgrade-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `
            <div class="upgrade-name">${def.name}</div>
            <div class="upgrade-desc">${def.desc}</div>
            <div class="upgrade-meta">
                <span>Lv ${level}/${def.max}</span>
                <span>${maxed ? "MAXED" : formatNumber(def.cost) + " 💎"}</span>
            </div>
        `;
        btn.innerHTML += purchaseProgressMarkup(game.shards, def.cost, maxed);
        if (!maxed) btn.onclick = () => buyRebirthUpgrade(key);
        container.appendChild(btn);
    });
}

function renderTechUpgrades() {
    const container = el("techUpgrades");
    if (!container) return;
    container.innerHTML = "";
    Object.entries(TECH_UPGRADES).forEach(([key, def]) => {
        const level = game.cityTech[key];
        const maxed = level >= def.max;
        const cost = getTechCost(def, level);
        const canAfford = game.salvage >= cost;
        const btn = document.createElement("button");
        btn.className = "upgrade-card tech-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `<div class="tech-icon">${def.icon}</div><div class="upgrade-name">${def.name}</div><div class="upgrade-desc">${def.desc}</div><div class="upgrade-meta"><span>Lv ${level}/${def.max}</span><span>${maxed ? "MAXED" : formatNumber(cost) + " ⚙️"}</span></div>`;
        btn.innerHTML += purchaseProgressMarkup(game.salvage, cost, maxed);
        if (!maxed) btn.onclick = () => buyTechUpgrade(key);
        container.appendChild(btn);
    });
}

function renderStageUpgrades(stage, table, state, currency) {
    const container = el(`stage${stage}Upgrades`);
    if (!container) return;
    container.innerHTML = "";
    const current = stage === 2 ? game.scrap : stage === 3 ? game.parts : stage === 4 ? game.circuits : game.cores;
    Object.entries(table).forEach(([key, def]) => {
        const level = state[key];
        const maxed = level >= def.max;
        const canAfford = current >= def.cost;
        const btn = document.createElement("button");
        btn.className = "upgrade-card" + (maxed ? " maxed" : "");
        btn.disabled = maxed || !canAfford;
        btn.innerHTML = `
            <div class="upgrade-name">${def.name}</div>
            <div class="upgrade-desc">${def.desc}</div>
            <div class="upgrade-meta">
                <span>Lv ${level}/${def.max}</span>
                <span>${maxed ? "MAXED" : formatNumber(def.cost) + " " + currency}</span>
            </div>
        `;
        btn.innerHTML += purchaseProgressMarkup(current, def.cost, maxed);
        if (!maxed) btn.onclick = () => buyUpgrade(stage, key);
        container.appendChild(btn);
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
        container.innerHTML = "";
        Object.entries(cfg.table).forEach(([key, def]) => {
            const level = cfg.state[key];
            const maxed = level >= def.max;
            const canAfford = cfg.tokens >= def.cost;
            const bossLocked = key === "lastCity" && !game.adventure.bossDefeated;
            const btn = document.createElement("button");
            btn.className = "upgrade-card" + (maxed ? " maxed" : "");
            btn.disabled = maxed || !canAfford || bossLocked;
            btn.innerHTML = `
                <div class="upgrade-name">${def.name}</div>
                <div class="upgrade-desc">${def.desc}</div>
                <div class="upgrade-meta">
                    <span>Lv ${level}/${def.max}</span>
                    <span>${maxed ? "MAXED" : formatNumber(def.cost) + " 🪙"}</span>
                </div>
            `;
            btn.innerHTML += purchaseProgressMarkup(cfg.tokens, def.cost, maxed, bossLocked);
            if (!maxed) btn.onclick = () => buyResetUpgrade(parseInt(stage), key);
            container.appendChild(btn);
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
}

function loadGame(snapshot) {
    if (autoHatchSession) stopAutoHatch("Auto hatch stopped when loading a save.");
    const saved = snapshot === undefined ? localStorage.getItem(getSaveKey()) : snapshot;
    if (!saved) {
        game = JSON.parse(JSON.stringify(defaultGame));
        game.lastSeen = Date.now();
        game.sessionStartedAt = Date.now();
        updateGame();
        return;
    }
    try {
        const loaded = JSON.parse(saved);
        game = {
            ...defaultGame,
            ...loaded,
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
            stage4ResetUpgrades: { ...defaultGame.stage4ResetUpgrades, ...(loaded.stage4ResetUpgrades || {}) },
            stage5Upgrades: { ...defaultGame.stage5Upgrades, ...(loaded.stage5Upgrades || {}) },
            stage5ResetUpgrades: { ...defaultGame.stage5ResetUpgrades, ...(loaded.stage5ResetUpgrades || {}) }
        };
        applyOfflineProgress();
    } catch (e) {
        console.error(e);
        game = JSON.parse(JSON.stringify(defaultGame));
    }
    updateGame();
    setTimeout(showOfflineModal, 500);
}

saveButton.addEventListener("click", () => saveGame(true));
resetButton.addEventListener("click", () => {
    if (!confirm("Reset EVERYTHING? This cannot be undone.")) return;
    if (autoHatchSession) stopAutoHatch("Auto hatch stopped by full reset.");
    localStorage.removeItem(getSaveKey());
    game = JSON.parse(JSON.stringify(defaultGame));
    game.lastSeen = Date.now();
    updateGame();
    saveGame(false);
    showNotification("Full reset.");
});

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
    if (!game.introSeen && introModal) {
        introModal.hidden = false;
        animateVfx(introModal.querySelector(".intro-card"),
            [{ opacity: .4, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]);
    }
}
function closeIntroModal() {
    if (!introModal) return;
    game.introSeen = true;
    introModal.hidden = true;
    playSfx("upgrade");
    saveGame(false);
}

soundButton.addEventListener("click", () => {
    game.soundEnabled = !game.soundEnabled;
    soundButton.textContent = game.soundEnabled ? "🔊 Sound" : "🔇 Sound";
    soundButton.setAttribute("aria-pressed", String(game.soundEnabled));
    if (game.soundEnabled) playSfx("click");
    saveGame(false);
});
introStartButton.addEventListener("click", closeIntroModal);

// =============================================
// START
// =============================================

setupBuildingButtons();
loadGame();
initAdventureUI();
initVfx();
setTimeout(showIntroModal, 600);

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
