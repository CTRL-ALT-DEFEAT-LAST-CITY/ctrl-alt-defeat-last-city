// Pinned wallet, compact navigation and a keyboard-accessible startup dialog.
let gameStarted = false;
// Presentation only: category selection never enters the city save or changes prices.
let purchaseView = 'buildings';
let playerWalletHeight = 0;
let renewalStage = 0, renewalSaveKey = '', renewalReturnFocus = null;
const PURCHASE_HELP = { buildings: 'Base descriptions explain the building; previews show gains with your current bonuses.', tools: 'Real gains include current bonuses. Gather previews exclude critical hits and momentum.', research: 'Permanent upgrades and preservation blueprints for future runs.' };
const WALLET_TOKENS = { 1: ["shards", "SHARDS"], 2: ["scrapTokens", "DEPOT TOKENS"], 3: ["partTokens", "FOUNDRY TOKENS"], 4: ["networkTokens", "RELAY TOKENS"], 5: ["ascensionTokens", "CITADEL TOKENS"] };
function renderPlayerUI() {
    const stage = currentStageView, zone = ZONES[stage], [token, label] = WALLET_TOKENS[stage];
    const glyphWallet = currentGameMode === 'glyphs';
    const values = { walletLabel: glyphWallet ? 'SALVAGE · GLYPH CURRENCY' : zone.label.toUpperCase(), walletBalance: formatNumber(game[glyphWallet ? 'salvage' : zone.currency]), walletRate: "+" + formatNumber(zoneRate(glyphWallet ? 1 : stage)) + " / sec", walletTokens: formatNumber(glyphWallet && stage > 1 ? game[zone.currency] : game[token]), walletTokenLabel: glyphWallet && stage > 1 ? zone.label.toUpperCase() : label, walletLuck: "×" + formatGlyphMultiplier(getGlyphLuck()), statGlyphLuck: "×" + formatGlyphMultiplier(getGlyphLuck()), statGlyphPower: "×" + formatGlyphMultiplier(getGlyphMultiplier(stage)), statGlyphRolls: formatNumber(Object.values(game.glyphs.zones).reduce((sum, s) => sum + s.rolls, 0)), statGlyphUnique: Object.values(game.glyphs.zones).reduce((sum, s) => sum + s.counts.filter(count => count > 0).length, 0) + " / 60", statGlyphCollected: formatNumber(Object.values(game.glyphs.zones).reduce((sum,s) => sum + s.counts.reduce((a,b)=>a+b,0),0)), statGlyphMaxed: Object.entries(game.glyphs.zones).reduce((sum,[family,s]) => sum + s.counts.filter((count,i)=>count>=glyphDefinitions(Number(family))[i].cap).length,0) + ' / 60', statPreservation: Object.values(game.preservation).reduce((sum,choices)=>sum+Object.values(choices).filter(Boolean).length,0) + ' / 6' };
    for (const [id, value] of Object.entries(values)) if (el(id) && el(id).textContent !== value) el(id).textContent = value;
    if (el("mobileGather")) el("mobileGather").hidden = !gameStarted || stage !== 1 || currentGameMode !== "city";
    if (el("mobileGatherPower")) el("mobileGatherPower").textContent = "+" + formatNumber(getClickPower() * getSalvageMultiplier());
    if (!gameStarted) renderStartupPage();
    else renderStartupSettings();
    syncAmbientAudio();
    renderFeedbackStatus();
    const walletHeight = document.querySelector('.wallet-bar')?.getBoundingClientRect?.().height;
    if (Number.isFinite(walletHeight) && walletHeight > 0 && Math.ceil(walletHeight) !== playerWalletHeight) {
        playerWalletHeight = Math.ceil(walletHeight);
        document.body.style.setProperty('--wallet-offset', playerWalletHeight + 'px');
    }
    renderPurchaseUI();
    renderRenewalPreview();
}
function scrollPlayerSection() {
    // Scroll a non-sticky anchor: a pinned header's current rect is not its page position.
    const panel = el(currentGameMode === 'upgrades' ? 'purchaseAnchor' : currentGameMode === 'city' ? 'worldBanner' : currentGameMode === "companions" ? "companionPanel" : currentGameMode === "glyphs" ? "glyphPanel" : currentGameMode === "stories" ? "storyPanel" : "statsPanel");
    panel?.scrollIntoView?.({ behavior: canPlayVfx() ? "smooth" : "auto", block: "start" });
}
function setPurchaseView(view) {
    if (!Object.hasOwn(PURCHASE_HELP, view) || window.LastCityCloud?.isSwitching?.()) return false;
    purchaseView = view;
    renderPurchaseUI();
    if (currentGameMode === 'upgrades') renderPurchaseOutlook();
    return true;
}
function renderPurchaseUI() {
    document.body.dataset.shopView = purchaseView;
    if (el('purchaseZone')) el('purchaseZone').textContent = WORLD_THEMES[currentStageView].name;
    if (el('purchaseHelp')) el('purchaseHelp').textContent = PURCHASE_HELP[purchaseView];
    document.querySelectorAll('button[data-shop-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shopView === purchaseView)));
    if (currentGameMode === 'upgrades' && currentStageView > 1) {
        const stage = currentStageView, mount = el('purchaseBuildings' + stage);
        if (mount) {
            if (mount.dataset.shopMounted !== 'yes') { mount.innerHTML = infrastructureMarkup(stage); mount.dataset.shopMounted = 'yes'; }
            // Keep button nodes stable while income ticks change funding and prices.
            for (const [key, def] of Object.entries(INFRASTRUCTURE[stage])) {
                const button = mount.querySelector('[data-choice="' + key + '"]');
                if (!button) continue;
                button.disabled = infrastructureLevel(key) >= def.max || game[ZONES[stage].currency] < infrastructureCost(def,infrastructureLevel(key));
                const markup = infrastructureContentMarkup(stage,key);
                if (button.innerHTML !== markup) button.innerHTML = markup;
            }
        }
    }
    const action = objectiveDestination();
    if (el('milestoneAction')) el('milestoneAction').textContent = action.label + ' →';
    if (currentGameMode === 'upgrades' && currentStageView === 1 && purchaseView === 'buildings') {
        for (const [key,def] of Object.entries(BUILDINGS)) {
            const mount = el('buildingPreview-' + key);
            if (!mount) continue;
            const batch = getBuildingBatch(key), count = Math.max(1,batch.count);
            const markup = (game.buildings[key] >= (def.max || 1000)) ? 'Fully upgraded' : '<small>' + (batch.count ? 'This purchase ×' + count : 'Next single build') + '</small>' + purchaseForecastMarkup(1,['buildings'],key,count);
            if (mount.innerHTML !== markup) mount.innerHTML = markup;
        }
    }
}
function focusPlayerTarget(selector) {
    const target = el('stage' + currentStageView + 'Panel')?.querySelector?.(selector) || document.querySelector(selector);
    if (!target) return;
    const focus = target.disabled ? target.closest?.('.building-card, .infrastructure-grid, .zone-content') || target.parentElement : target;
    if (!focus) return;
    document.querySelectorAll('.navigation-target').forEach(node => node.classList.remove('navigation-target'));
    target.classList?.add('navigation-target');
    if (focus !== target || !['BUTTON','A','INPUT'].includes(focus.tagName)) focus.setAttribute?.('tabindex','-1');
    target.scrollIntoView?.({ behavior: canPlayVfx() ? 'smooth' : 'auto', block: 'center' });
    focus.focus?.({preventScroll:true});
}
function openPurchase(view, selector) {
    if (!gameStarted || window.LastCityCloud?.isSwitching?.() || !setPurchaseView(view)) return false;
    switchGameMode('upgrades');
    if (selector) focusPlayerTarget(selector);
    return true;
}
function firstCityGuide() {
    if (currentStageView !== 1 || game.rebirths > 0 || game.stage2Unlocked || game.buildings.citycenter >= 4) return null;
    const steps = [
        {kind:'buildings',key:'scavenger',title:'Build your first Scavenger Camp',label:'Build first Camp',target:'#buyScavenger'},
        {kind:'tools',key:'sturdyGloves',title:'Improve your gathering tool',label:'Upgrade Salvage Tool',target:'#techUpgrades [data-economy-upgrade="sturdyGloves"]'},
        {kind:'tools',key:'salvageAccelerator',title:'Start your Production Drive',label:'Upgrade Production Drive',target:'#techUpgrades [data-economy-upgrade="salvageAccelerator"]'},
        {kind:'buildings',key:'shelter',title:'Build a Crew Shelter',label:'Build Crew Shelter',target:'#buyShelter'},
        {kind:'buildings',key:'workshop',title:'Build your first Workshop',label:'Build Workshop',target:'#buyWorkshop'}
    ];
    const step = game.adventure.progression.beaconModules === 0 ? steps.find(item => !(item.kind==='buildings'?game.buildings:game.cityTech)[item.key]) : null;
    const cost = step ? step.kind === 'buildings' ? getBuildingCost(step.key) : getTechCost(TECH_UPGRADES[step.key],game.cityTech[step.key]) : beaconCost();
    if (!step && game.adventure.progression.beaconModules >= 3) return null;
    const ready = game.salvage >= cost;
    return { title:step?.title || 'Restore beacon module ' + (game.adventure.progression.beaconModules+1) + ' of 3',
        detail:formatNumber(Math.min(game.salvage,cost)) + '/' + formatNumber(cost) + ' Salvage · ' + (ready ? 'Ready — open the highlighted action.' : 'Gather or let your production fund this step.'),
        progress:Math.min(1,Math.max(0,game.salvage/Math.max(1,cost))),
        mode:ready && step ? 'upgrades' : 'city', view:step?.kind,
        selector:ready ? step?.target || '[data-action="beacon"]' : '#energyButton',
        label:ready ? step?.label || 'Install beacon module' : 'Gather for next step' };
}
function objectiveDestination() {
    const stage = currentStageView, a = game.adventure, p = a.progression;
    const activity = (label, selector) => ({ label, mode: 'city', selector });
    const buildings = (label, selector) => ({ label, mode: 'upgrades', view: 'buildings', selector });
    if (stage < 5 && isZoneUnlocked(stage + 1)) return { label: 'Visit ' + WORLD_THEMES[stage + 1].name, mode: 'city', stage: stage + 1 };
    if (stage < 5 && zoneObjective(stage).ready) return activity('Open next zone', '[data-action="unlock"]');
    if (stage === 1) {
        const guide = firstCityGuide();
        if (guide) return guide;
        if (!game.buildings.scavenger) return buildings('Build first Camp', '#buyScavenger');
        if (p.beaconModules < 3 && (game.salvage >= beaconCost() || game.buildings.citycenter >= 4)) return activity('Restore beacon', '[data-action="beacon"]');
        return buildings('Build City Centers', '#buyCitycenter');
    }
    if (stage === 2) return infrastructureLevel('depotCamp') < 2 && a.keys >= 5 ? buildings('Build Depot Camp', '[data-choice="depotCamp"]') : activity(a.keys >= 5 ? 'Build gate fund' : 'Recover depot keys', '[data-action="search"]');
    if (stage === 3) return infrastructureLevel('assemblyLine') < 2 && a.deliveries >= 18 ? buildings('Build Assembly Line', '[data-choice="assemblyLine"]') : activity(a.deliveries >= 18 ? 'Build gate fund' : 'Complete engine orders', p.production ? '[data-action="deliver"]' : '[data-action="component"]');
    if (stage === 4) return activity(p.relayTowers >= 3 ? 'Open Citadel' : 'Collect energy & build towers', '#collectionField');
    if (a.bossDefeated) return game.gameCompleted ? { label:'View rebuilding record', mode:'stats' } : { label:'Research The Last City', mode:'upgrades', view:'research', selector:'#stage5ResetUpgrades [data-economy-upgrade="lastCity"]' };
    return activity('Reclaim the reactor', a.shields.length < 3 ? '[data-action="shield"]:not(:disabled)' : game.cores >= cannonCost() ? '[data-action="fire"]' : '[data-action="channel"]');
}
function navigateObjective() {
    if (!gameStarted || window.LastCityCloud?.isSwitching?.()) return false;
    const action = objectiveDestination();
    if (action.stage) stageTabs.find(tab => Number(tab.dataset.stage) === action.stage)?.click?.();
    if (action.mode === 'upgrades') return openPurchase(action.view,action.selector);
    switchGameMode(action.mode);
    if (action.selector) focusPlayerTarget(action.selector);
    return true;
}
function renewalSummary(stage) {
    const city = stage === 1, archivedBoard = preservationOwned(stage), archivedBuildings = city && preservationOwned(1,'buildings');
    const keep = ['Permanent glyph buffs and research', 'Pets, projects, unlocked zones and stories', 'Existing Shards/tokens and permanent upgrades', 'Preferences, daily crates and feedback reward'];
    keep.push(city ? archivedBoard ? 'All City upgrades (City Blueprints)' : 'Auto Harvesters' : archivedBoard ? 'All local board upgrades (blueprints)' : 'Automation and previous-zone supply links');
    if (!city || archivedBuildings) keep.push(city ? 'City buildings and workforce (Foundation Archive)' : 'Production buildings and City workforce');
    const reset = [city ? 'Salvage balance → ' + (game.rebirthUpgrades.headStart ? '1,000 starter Salvage' : '0') : ZONES[stage].label + ' balance → 0'];
    if (city && !archivedBuildings) reset.push('City buildings, base output and workforce' + (game.rebirthUpgrades.headStart ? ' (Head Start restores one Camp if needed)' : ''));
    if (!archivedBoard) reset.push(city ? 'City tools and non-permanent upgrades, except Auto Harvesters' : 'Local production and activity tool levels');
    if (city) reset.push('Gathering momentum and this-run Salvage total');
    if (stage === 3) reset.push('Current engine order, assembly pieces and paid input cost — finish delivery first');
    const count = city ? game.rebirths : game['stage'+stage+'Resets'], base = city ? 2 : 1.5;
    const before = stageResetMultiplier(stage), after = Math.min(1e100,Math.pow(base,count+1));
    const gain = ['Permanent ' + ZONES[stage].label + ' renewal multiplier ×' + formatNumber(before) + ' → ×' + formatNumber(after),
        '+' + (city ? calculateRebirthShards() + ' Salvage Shards' : stageResetReward(stage) + ' local reset Tokens')];
    if (city && game.rebirthUpgrades.headStart) gain.push('Head Start: 1,000 Salvage and at least one Camp');
    const fee = city ? cityRenewalFee() : stageResetFee(stage);
    const requirement = city ? '4 City Centers · ' + cityRenewalMilestone().text : getStageResetInfo(stage).rate + ' Lv ' + stageResetRequiredLevel(stage);
    return {keep,reset,gain,fee,requirement,ready:city?getRebirthRequirement().check():canStageReset(stage)};
}
function clearRenewalPreview() {
    renewalStage = 0; renewalSaveKey = ''; renewalReturnFocus = null;
    el('renewalModal')?.close();
}
function closeRenewalPreview() {
    const focus = renewalReturnFocus; clearRenewalPreview();
    if (focus?.isConnected !== false) focus?.focus?.({preventScroll:true});
}
function renderRenewalPreview() {
    if (!el('renewalModal')?.open || !renewalStage) return;
    if (window.LastCityCloud?.isSwitching?.() || renewalSaveKey !== getSaveKey()) { clearRenewalPreview(); return; }
    const summary = renewalSummary(renewalStage);
    const title = renewalStage === 1 ? 'City renewal' : WORLD_THEMES[renewalStage].name + ' reset';
    el('renewalTitle').textContent = title;
    const markup = [['You keep',summary.keep],['You reset',summary.reset],['Your next run gains',summary.gain]].map(([label,items]) => '<section><h3>' + label + '</h3><ul>' + items.map(item=>'<li>' + item + '</li>').join('') + '</ul></section>').join('');
    if (el('renewalSummary').innerHTML !== markup) el('renewalSummary').innerHTML = markup;
    el('renewalRequirement').textContent = summary.requirement + (summary.fee ? ' · Funding: '+formatNumber(game[ZONES[renewalStage].currency])+'/'+formatNumber(summary.fee)+' '+ZONES[renewalStage].label : '') + ' · ' + (summary.ready?'Ready':'Requirements not met yet');
    el('renewalConfirmButton').disabled = !summary.ready;
    el('renewalConfirmButton').textContent = 'Confirm ' + (renewalStage===1?'City renewal':'zone reset');
}
function openRenewalPreview(stage) {
    if (!gameStarted || !Number.isInteger(stage) || stage<1 || stage>5 || !isZoneUnlocked(stage) || window.LastCityCloud?.isSwitching?.()
        || ['introModal','accountModal','feedbackModal','renewalModal','loreModal','hatchModal','petMergeModal'].some(id=>el(id)?.open) || game.showOfflineModal || !!document.querySelector('.offline-modal')) return false;
    if (glyphAuto) stopGlyphAuto('Auto-roll stopped while reviewing renewal.');
    if (autoHatchSession) stopAutoHatch('Auto hatch stopped while reviewing renewal.');
    renewalStage=stage; renewalSaveKey=getSaveKey(); renewalReturnFocus=document.activeElement;
    el('renewalModal').showModal(); renderRenewalPreview();
    // Native dialog focus can scroll a tall phone layout straight to its footer.
    el('renewalModal').scrollTop=0;
    el('renewalCloseButton')?.focus?.({preventScroll:true}); return true;
}
function confirmRenewal() {
    if (!el('renewalModal')?.open || !renewalStage || !gameStarted || renewalSaveKey!==getSaveKey() || window.LastCityCloud?.isSwitching?.()) return false;
    const stage=renewalStage;
    if (!renewalSummary(stage).ready) { renderRenewalPreview(); return false; }
    clearRenewalPreview();
    if (stage===1) doRebirth(); else resetSimulatorStage(stage);
    return true;
}
function initPlayerUI() {
    document.querySelectorAll('button[data-shop-view]').forEach(button => button.addEventListener('click', () => { if (setPurchaseView(button.dataset.shopView)) scrollPlayerSection(); }));
    el('milestoneAction')?.addEventListener('click', navigateObjective);
    el('cityRenewalPreviewButton')?.addEventListener('click',()=>openRenewalPreview(1));
    el('stageRenewalPreviewButton')?.addEventListener('click',()=>openRenewalPreview(currentStageView));
    el('renewalConfirmButton')?.addEventListener('click',confirmRenewal);
    el('renewalCloseButton')?.addEventListener('click',closeRenewalPreview);
    el('renewalModal')?.addEventListener('cancel',event=>{event.preventDefault();closeRenewalPreview();});
    for (let stage=1;stage<=5;stage++) el('nextPurchase' + stage)?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-shop-link]');
        if (button) openPurchase(button.dataset.shopLink,button.dataset.shopTarget);
    });
    const badges = document.querySelector('.badge-section');
    if (badges) el('statsPanel')?.appendChild?.(badges);
    el("mobileGather")?.addEventListener("click", () => {
        if (!gameStarted || currentGameMode !== "city" || currentStageView !== 1 || window.LastCityCloud?.isSwitching?.()) return;
        el("energyButton")?.click?.();
    });
    el("introModal")?.addEventListener("cancel", event => event.preventDefault());
    initStartupUI();
    initFeedbackUI();
    initPreservationUI();
    renderPlayerUI();
}
