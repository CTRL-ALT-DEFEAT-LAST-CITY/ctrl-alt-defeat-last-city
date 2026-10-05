// Pinned wallet, compact navigation and a keyboard-accessible startup dialog.
let gameStarted = false;
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
}
function scrollPlayerSection() {
    const panel = el(currentGameMode === "city" || currentGameMode === "upgrades" ? "stage" + currentStageView + "Panel" : currentGameMode === "companions" ? "companionPanel" : currentGameMode === "glyphs" ? "glyphPanel" : currentGameMode === "stories" ? "storyPanel" : "statsPanel");
    panel?.scrollIntoView?.({ behavior: canPlayVfx() ? "smooth" : "auto", block: "start" });
}
function initPlayerUI() {
    el("walletUpgradeButton")?.addEventListener("click", () => switchGameMode("upgrades"));
    el("walletGlyphButton")?.addEventListener("click", () => switchGameMode("glyphs"));
    el("mobileGather")?.addEventListener("click", () => {
        if (!gameStarted || currentGameMode !== "city" || currentStageView !== 1 || window.LastCityCloud?.isSwitching?.()) return;
        el("energyButton")?.click?.();
    });
    el("introModal")?.addEventListener("cancel", event => event.preventDefault());
    initStartupUI();
    initPreservationUI();
    renderPlayerUI();
}
