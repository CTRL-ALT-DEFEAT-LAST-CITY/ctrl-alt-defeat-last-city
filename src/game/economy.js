// The simulator's small set of meaningful choices and safe legacy migration.
const LEGACY_BUILDINGS = { yard: 1.5, farm: 25, factory: 180, well: .6, clinic: 3, recycler: 7, foundry: 35, market: 85, observatory: 350 };
// Levels 1–4 add tangible units, 5–10 bridge to percentages, 11+ compound.
// Prices use these fixed reference values, never the player's live earnings.
const UPGRADE_CURVES = {
    sturdyGloves: { stage: 1, base: 1, flat: 1, compound: 1.35, oldScale: 1.35, max: 40 },
    salvageAccelerator: { stage: 1, base: 1, flat: 1, compound: 1.3, oldScale: 1.3, max: 40 },
    scrapRate: { stage: 2, base: 1, flat: 1, compound: 1.35, oldScale: 1.35, max: 40 },
    survivorSpeed: { stage: 2, base: 10, flat: 2, compound: 1.4, oldScale: 1.4, max: 30 },
    partRate: { stage: 3, base: 1, flat: 1, compound: 1.35, oldScale: 1.35, max: 40 },
    assemblySpeed: { stage: 3, base: 12, flat: 3, compound: 1.4, oldScale: 1.4, max: 30 },
    circuitRate: { stage: 4, base: 1, flat: 1, compound: 1.35, oldScale: 1.35, max: 40 },
    fieldPower: { stage: 4, base: 5, flat: 1, compound: 1.4, oldScale: 1.4, max: 30 },
    coreRate: { stage: 5, base: 1, flat: 1, compound: 1.35, oldScale: 1.35, max: 40 },
    reactorFocus: { stage: 5, base: 4, flat: 1, compound: 1.4, oldScale: 1.4, max: 30 }
};
function curveLevel(key, level) { return Math.min(UPGRADE_CURVES[key].max, Math.max(0, Math.floor(Number(level) || 0))); }
function upgradeLevel(key) {
    const stage = UPGRADE_CURVES[key].stage;
    return (stage === 1 ? game.cityTech : game['stage' + stage + 'Upgrades'])[key];
}
function curveFlatBonus(key, level) { return UPGRADE_CURVES[key].flat * Math.min(4, curveLevel(key, level)); }
function upgradeFlatBonus(key, level = upgradeLevel(key)) {
    return Math.max(0, curveFlatBonus(key, level) - UPGRADE_CURVES[key].flat * game.economy.legacyFlatLevels[key]);
}
function curveMultiplier(key, level) {
    const n = curveLevel(key, level);
    return (1 + .2 * Math.min(6, Math.max(0, n - 4))) * Math.pow(UPGRADE_CURVES[key].compound, Math.max(0, n - 10));
}
function upgradeMultiplier(key, level = upgradeLevel(key)) {
    return curveMultiplier(key, level) * (game.economy.legacyUpgradeMultipliers[key] || 1);
}
function upgradeAmount(key, base, level = upgradeLevel(key)) {
    return (base + upgradeFlatBonus(key, level)) * upgradeMultiplier(key, level);
}
function upgradePhaseText(key, level) {
    if (level < 4) return 'FLAT GAINS · percentages at Lv 5';
    if (level < 10) return 'ADDITIVE · +20% of Lv 4 output · compounds at Lv 11';
    return 'COMPOUNDING · ×' + UPGRADE_CURVES[key].compound + ' each level';
}
function normalizeEconomy(saved = {}) {
    const finite = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;
    const legacyUpgradeMultipliers = Object.fromEntries(Object.keys(UPGRADE_CURVES).map(key => [key, Math.max(1, finite(saved?.legacyUpgradeMultipliers?.[key], 1))]));
    const legacyFlatLevels = Object.fromEntries(Object.keys(UPGRADE_CURVES).map(key => [key, Math.min(4, Math.floor(finite(saved?.legacyFlatLevels?.[key], 0)))]));
    return { version: 3, legacyOutput: finite(saved?.legacyOutput, 0), legacyPopulation: finite(saved?.legacyPopulation, 0), legacyProduction: Math.max(1, finite(saved?.legacyProduction, 1)), legacyUpgradeMultipliers, legacyFlatLevels };
}
function migrateEconomy(loaded) {
    if (loaded.economy?.version === 3) return normalizeEconomy(loaded.economy);
    const result = normalizeEconomy(loaded.economy?.version === 2 ? loaded.economy : {});
    if (loaded.economy?.version !== 2) {
        for (const [key, output] of Object.entries(LEGACY_BUILDINGS)) {
            const owned = loaded.buildings?.[key];
            if (Number.isFinite(owned) && owned > 0) result.legacyOutput += owned * output;
        }
        // Keep the already-paid output of older Workshop/City Center purchases.
        result.legacyOutput += Math.max(0, Number(loaded.buildings?.workshop) || 0) * 4
            + Math.max(0, Number(loaded.buildings?.citycenter) || 0) * 1120;
        result.legacyPopulation = Math.max(0, Number(loaded.buildings?.farm) || 0) * 2;
        const drive = Math.min(3, Math.max(0, Number(loaded.cityTech?.salvageAccelerator) || 0));
        result.legacyProduction = Math.pow(2 / 1.3, drive);
    }
    // Preserve old multiplicative power for any base output/population. Fixed
    // corrections belong to their paid board, don't grow on reload, and don't
    // carry into a reset that erases that board. Previously paid levels use their
    // original power, not an extra retroactive flat bonus on top of it.
    for (const [key, curve] of Object.entries(UPGRADE_CURVES)) {
        const state = curve.stage === 1 ? loaded.cityTech : loaded['stage' + curve.stage + 'Upgrades'];
        const level = curveLevel(key, state?.[key]);
        result.legacyUpgradeMultipliers[key] = Math.max(1, Math.pow(curve.oldScale, level) / curveMultiplier(key, level));
        result.legacyFlatLevels[key] = Math.min(4, level);
    }
    return result;
}
function economyUpgradeCost(def, level = 0) {
    if (UPGRADE_CURVES[def.curve]) {
        const curve = UPGRADE_CURVES[def.curve];
        const benchmark = (curve.base + curveFlatBonus(def.curve, level)) * curveMultiplier(def.curve, level) / curve.base;
        return Math.ceil((def.baseCost ?? def.cost) * benchmark);
    }
    return Math.ceil((def.baseCost ?? def.cost) * Math.pow(def.growth ?? 1.65, level));
}
function stageResetMultiplier(stage) { return Math.min(1e100, Math.pow(stage === 1 ? 2 : 1.5, stage === 1 ? game.rebirths : game['stage' + stage + 'Resets'])); }
function stageRateKey(stage) { return { 2: 'scrapRate', 3: 'partRate', 4: 'circuitRate', 5: 'coreRate' }[stage]; }
function stageAutomationOwned(stage) {
    return stage === 2 ? game.stage2Upgrades.scrapStorage > 0 || game.stage2ResetUpgrades.autoScavenge > 0
        : stage === 3 ? game.stage3Upgrades.autoAssembly > 0 || game.stage3ResetUpgrades.autoAssembly2 > 0
        : stage === 4 ? game.stage4Upgrades.autoNetwork > 0 || game.stage4ResetUpgrades.autoNetwork2 > 0 || infrastructureLevel('collectionDrone') > 0
        : stage === 5 ? game.stage5Upgrades.autoCore > 0 || game.stage5ResetUpgrades.autoAscension > 0 : game.cityTech.salvageMagnet > 0;
}
function simulatorStageMultiplier(stage) {
    const permanent = game['stage' + stage + 'ResetUpgrades'];
    const income = { 2: 'scrapIncome', 3: 'partIncome', 4: 'circuitIncome', 5: 'coreIncome' }[stage];
    return Math.pow(1.25, permanent[income]) * stageResetMultiplier(stage);
}
function previousStageMultiplier(stage) {
    const next = stage + 1;
    if (!isZoneUnlocked(next)) return 1;
    const key = { 1: 'salvageBoost', 2: 'scrapBoost', 3: 'partBoost', 4: 'totalCircuit' }[stage];
    const permanent = { 1: 'salvageBoost2', 2: 'scrapBoost3', 3: 'partBoost4', 4: 'circuitBoost' }[stage];
    return Math.pow(1.5, game['stage' + next + 'Upgrades'][key]) * Math.pow(1.4, game['stage' + next + 'ResetUpgrades'][permanent]);
}
function stageResetReward(stage) {
    const level = game['stage' + stage + 'Upgrades'][stageRateKey(stage)];
    return 3 + Math.floor(Math.max(0, level - 3) / 3);
}
function cannonCost() { return [100, 200, 400, 800][Math.min(3, Math.floor((100 - game.adventure.bossHealth) / 25))]; }
function coreChannelReward(level = game.stage5Upgrades.reactorFocus) { return upgradeAmount('reactorFocus', 4, level) * getCompanionMultiplier(5) * getGlyphMultiplier(5) * stageResetMultiplier(5) * feedbackResourceMultiplier(); }
let lastSimulatorSearch = 0, lastCoreChannel = 0;
function runSimulatorAutomation(now = Date.now()) {
    if (!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.() || el("accountModal")?.open) return;
    const a = game.adventure;
    if (game.stage2Unlocked && stageAutomationOwned(2) && now >= a.cooldownUntil && now - lastSimulatorSearch >= searchDuration()) {
        lastSimulatorSearch = now;
        const site = a.siteSearches.indexOf(Math.min(...a.siteSearches));
        // Directly use the same earned-key search action; no offline quest completion.
        zoneAction(2, 'search', site, true);
    }
    if (game.stage3Unlocked && stageAutomationOwned(3)) {
        const job = a.progression.production;
        if (job && now >= job.readyAt) handleProgressionAction(3, 'deliver', undefined, true);
        else if (!job && game.parts >= engineCost()) {
            a.assembly = [...engineRecipe().pieces];
            handleProgressionAction(3, 'assemble', undefined, true);
        }
    }
    if (game.stage5Unlocked && stageAutomationOwned(5) && now - lastCoreChannel >= 4000) {
        lastCoreChannel = now;
        grantZoneResource(5, coreChannelReward(), false);
    }
}
function outputChangeMarkup(before, after, unit) {
    if (!Number.isFinite(before) || !Number.isFinite(after)) return 'No further purchase available';
    const gain = after - before;
    const percent = before > 0 ? ' · ' + (gain >= 0 ? '+' : '') + formatNumber(gain / before * 100) + '%' : '';
    return formatNumber(before) + ' → <strong>' + formatNumber(after) + '</strong> ' + unit
        + '<small class="upgrade-gain">' + (gain >= 0 ? '+' : '') + formatNumber(gain) + ' ' + unit + percent + '</small>';
}
// Forecast on a disposable, path-cloned state. Calculators must be synchronous and
// read-only; no purchase, RNG, timers, storage or updateGame calls belong here.
function projectedPurchase(path, key, count, measure) {
    const original = game, projected = { ...original };
    let copy = projected, live = original;
    for (const part of path) { copy[part] = { ...live[part] }; copy = copy[part]; live = live[part]; }
    copy[key] = (Number(copy[key]) || 0) + count;
    try { game = projected; return measure(); }
    finally { game = original; }
}
function purchaseOutput(stage) {
    const active = stage === 1 ? getClickPower() * getSalvageMultiplier() : stage === 2 ? searchReward(1) : stage === 3 ? engineProfit() : stage === 4 ? fieldReward(false) : coreChannelReward();
    return { passive: zoneRate(stage), active, ...(stage === 1 ? { population:getPopulation(), crit:game.cityTech.critChance * 8, critPower:2 + game.cityTech.critAmplifier * .5, supply:getSupplyDropValue(), recharge:60-game.cityTech.dropScanner*5 } : {}) };
}
function purchaseForecastMarkup(stage, path, key, count = 1) {
    const before = purchaseOutput(stage), after = projectedPurchase(path,key,count,() => purchaseOutput(stage));
    const action = {1:'Salvage/gather',2:'Scrap/Train search',3:'Parts profit/new order',4:'Circuits/blue pickup',5:'Cores/channel'}[stage];
    const units = {passive:ZONES[stage].label+'/sec',active:action,population:'Population',crit:'% critical chance',critPower:'× critical payout',supply:'Salvage/supply drop',recharge:'s recharge'};
    const lines = Object.keys(before).filter(name => Number.isFinite(before[name]) && Number.isFinite(after[name]) && Math.abs(after[name]-before[name]) > 1e-10)
        .slice(0,2).map(name => outputChangeMarkup(before[name],after[name],units[name]));
    return lines.length ? '<span class="actual-output">' + lines.join('<br>') + '</span>' : '';
}
function upgradeEffectText(stage, key, def, level) {
    if (def.role === 'AUTOMATION') return level ? '✓ Automation active · kept on reset' : 'OFF → ON · kept on reset';
    if (def.role === 'PREVIOUS ZONE') {
        return purchaseForecastMarkup(stage-1,['stage'+stage+'Upgrades'],key);
    }
    if (!UPGRADE_CURVES[key]) return purchaseForecastMarkup(stage,[stage===1?'cityTech':'stage'+stage+'Upgrades'],key);
    const pair = outputChangeMarkup;
    const cadence = (before, after, unit) => pair(Math.round(60000 / before * 10) / 10, Math.round(60000 / after * 10) / 10, unit + '/min');
    let effect;
    if (def.role === 'PRODUCTION') {
        const rate = { 1: getSalvagePerSecond, 2: getScrapPerSecond, 3: getPartsPerSecond, 4: getCircuitsPerSecond, 5: getCoresPerSecond }[stage];
        effect = pair(rate(level), rate(level + 1), ZONES[stage].label + '/sec');
    } else if (stage === 1) effect = pair(getClickPower(level) * getSalvageMultiplier(), getClickPower(level + 1) * getSalvageMultiplier(), 'Salvage/gather · no crit/momentum');
    else if (stage === 2) effect = pair(searchReward(1, level), searchReward(1, level + 1), 'Scrap/Train search') + '<br>' + cadence(searchDuration(level), searchDuration(level + 1), 'searches');
    else if (stage === 3) effect = pair(engineProfit(level), engineProfit(level + 1), 'Parts profit/new order') + '<br>' + cadence(engineDuration(level), engineDuration(level + 1), 'new jobs');
    else if (stage === 4) effect = pair(fieldReward(false, level), fieldReward(false, level + 1), 'Circuits/blue pickup') + '<br>' + cadence(fieldInterval(level), fieldInterval(level + 1), 'spawns');
    else effect = pair(coreChannelReward(level), coreChannelReward(level + 1), 'Cores/channel');
    return effect + '<small class="upgrade-phase">' + upgradePhaseText(key, level) + '</small>';
}

