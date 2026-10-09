// Companion inventory, artwork and explicitly confirmed gold merges.
const PET_ATLASES = { 1: "ember", 2: "moss", 3: "clockwork", 4: "prism", 5: "astral" };
const MERGE_CHANCES = { 2: 10, 3: 25, 4: 50, 5: 75, 6: 100 };
let companionView = "eggs", inventoryScope = "zone", inventoryKind = "all";
let mergeSelection = null;
let autoHatchSession = null;
let autoHatchMessage = "Auto hatch spends this zone’s currency until stopped or funds run out.";
const AUTO_HATCH_REVEAL_PAUSE = 900, AUTO_HATCH_INTERVAL = 750;

function petInfo(id) {
    const match = typeof id === "string" && /^([1-5])-([0-4])(-gold)?$/.exec(id);
    if (!match) return null;
    const stage = Number(match[1]), rarity = Number(match[2]), gold = !!match[3];
    const [name, icon] = ZONE_PETS[stage][rarity];
    return { stage, rarity, gold, name: (gold ? "Gold " : "") + name, icon, baseId: stage + "-" + rarity };
}
function petBasePower(id) {
    const pet = petInfo(id);
    return pet ? RARITIES[pet.rarity].bonus * (pet.gold ? 1.25 : 1) : 0;
}
function petPowerText(id) { return (petBasePower(id) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
// Slots represent individual copies, even when their type IDs are identical.
function validPetSlots(stage, slots, collection) {
    const used = {}, valid = [];
    for (const id of Array.isArray(slots) ? slots : []) {
        if (valid.length >= 3) break;
        if (petInfo(id)?.stage !== Number(stage)) continue;
        const owned = Math.max(0, Math.floor(Number(collection[id]) || 0));
        if ((used[id] || 0) >= owned) continue;
        used[id] = (used[id] || 0) + 1;
        valid.push(id);
    }
    return valid;
}
function normalizePetEquipment(equipped, collection) {
    return Object.fromEntries([1, 2, 3, 4, 5].map(stage => [stage, validPetSlots(stage, equipped?.[stage], collection)]));
}
function equippedCopyCount(stage, id) { return (game.adventure.equipped[stage] || []).filter(slot => slot === id).length; }
function reconcilePetEquipment(stage) {
    game.adventure.equipped[stage] = validPetSlots(stage, game.adventure.equipped[stage], game.adventure.collection);
}
function bestPetSlots(stage) {
    const candidates = Object.entries(game.adventure.collection)
        .filter(([id, count]) => count > 0 && petInfo(id)?.stage === Number(stage))
        .sort(([a], [b]) => petBasePower(b) - petBasePower(a) || a.localeCompare(b));
    const slots = [];
    for (const [id, count] of candidates) {
        const take = Math.min(3 - slots.length, Math.floor(count));
        for (let i = 0; i < take; i++) slots.push(id);
        if (slots.length === 3) break;
    }
    return slots;
}
function applyBestPets(stage) {
    if (isZoneUnlocked(stage)) game.adventure.equipped[stage] = bestPetSlots(stage);
}
function equipBestPets(stage) {
    if (!isZoneUnlocked(stage)) return;
    applyBestPets(stage);
    updateGame();
    pulseVfx(el("companionPanel")?.querySelector(".pet-slots"));
    saveGame(false);
}
function toggleAutoEquipBest(stage) {
    if (!isZoneUnlocked(stage)) return;
    game.adventure.autoEquipBest[stage] = !game.adventure.autoEquipBest[stage];
    if (game.adventure.autoEquipBest[stage]) applyBestPets(stage);
    updateGame();
    saveGame(false);
}
function unequipPet(stage, id) {
    if (!isZoneUnlocked(stage) || petInfo(id)?.stage !== Number(stage)) return;
    const slots = game.adventure.equipped[stage] || [], index = slots.indexOf(id);
    if (index < 0) return;
    slots.splice(index, 1);
    updateGame();
    pulseVfx(el("companionPanel")?.querySelector(".pet-slots"));
    saveGame(false);
}
function petArtMarkup(id) {
    const pet = petInfo(id);
    if (!pet) return "";
    // Atlas URLs belong in the stylesheet, where their relative base is explicit.
    // A relative URL in a custom property resolves against the consuming CSS file.
    return `<span class="pet-art pet-atlas-${PET_ATLASES[pet.stage]}${pet.gold ? " gold-art" : ""}" role="img" aria-label="${pet.name}" style="--pet-x:${pet.rarity % 3 * 50}%;--pet-y:${Math.floor(pet.rarity / 3) * 100}%"></span>`;
}
function equippedPetsMarkup(stage) {
    const slots = game.adventure.equipped[stage] || [];
    return '<section class="inventory-equipped"><p class="eyebrow">EQUIPPED · THIS ZONE</p><div class="pet-slots">' +
        Array.from({ length: 3 }, (_, i) => {
            const id = slots[i], pet = petInfo(id);
            return pet ? `<button data-pet-action="unequip" data-id="${id}" title="Unequip one ${pet.name}">${petArtMarkup(id)}<strong>${pet.name}</strong><small>+${petPowerText(id)}% · Unequip 1</small></button>`
                : '<div class="pet-slot-empty"><span>＋</span><small>Empty slot</small></div>';
        }).join("") + `</div><p>×${getCompanionMultiplier(stage).toFixed(2)} ${ZONES[stage].label} power · Three copies per zone. You can equip multiple copies of the same pet.</p><div class="equipment-controls"><button data-pet-action="best">Equip Best</button><button data-pet-action="auto-best" aria-pressed="${!!game.adventure.autoEquipBest[stage]}">Auto-equip Best: ${game.adventure.autoEquipBest[stage] ? "ON" : "OFF"}</button></div><small class="equipment-hint">Equip Best fills slots with your strongest owned copies. Auto-equip refreshes after hatches and merges.</small></section>`;
}
function petInventoryMarkup(stage) {
    const entries = Object.entries(game.adventure.collection).filter(([id, count]) => {
        const pet = petInfo(id);
        return count > 0 && pet && (inventoryScope === "all" || pet.stage === stage)
            && (inventoryKind === "all" || (inventoryKind === "gold") === pet.gold);
    }).sort(([a], [b]) => petBasePower(b) - petBasePower(a));
    const total = Object.values(game.adventure.collection).reduce((sum, count) => sum + count, 0);
    return `<div class="inventory-heading"><h3>Pet inventory</h3><span>${total} pets owned</span></div><div class="inventory-filters" aria-label="Inventory filters">` +
        [["scope", "zone", "This zone"], ["scope", "all", "All zones"], ["kind", "all", "All pets"], ["kind", "normal", "Normal"], ["kind", "gold", "Gold"]].map(([filter, value, label]) =>
            `<button data-pet-action="filter" data-filter="${filter}" data-value="${value}" aria-pressed="${(filter === "scope" ? inventoryScope : inventoryKind) === value}">${label}</button>`).join("") +
        '</div><p class="activity-tip">Each equipped copy contributes its own power. Extra unequipped copies are merge materials. Gold pets have ×1.25 normal base power.</p><div class="pet-grid inventory-grid">' +
        (entries.length ? entries.map(([id, count]) => {
            const pet = petInfo(id), equipped = equippedCopyCount(pet.stage, id);
            const full = (game.adventure.equipped[pet.stage] || []).length >= 3;
            return `<article class="pet-card inventory-pet${pet.gold ? " gold-pet" : ""}${equipped ? " equipped-pet" : ""}" style="--rarity:${pet.gold ? "#ffd46a" : RARITIES[pet.rarity].color}"><span class="pet-quantity">×${count}</span>${petArtMarkup(id)}<h3>${pet.name}</h3><small>${RARITIES[pet.rarity].name}${pet.gold ? " · GOLD" : ""} · Zone ${pet.stage}</small><p>+${petPowerText(id)}% ${ZONES[pet.stage].label} per copy</p><small class="pet-copy-count">${equipped} equipped · ${count - equipped} available</small><button data-pet-action="equip" data-id="${id}" ${full || count <= equipped ? "disabled" : ""}>${count <= equipped ? "All copies equipped" : full ? "Slots full" : "Equip 1"}</button>` +
                (equipped ? `<button data-pet-action="unequip" data-id="${id}">Unequip 1</button>` : "") +
                (!pet.gold ? `<button class="pet-merge-button" data-pet-action="merge" data-id="${id}" ${count < 2 ? "disabled" : ""}>${count < 2 ? "Need 2 copies to merge" : "Merge to Gold"}</button>` : '<span class="gold-label">GOLD · ×1.25 power</span>') + '</article>';
        }).join("") : '<p class="inventory-empty">No pets match this filter. Hatch an egg to start your collection.</p>') + '</div>';
}
function eggShopMarkup(stage) {
    const zone = ZONES[stage], a = game.adventure;
    const boostTime = Math.max(0, Math.ceil(((a.boosts[stage] || 0) - Date.now()) / 1000));
    return `<div class="egg-controls"><button data-pet-action="hatch" ${activeHatch || autoHatchSession || game[zone.currency] < zone.cost ? "disabled" : ""}>Hatch · ${formatNumber(zone.cost)} ${zone.label}</button><button data-pet-action="auto-hatch" aria-pressed="${!!autoHatchSession}" ${!autoHatchSession && (activeHatch || game[zone.currency] < zone.cost) ? "disabled" : ""}>${autoHatchSession ? "■ Stop Auto Hatch" : "▶ Start Auto Hatch"}</button><button data-pet-action="boost" ${boostTime || game[zone.currency] < zone.boostCost ? "disabled" : ""}>${boostTime ? "×2 Booster · " + boostTime + "s left" : "×2 " + zone.label + " · 60s · " + zone.boostCost + " " + zone.label}</button></div><p class="auto-hatch-status">${autoHatchSession ? "Auto hatch running · " + zone.cost + " " + zone.label + " per egg" : autoHatchMessage}</p><div class="egg-odds">` +
        RARITIES.map(r => `<span style="color:${r.color}">${r.name} ${r.weight}%</span>`).join("") +
        `</div><p class="activity-tip">Guaranteed Rare or better after 9 consecutive Common/Uncommon hatches. Pity: ${a.pity[stage] || 0}/9. Guaranteed odds: Rare 68.18%, Epic 27.27%, Legendary 4.55%. The reel previews possible pets; it does not change these odds.</p><div class="pet-grid egg-pet-list">` +
        ZONE_PETS[stage].map(([name], rarity) => `<article class="pet-card" style="--rarity:${RARITIES[rarity].color}">${petArtMarkup(stage + "-" + rarity)}<h3>${name}</h3><small>${RARITIES[rarity].name} · ${RARITIES[rarity].weight}%</small><p>+${petPowerText(stage + "-" + rarity)}% ${zone.label}</p><small>${a.collection[stage + "-" + rarity] || 0} owned</small></article>`).join("") + '</div>';
}
function companionContentMarkup(stage) {
    const zone = ZONES[stage];
    return `<div class="companion-heading"><div><p class="eyebrow">ZONE ${stage} · COMPANIONS</p><h2>${companionView === "eggs" ? zone.egg : "Companion Inventory"}</h2><p>${formatNumber(game[zone.currency])} ${zone.label} available · ${game.adventure.eggsHatched} eggs hatched</p></div><span class="egg-display">🥚</span></div><nav class="companion-tabs" aria-label="Companion sections"><button data-pet-action="view" data-view="eggs" aria-pressed="${companionView === "eggs"}">Eggs & hatch odds</button><button data-pet-action="view" data-view="inventory" aria-pressed="${companionView === "inventory"}">Inventory & Gold merges</button></nav>` +
        equippedPetsMarkup(stage) + (companionView === "inventory" ? petInventoryMarkup(stage) : eggShopMarkup(stage));
}

function autoHatchContextValid(session) {
    return !!session && currentGameMode === "companions" && companionView === "eggs"
        && currentStageView === session.stage && isZoneUnlocked(session.stage) && !document.hidden && !el("loreModal")?.open;
}
function syncAutoHatchControls() {
    const button = el("hatchAutoStopButton");
    if (button) button.hidden = !autoHatchSession;
    if (activeHatch?.phase === "revealed") el("hatchSkipButton").textContent = autoHatchSession ? "Next egg" : "Continue";
}
function stopAutoHatch(message = "Auto hatch stopped.") {
    if (autoHatchSession?.timer != null) clearTimeout(autoHatchSession.timer);
    autoHatchSession = null;
    autoHatchMessage = message;
    syncAutoHatchControls();
    renderCompanions();
}
function checkAutoHatchContext() {
    if (autoHatchSession && !autoHatchContextValid(autoHatchSession)) stopAutoHatch("Auto hatch stopped: you left this egg or the game became hidden.");
}
function startAutoHatch(stage) {
    if (autoHatchSession || activeHatch || mergeSelection || !autoHatchContextValid({ stage })) return false;
    if (game[ZONES[stage].currency] < ZONES[stage].cost) {
        stopAutoHatch("Not enough " + ZONES[stage].label + " to start auto hatch.");
        return false;
    }
    const session = autoHatchSession = { stage, timer: null };
    runAutoHatch(session);
    syncAutoHatchControls();
    renderCompanions();
    return true;
}
function runAutoHatch(session) {
    if (autoHatchSession !== session) return;
    if (!autoHatchContextValid(session)) return stopAutoHatch("Auto hatch stopped: egg view is no longer active.");
    if (activeHatch || mergeSelection) return;
    const zone = ZONES[session.stage];
    if (game[zone.currency] < zone.cost) return stopAutoHatch("Auto hatch stopped: not enough " + zone.label + ".");
    hatchEgg(session.stage, { automatic: true });
    if (!activeHatch) stopAutoHatch("Auto hatch stopped: egg could not open.");
}
function scheduleAutoHatchReveal() {
    const session = autoHatchSession;
    if (!session || activeHatch?.stage !== session.stage) return;
    if (!autoHatchContextValid(session)) return stopAutoHatch("Auto hatch stopped: egg view is no longer active.");
    if (session.timer != null) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
        session.timer = null;
        advanceAutoHatch(session);
    }, AUTO_HATCH_REVEAL_PAUSE);
    syncAutoHatchControls();
}
function advanceAutoHatch(session = autoHatchSession) {
    if (!session || autoHatchSession !== session || activeHatch?.phase !== "revealed") return;
    if (!autoHatchContextValid(session)) return stopAutoHatch("Auto hatch stopped: egg view is no longer active.");
    if (session.timer != null) clearTimeout(session.timer);
    closeHatchReveal({ continueAuto: true });
    session.timer = setTimeout(() => {
        session.timer = null;
        runAutoHatch(session);
    }, AUTO_HATCH_INTERVAL);
}

