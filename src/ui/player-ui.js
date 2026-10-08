// Pinned wallet, compact navigation and a keyboard-accessible startup dialog.
let gameStarted = false;
// Presentation only: category selection never enters the city save or changes prices.
let purchaseView = 'buildings';
let playerWalletHeight = 0;
const PURCHASE_HELP = { buildings: 'Buildings grow your passive income and workforce.', tools: 'Improve active actions, production and automation.', research: 'Permanent upgrades and preservation blueprints for future runs.' };
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
function objectiveDestination() {
    const stage = currentStageView, a = game.adventure, p = a.progression;
    const activity = (label, selector) => ({ label, mode: 'city', selector });
    const buildings = (label, selector) => ({ label, mode: 'upgrades', view: 'buildings', selector });
    if (stage < 5 && isZoneUnlocked(stage + 1)) return { label: 'Visit ' + WORLD_THEMES[stage + 1].name, mode: 'city', stage: stage + 1 };
    if (stage < 5 && zoneObjective(stage).ready) return activity('Open next zone', '[data-action="unlock"]');
    if (stage === 1) {
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
function initPlayerUI() {
    document.querySelectorAll('button[data-shop-view]').forEach(button => button.addEventListener('click', () => { if (setPurchaseView(button.dataset.shopView)) scrollPlayerSection(); }));
    el('milestoneAction')?.addEventListener('click', navigateObjective);
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