// Earned preservation, not another row of near-identical income multipliers.
const PRESERVATION = {
    1: {
        board: { name: "City Blueprints", cost: 35000, unlock: 2, desc: "Keep every City upgrade level through city renewals." },
        buildings: { name: "Foundation Archive", cost: 180000, unlock: 3, desc: "Keep City buildings and population. Future renewals require a Salvage funding fee instead of rebuilding." }
    },
    2: { board: { name: "Depot Blueprints", cost: 800, unlock: 3, desc: "Keep Scrap Drive and Recovery Tools on Depot resets." } },
    3: { board: { name: "Foundry Blueprints", cost: 1500, unlock: 4, desc: "Keep Parts Drive and Forge Tools on Foundry resets." } },
    4: { board: { name: "Relay Blueprints", cost: 2500, unlock: 5, desc: "Keep Circuit Drive and Field Amplifier on Relay resets." } },
    5: { board: { name: "Citadel Blueprints", cost: 4000, boss: true, desc: "Keep Core Drive and Reactor Focus on Citadel resets." } }
};
function normalizePreservation(saved = {}) {
    return Object.fromEntries(Object.entries(PRESERVATION).map(([stage, choices]) => [stage, Object.fromEntries(Object.keys(choices).map(key => [key, saved?.[stage]?.[key] === true]))]));
}
function preservationOwned(stage, key = 'board') { return !!game.preservation[stage]?.[key]; }
function preservationUnlocked(stage, key) {
    const def = PRESERVATION[stage]?.[key];
    return !!def && isZoneUnlocked(stage) && (def.boss ? game.adventure.bossDefeated : isZoneUnlocked(def.unlock));
}
function buyPreservation(stage, key) {
    const def = PRESERVATION[stage]?.[key], currency = ZONES[stage]?.currency;
    if (!def || !gameStarted || currentGameMode !== 'upgrades' || currentStageView !== stage || window.LastCityCloud?.isSwitching?.()
        || el('accountModal')?.open || el('loreModal')?.open || !preservationUnlocked(stage, key) || preservationOwned(stage, key)
        || !Number.isFinite(game[currency]) || game[currency] < def.cost) return false;
    game[currency] -= def.cost; game.preservation[stage][key] = true;
    celebrateUpgrade(); showNotification(def.name + ' saved permanently.'); updateGame(); saveGame(false); return true;
}
function stageResetFee(stage) { return Math.ceil(Math.min(1e100, [0, 0, 100, 150, 250, 350][stage] * Math.pow(1.8, game['stage' + stage + 'Resets']))); }
function stageResetRequiredLevel(stage) { return Math.min(40, 3 + game['stage' + stage + 'Resets'] * 2); }
function cityRenewalFee() { return preservationOwned(1, 'buildings') ? Math.ceil(Math.min(1e100, 50000 * Math.pow(1.8, game.rebirths))) : 0; }
function cityRenewalMilestone() {
    return game.rebirths === 0 ? { ready: true, text: 'Build your first city' }
        : game.rebirths === 1 ? { ready: game.stage3Unlocked, text: 'Open Copperworks Foundry' }
        : game.rebirths === 2 ? { ready: game.stage5Unlocked, text: 'Restore the Relay and open Celestial Citadel' }
        : { ready: game.adventure.bossDefeated, text: 'Defeat the Citadel Guardian' };
}
function resetKeepSummary(stage) {
    return stage === 1 ? 'Keep glyphs, glyph research, pets, quests and Auto Harvesters' + (preservationOwned(1) ? ', City upgrades' : '') + (preservationOwned(1, 'buildings') ? ', buildings and population' : '')
        : 'Keep glyphs, research, pets, buildings, quests, automation and supply links' + (preservationOwned(stage) ? ', all board upgrades' : '');
}
function renderPreservation() {
    const panel = el('preservationPanel');
    if (!panel || currentGameMode !== 'upgrades') return;
    const stage = currentStageView, balance = game[ZONES[stage].currency];
    const choices = Object.entries(PRESERVATION[stage]);
    const signature = JSON.stringify([stage,game.preservation,choices.map(([key,def])=>[preservationUnlocked(stage,key),balance>=def.cost])]);
    const markup = '<div class="preservation-heading"><div><p class="eyebrow">PROGRESS THAT STAYS</p><h2>Preservation milestones</h2><p>Earn blueprints in later zones to reduce rebuilding. Glyphs and their research are always permanent.</p></div><span>🔑 ' + Object.values(game.preservation).reduce((sum, choices) => sum + Object.values(choices).filter(Boolean).length, 0) + '/6 archived</span></div><div class="preservation-grid">' + choices.map(([key, def]) => {
        const owned = preservationOwned(stage,key), unlocked = preservationUnlocked(stage,key);
        const requirement = def.boss ? 'Defeat the Guardian' : 'Open ' + ZONES[def.unlock].name;
        return '<article class="preservation-card ' + (owned ? 'archived' : '') + '"><small>PERMANENT · ONE-TIME</small><h3>🔑 ' + def.name + '</h3><p>' + def.desc + '</p><span>' + (owned ? '✓ Archived forever' : unlocked ? 'Milestone complete' : '🔒 ' + requirement) + '</span><div id="preserveFunding-' + key + '">' + purchaseProgressMarkup(balance,def.cost,owned) + '</div><button data-preservation="' + key + '" ' + (owned || !unlocked || balance < def.cost ? 'disabled' : '') + '>' + (owned ? 'PRESERVED' : !unlocked ? requirement : 'Archive · ' + formatNumber(def.cost) + ' ' + ZONES[stage].label) + '</button></article>';
    }).join('') + '</div>';
    if (panel.dataset.renderSignature !== signature) {
        const active = document.activeElement, key = panel.contains?.(active) ? active?.dataset?.preservation : null;
        panel.innerHTML = markup; panel.dataset.renderSignature = signature;
        if (key) panel.querySelector('[data-preservation="' + key + '"]')?.focus?.({preventScroll:true});
    }
    for (const [key,def] of choices) {
        const funding = el('preserveFunding-' + key), progress = purchaseProgressMarkup(balance,def.cost,preservationOwned(stage,key));
        const status = preservationUnlocked(stage,key) ? progress : progress.replace('Ready to buy','Milestone locked');
        if (funding && funding.innerHTML !== status) funding.innerHTML = status;
    }
}
function purchaseEtaMarkup(balance, cost, stage) {
    if (balance >= cost) return '<small class="upgrade-eta">Ready to buy</small>';
    const rate = zoneRate(stage);
    return '<small class="upgrade-eta">' + (rate > 0 ? 'Idle estimate: ' + formatDuration(Math.ceil((cost-balance)/rate)) + ' · active play is faster' : 'Gather resources to fund this upgrade') + '</small>';
}
function initPreservationUI() {
    el('preservationPanel')?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-preservation]');
        if (button && !button.disabled) buyPreservation(currentStageView, button.dataset.preservation);
    });
}