function mergePets(id, amount) {
    const pet = petInfo(id), collection = game.adventure.collection;
    if (!pet || pet.gold || activeHatch || !isZoneUnlocked(pet.stage) || !Number.isInteger(amount)
        || !MERGE_CHANCES[amount] || (collection[id] || 0) < amount) return null;
    const success = amount === 6 || Math.random() * 100 < MERGE_CHANCES[amount];
    // Both outcomes consume ALL selected copies. No additional currency fee.
    collection[id] -= amount;
    if (!collection[id]) delete collection[id];
    const goldId = pet.baseId + "-gold";
    if (success) collection[goldId] = (collection[goldId] || 0) + 1;
    reconcilePetEquipment(pet.stage);
    if (game.adventure.autoEquipBest[pet.stage]) applyBestPets(pet.stage);
    game.adventure.mergesAttempted = (game.adventure.mergesAttempted || 0) + 1;
    if (success) game.adventure.goldPetsCreated = (game.adventure.goldPetsCreated || 0) + 1;
    updateGame();
    saveGame(false);
    return { success, id, goldId, amount };
}
function openPetMerge(id) {
    const pet = petInfo(id), owned = game.adventure.collection[id] || 0;
    if (!pet || pet.gold || activeHatch || mergeSelection || !isZoneUnlocked(pet.stage) || owned < 2) return;
    stopAutoHatch("Auto hatch stopped to open the merge lab.");
    mergeSelection = { id, amount: Math.min(6, owned), result: null };
    document.body.classList.add("pet-merge-open");
    renderPetMerge();
    el("petMergeModal").showModal();
    animateVfx(el("petMergeModal"), [{ opacity: .5, transform: "scale(.97)" }, { opacity: 1, transform: "scale(1)" }]);
}
function renderPetMerge() {
    if (!mergeSelection) return;
    const { id, amount, result } = mergeSelection, pet = petInfo(id), owned = game.adventure.collection[id] || 0;
    el("mergeTitle").textContent = "Gold " + ZONE_PETS[pet.stage][pet.rarity][0];
    el("mergePreview").innerHTML = petArtMarkup(id) + '<span>→</span>' + petArtMarkup(pet.baseId + "-gold");
    el("mergeChoices").innerHTML = result ? "" : [2, 3, 4, 5, 6].map(count => `<button data-merge-count="${count}" aria-pressed="${count === amount}" ${count > owned ? "disabled" : ""}>${count} pets<small>${MERGE_CHANCES[count]}%</small></button>`).join("");
    el("mergeOdds").textContent = result ? (result.success ? "Gold merge successful!" : "Merge failed") : MERGE_CHANCES[amount] + "% success chance · " + amount + " of " + owned + " copies selected";
    el("mergeWarning").textContent = result ? (result.success ? amount + " normal copies consumed. Your gold pet is in Inventory—equip it to use its power." : "All " + amount + " selected copies were lost. No gold pet was created.")
        : "WARNING: All " + amount + " selected copies will be consumed, even if the merge fails. Gold has ×1.25 normal base power. No currency fee.";
    el("mergePower").textContent = "+" + petPowerText(id) + "% → +" + petPowerText(pet.baseId + "-gold") + "% " + ZONES[pet.stage].label;
    el("mergeConfirmButton").hidden = !!result;
    el("mergeConfirmButton").textContent = "Consume " + amount + " copies · Merge " + MERGE_CHANCES[amount] + "%";
    el("mergeCloseButton").textContent = result ? "Back to inventory" : "Cancel";
}
function confirmPetMerge() {
    if (!mergeSelection || mergeSelection.result) return;
    const result = mergePets(mergeSelection.id, mergeSelection.amount);
    if (!result) return;
    mergeSelection.result = result;
    renderPetMerge();
    pulseVfx(el("mergePreview"), result.success ? "rgba(255,194,71,.7)" : "rgba(255,160,130,.5)");
    playSfx(result.success ? "upgrade" : "build");
}
function closePetMerge() {
    mergeSelection = null;
    el("petMergeModal").close();
    document.body.classList.remove("pet-merge-open");
    companionView = "inventory";
    renderCompanions();
    el("companionPanel")?.querySelector('button[data-view="inventory"]')?.focus?.();
}
function initPetUI() {
    el("hatchAutoStopButton")?.addEventListener("click", () => stopAutoHatch());
    document.addEventListener?.("visibilitychange", checkAutoHatchContext);
    el("mergeChoices")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-merge-count]");
        if (!button || button.disabled || !mergeSelection || mergeSelection.result) return;
        const count = Number(button.dataset.mergeCount);
        if (!MERGE_CHANCES[count] || count > (game.adventure.collection[mergeSelection.id] || 0)) return;
        mergeSelection.amount = count;
        renderPetMerge();
    });
    el("mergeConfirmButton")?.addEventListener("click", confirmPetMerge);
    el("mergeCloseButton")?.addEventListener("click", closePetMerge);
    el("petMergeModal")?.addEventListener("cancel", event => { event.preventDefault(); closePetMerge(); });
    el("petMergeModal")?.addEventListener("close", () => { mergeSelection = null; document.body.classList.remove("pet-merge-open"); });
}
