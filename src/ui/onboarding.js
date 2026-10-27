// ===============================================================
// ONBOARDING
//
// The step-by-step tutorial itself lives in src/ui/expansion.js, which
// already had a declarative engine for it; this file deliberately does not
// duplicate it. What lives here is everything around it:
//
//   1. Progressive reveal — the navigation starts at Play and City and
//      unlocks the rest as the systems behind them become usable. It reuses
//      the padlock treatment expansion.js already applies to Defense and
//      Research rather than inventing a second visual language for "later".
//   2. Locked zones — name, LOCKED, and the requirement. Nothing else.
//   3. The field guide behind the ? button, including REPLAY TUTORIAL.
//
// Nothing here changes production. It reads state and adjusts presentation.
// ===============================================================

function onboardingState() {
    if (!game.onboarding || typeof game.onboarding !== "object") {
        game.onboarding = typeof normalizeOnboarding === "function"
            ? normalizeOnboarding(null, game)
            : { version: 1, step: 0, done: false, revealed: {} };
    }
    if (!game.onboarding.revealed || typeof game.onboarding.revealed !== "object") game.onboarding.revealed = {};
    return game.onboarding;
}

// ---------------------------------------------------------------
// 1. Progressive reveal
//
// A section unlocks the moment it is worth opening, and once unlocked it is
// recorded in the save and never locks again — a renewal clears buildings,
// and it would be absurd to take Upgrades away from someone on their sixth
// city. Defense and Research are left alone: expansion.js owns those two and
// already gates them on its own conditions.
// ---------------------------------------------------------------
const REVEAL_RULES = {
    // Buildings are bought here, so this opens as soon as there is anything
    // to spend. Gating it behind owning a camp would lock the player out of
    // the only place a camp can be bought.
    upgrades: {
        test: () => game.totalSalvage >= 10 || game.buildings.scavenger >= 1,
        reason: "Gather 10 Salvage to open Upgrades."
    },
    stats: {
        test: () => game.buildings.scavenger >= 1 || game.totalSalvage >= 50,
        reason: "Build your first Scavenger Camp to open Stats."
    },
    stories: {
        test: () => game.totalSalvage >= 2500 || game.rebirths >= 1 || game.stage2Unlocked === true,
        reason: "Earn 2,500 total Salvage to start receiving transmissions."
    },
    glyphs: {
        test: () => game.rebirths >= 1 || game.stage2Unlocked === true ||
            Object.values(game.glyphs?.zones || {}).some(zone => zone.rolls > 0),
        reason: "Complete your first renewal to unlock Glyphs."
    },
    companions: {
        test: () => game.rebirths >= 1 || game.stage2Unlocked === true ||
            Object.keys(game.adventure?.collection || {}).length > 0,
        reason: "Complete your first renewal to unlock Companions."
    }
};

function sectionRevealed(mode) {
    const rule = REVEAL_RULES[mode];
    if (!rule) return true;
    const state = onboardingState();
    if (state.revealed[mode]) return true;
    let open = false;
    try { open = !!rule.test(); } catch (_) { open = true; }
    if (open) state.revealed[mode] = true;
    return open;
}

function sectionLockReason(mode) {
    return REVEAL_RULES[mode]?.reason || "Keep playing to unlock this section.";
}

function updateProgressiveReveal() {
    document.querySelectorAll(".game-mode-tab").forEach(tab => {
        const mode = tab.dataset.mode;
        if (!mode || !REVEAL_RULES[mode]) return;
        // Never lock the section the player is standing in.
        const open = mode === currentGameMode || sectionRevealed(mode);
        tab.classList.toggle("locked", !open);
        tab.setAttribute("aria-disabled", String(!open));
        const title = open ? "" : sectionLockReason(mode);
        if (tab.title !== title) tab.title = title;
    });
}

// Locked zones advertise a name, the word LOCKED (added in CSS) and the
// requirement to open them. No resources, buildings or mechanics.
function updateLockedStageTabs() {
    document.querySelectorAll(".stage-tab").forEach(tab => {
        const stage = Number(tab.dataset.stage);
        if (!Number.isInteger(stage)) return;
        const locked = !isZoneUnlocked(stage);
        const label = (tab.textContent || "").trim();
        const requirement = locked && ZONES[stage - 1] ? ZONES[stage - 1].quest : "";
        const title = locked ? "Locked — " + requirement : (ZONES[stage]?.name || label);
        if (tab.title !== title) tab.title = title;
        const aria = locked ? label + ", locked. " + requirement : label;
        if (tab.getAttribute("aria-label") !== aria) tab.setAttribute("aria-label", aria);
    });
}

// A locked zone opens a clean requirements panel: the zone name, the word
// LOCKED, and a tick-list of exactly what opens it. No resources, buildings
// or mechanics of the locked zone are shown.
function showLockedZonePanel(stage) {
    const existing = document.getElementById("lockedZoneModal");
    if (existing) { existing.close?.(); existing.remove(); }
    const name = (ZONE_NAMES[stage] || "Zone " + stage).toUpperCase();
    let items = [];
    try { items = zoneRequirements(stage - 1) || []; } catch (_) { items = []; }
    const rows = items.map(item => {
        const done = item.have >= item.need;
        const have = item.format && typeof formatNumber === "function" ? formatNumber(item.have) : Math.floor(item.have);
        return '<li class="' + (done ? "req-done" : "req-todo") + '">' +
               '<span class="req-mark" aria-hidden="true">' + (done ? "\u2713" : "\u2717") + '</span>' +
               '<span class="req-label">' + item.label + '</span>' +
               '<span class="req-count">' + have + " / " + item.need + '</span></li>';
    }).join("");
    const dialog = document.createElement("dialog");
    dialog.id = "lockedZoneModal";
    dialog.className = "locked-zone-modal";
    dialog.setAttribute("aria-labelledby", "lockedZoneTitle");
    dialog.innerHTML =
        '<div class="locked-zone-shell">' +
          '<p class="eyebrow">ZONE 0' + stage + '</p>' +
          '<h2 id="lockedZoneTitle">' + name + '</h2>' +
          '<p class="locked-zone-state">LOCKED</p>' +
          '<p class="locked-zone-intro">Requirements</p>' +
          '<ul class="locked-zone-reqs">' + (rows || "<li>Complete the current zone.</li>") + '</ul>' +
          '<button type="button" id="lockedZoneClose" class="recovery-primary">Back to ' +
            (ZONE_NAMES[currentStageView] || "the city") + '</button>' +
        '</div>';
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    document.getElementById("lockedZoneClose")?.addEventListener("click", () => dialog.close());
    try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
    document.getElementById("lockedZoneClose")?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------
// 2. Cross-zone benefits, stated plainly
//
// The supply links and renewal legacies already existed in the economy; what
// they never had was a place that says so. Without this, opening the Depot
// looks like it replaces Ashfall rather than feeding it.
// ---------------------------------------------------------------
const ZONE_NAMES = { 1: "Ashfall", 2: "Depot", 3: "Foundry", 4: "Relay", 5: "Citadel" };

// The link runs from the NEXT zone back into this one, and it is the Supply
// Link upgrade bought over there that carries it — unlocking a zone alone
// does nothing. Saying so is the whole point of this panel.
const SUPPLY_LINK_KEYS = {
    1: { live: "salvageBoost", kept: "salvageBoost2", name: "Salvage Supply Link" },
    2: { live: "scrapBoost",   kept: "scrapBoost3",   name: "Scrap Supply Link" },
    3: { live: "partBoost",    kept: "partBoost4",    name: "Parts Supply Link" },
    4: { live: "totalCircuit", kept: "circuitBoost",  name: "Circuit Supply Link" }
};

// CIVILISATION BONUSES
//
// Every value here is read from the live economy - STAGE_SYNERGY for the zone
// bonuses, previousStageMultiplier for the supply link, renewalGroup for
// renewals. There is no display-only number anywhere in this panel, so it can
// never tell the player something the economy does not actually pay.
function supplyNetworkRows() {
    const stage = currentStageView;
    const rows = [];
    for (const key of Object.keys(STAGE_SYNERGY)) {
        const zone = Number(key);
        const def = STAGE_SYNERGY[zone];
        if (!(def.scope === "all" || zone > stage)) continue;
        const open = isZoneUnlocked(zone);
        const extras = [];
        if (def.buildCost) extras.push("\u2212" + Math.round(def.buildCost * 100) + "% build costs");
        if (def.automation) extras.push("+" + Math.round(def.automation * 100) + "% harvesters");
        const value = "+" + Math.round(def.production * 100) + "% " +
            (def.scope === "all" ? "all zones" : "earlier zones") +
            (extras.length ? " \u00b7 " + extras.join(" \u00b7 ") : "");
        rows.push([(open ? "\u2713 " : "\u25cb ") + ZONE_NAMES[zone] + (open ? " restored" : ""),
                   open ? value : "Restore " + ZONE_NAMES[zone] + " to unlock"]);
    }
    if (!rows.length) rows.push(["\u2713 Every zone restored", "nothing further feeds this one"]);
    rows.push(["Total from restored zones", "+" + Math.round(stageSynergyBonus(stage) * 100) + "%"]);

    const link = SUPPLY_LINK_KEYS[stage];
    if (link) {
        const next = stage + 1;
        if (isZoneUnlocked(next)) {
            const live = Math.max(0, Number(game["stage" + next + "Upgrades"][link.live]) || 0);
            const kept = Math.max(0, Number(game["stage" + next + "ResetUpgrades"][link.kept]) || 0);
            rows.push([link.name + " \u00b7 bought in " + ZONE_NAMES[next], "Lv " + live + " \u00b7 +" + Math.round(live * 12) + "%"]);
            rows.push(["Supply Legacy \u00b7 kept on reset", "Lv " + kept + " \u00b7 +" + Math.round(kept * 15) + "%"]);
            if (live === 0 && kept === 0) rows.push(["\u2192 Next step", "Buy " + link.name + " in " + ZONE_NAMES[next]]);
        } else {
            rows.push(["\u2192 Next step", "Restore " + ZONE_NAMES[next] + " to supply " + ZONE_NAMES[stage]]);
        }
    }
    const renewals = stage === 1 ? game.rebirths : (Number(game["stage" + stage + "Resets"]) || 0);
    rows.push([stage === 1 ? "City renewals here" : "Zone resets here",
               renewals + " \u00b7 \u00d7" + renewalGroup(stage).toFixed(2)]);
    rows.push(["All civilisation bonuses", "\u00d7" + synergyGroup(stage).toFixed(2)]);
    return rows;
}

function renderSupplyNetwork() {
    const mount = document.getElementById("supplyNetworkLines");
    if (!mount) return;
    let rows;
    try { rows = supplyNetworkRows(); } catch (_) { return; }
    const markup = rows.map(([label, value]) =>
        "<div><span>" + label + "</span><strong>" + value + "</strong></div>").join("");
    if (mount.innerHTML !== markup) mount.innerHTML = markup;
}

// ---------------------------------------------------------------
// 3. The field guide
// ---------------------------------------------------------------
const GUIDE_LOCKED_TEXT = "Unlock this system to learn more.";

const GUIDE_SECTIONS = [
    { id: "start", title: "Getting Started", open: () => true,
      body: "<p>Press <strong>GATHER SALVAGE</strong> to collect material by hand. Spend it in <strong>City</strong> " +
            "on a Scavenger Camp, which then produces Salvage on its own. Repeat that loop \u2014 gather, build, " +
            "automate \u2014 and the city starts carrying itself.</p>" +
            "<p>The getting-started guide at the top of the Play tab walks you through the first steps. " +
            "Hide it whenever you like and bring it back with <strong>Replay tutorial</strong> below.</p>" },

    { id: "resources", title: "Resources", open: () => true,
      body: "<p><strong>Salvage</strong> is Ashfall's currency and pays for everything in this zone. " +
            "Later zones each have their own: Scrap, Parts, Circuits, Cores.</p>" +
            "<p><strong>Salvage Shards</strong> come from contracts and buy permanent research.</p>" +
            "<p>Large numbers read as K, M, B and T \u2014 1.2K is 1,200, 4.2B is 4.2 billion.</p>" },

    { id: "city", title: "City", open: () => true,
      body: "<p>The City tab is the map. Buildings you buy arrive in the build tray and you place them on " +
            "lit plots. A building only works once it is standing, staffed and supplied.</p>" },

    { id: "buildings", title: "Buildings", open: () => true,
      body: "<p><strong>Scavenger Camp</strong> \u2014 cheap starter income, up to 30 of them.</p>" +
            "<p><strong>Crew Shelter</strong> \u2014 adds Population, which raises production across every zone.</p>" +
            "<p><strong>Workshop</strong> \u2014 the mid-game engine, and the building most of your income " +
            "will come from.</p>" +
            "<p><strong>Power Plant</strong> \u2014 multiplies the output of every other building, up to 25.</p>" +
            "<p><strong>City Center</strong> \u2014 large production and Population. Four of them, plus the three " +
            "beacon modules, complete Ashfall.</p>" },

    { id: "power", title: "Power", open: () => true,
      body: "<p>Buildings draw Power to run. Generators supply it. Run short and production drops until " +
            "you cover the gap, so build generation slightly ahead of demand rather than exactly to it.</p>" +
            "<p>Power Plants in the buy list are separate: they multiply what every building produces.</p>" },

    { id: "food", title: "Food", open: () => true,
      body: "<p>Survivors eat. Hydro Farms and greenhouses feed them. A food shortage quietly cuts morale " +
            "and job output before anything on screen turns red, so it is worth watching the strip above " +
            "the city rather than waiting for a warning.</p>" },

    { id: "workers", title: "Workers", open: () => true,
      body: "<p>Population comes from Crew Shelters and City Centers. Survivors fill jobs in the City tab, " +
            "and an unstaffed building still costs upkeep while producing less.</p>" +
            "<p>Population also raises production in every zone you have opened, which is why shelters stay " +
            "worth building long after the early game.</p>" },

    { id: "upgrades", title: "Upgrades", open: () => sectionRevealed("upgrades"),
      locked: GUIDE_LOCKED_TEXT,
      body: "<p>Permanent for the current run. Levels 1\u20134 add flat amounts, 5\u201310 add percentages, " +
            "and from level 11 each level compounds \u2014 so does the price, faster.</p>" +
            "<p><strong>Salvage Tool</strong> improves what you gather by hand. " +
            "<strong>Production Drive</strong> improves everything the city produces. " +
            "<strong>Auto Harvester</strong> gathers for you at a fraction of your own gather power.</p>" },

    { id: "research", title: "Research", open: () => game.shards >= 1 || game.buildings.workshop >= 1,
      locked: GUIDE_LOCKED_TEXT,
      body: "<p>Bought with Salvage Shards and <strong>kept through renewal</strong>. It is the one place " +
            "where spending is never undone, so there is no reason to hoard Shards.</p>" +
            "<p>A Research Lab in the city opens the full research tree.</p>" },

    { id: "stages", title: "Stages", open: () => true,
      body: "<p>Five zones: <strong>Ashfall, Depot, Foundry, Relay, Citadel</strong>, each with its own " +
            "currency, buildings and objective.</p>" +
            "<p>Opening a zone does not retire the ones before it. Every zone you hold pays a permanent " +
            "bonus back down the chain:</p>" +
            "<ul><li><strong>Depot</strong> \u2014 +10% production to every earlier zone</li>" +
            "<li><strong>Foundry</strong> \u2014 +12% production to earlier zones, \u22125% building costs</li>" +
            "<li><strong>Relay</strong> \u2014 +15% production to earlier zones, +50% Auto Harvester output</li>" +
            "<li><strong>Citadel</strong> \u2014 +20% production to <em>every</em> zone</li></ul>" +
            "<p>On top of that, the Supply Link upgrade bought in a zone feeds the zone before it. " +
            "Stats \u2192 Supply network shows exactly what you are receiving and what to buy next.</p>" },

    { id: "renewal", title: "Rebirth / Renewal", open: () => game.buildings.citycenter >= 1 || game.rebirths >= 1,
      locked: GUIDE_LOCKED_TEXT,
      body: "<p>Renewal clears the zone's buildings and upgrades and grants a permanent production bonus: " +
            "<strong>+50%</strong> per City renewal, <strong>+35%</strong> per later-zone reset.</p>" +
            "<p>The bonus is linear on purpose. Your tenth renewal is worth exactly what your first was, " +
            "so the numbers stay readable however long you play.</p>" +
            "<p>Research, Glyphs, Companions, achievements and every zone you have opened are all kept.</p>" },

    { id: "glyphs", title: "Glyphs", open: () => sectionRevealed("glyphs"),
      locked: GUIDE_LOCKED_TEXT,
      body: "<p>Permanent multipliers drawn with Salvage. Duplicates stack to each glyph's cap. Every zone " +
            "has its own family, and none are lost to a renewal or a reset.</p>" },

    { id: "companions", title: "Companions", open: () => sectionRevealed("companions"),
      locked: GUIDE_LOCKED_TEXT,
      body: "<p>Survivors' animals, each found in the zone it belongs to and each carrying a permanent " +
            "production bonus for that zone. Merging duplicates raises the bonus. They are kept through " +
            "every renewal.</p>" +
            "<p>Companion and Glyph bonuses are added together rather than multiplied, so collecting both " +
            "is worthwhile without either running away.</p>" },

    { id: "civilisation", title: "Civilisation Bonuses", open: () => true,
      body: "<p>Every zone you restore permanently helps the zones before it. This is what makes " +
            "Last City one civilisation rather than five separate clickers.</p>" +
            "<ul><li><strong>Depot</strong> \u2014 +10% production to every earlier zone</li>" +
            "<li><strong>Foundry</strong> \u2014 +12% production to earlier zones, \u22125% building costs</li>" +
            "<li><strong>Relay</strong> \u2014 +15% production to earlier zones, +50% Auto Harvester output</li>" +
            "<li><strong>Citadel</strong> \u2014 +20% production to <em>every</em> zone</li></ul>" +
            "<p>These add together rather than compounding, so all five restored is +57% to Ashfall.</p>" +
            "<p>On top of that, the <strong>Supply Link</strong> upgrade bought in a zone feeds the zone " +
            "before it. <strong>Stats \u2192 Civilisation bonuses</strong> shows exactly what you are " +
            "receiving and what to buy next.</p>" },

    { id: "guest", title: "Guest Mode", open: () => true,
      body: "<p>Playing without signing in uses a <strong>guest city</strong> that belongs to this browser, " +
            "not to you. Anyone else opening the game on this device sees the same city.</p>" +
            "<p>If someone else has played here, choose <strong>Start a new guest game</strong> on the title " +
            "screen instead of continuing theirs. It asks twice before replacing a city, and the one it " +
            "replaces is archived rather than deleted.</p>" +
            "<p>Signing in creates a separate cloud save. A guest game can never overwrite it.</p>" },

    { id: "saving", title: "Saving", open: () => true,
      body: "<p>The game saves to this browser automatically, and on demand from the Save button. Signing in " +
            "adds a cloud save tied to your account, kept separate from the guest save on this device.</p>" +
            "<p><strong>Guest play:</strong> the guest city belongs to the browser, not to a person. If " +
            "someone else has played here, choose <em>Start a new guest game</em> on the title screen " +
            "instead of continuing theirs. A signed-in player's city is never touched by that.</p>" +
            "<p>Saves carry a version. One written by an older build is updated for the current economy, " +
            "told to you in full, and you may start fresh instead.</p>" },

    { id: "controls", title: "Controls", open: () => true,
      body: "<p><strong>Tab / Shift+Tab</strong> move between controls. <strong>Enter</strong> or " +
            "<strong>Space</strong> presses the focused button. <strong>Escape</strong> closes a dialog.</p>" +
            "<p>Manual gathering accepts up to <strong>12 presses per second</strong> with a mouse or keyboard " +
            "and <strong>20 taps per second</strong> on a touch screen. Anything faster is ignored, and holding " +
            "a key down does not gather. Your buildings are never affected by this.</p>" }
];

function closeGuide() {
    const dialog = document.getElementById("guideModal");
    if (dialog?.open) dialog.close();
}

function renderGuide() {
    const body = document.getElementById("guideBody");
    if (!body) return;
    body.innerHTML = GUIDE_SECTIONS.map(section => {
        let open = true;
        try { open = !!section.open(); } catch (_) { open = true; }
        if (open) return '<section class="guide-section"><h3>' + section.title + "</h3>" + section.body + "</section>";
        return '<section class="guide-section guide-locked"><h3>' + section.title +
               ' <span class="guide-lock">???</span></h3><p>' +
               (section.locked || "Keep playing to unlock this section.") + "</p></section>";
    }).join("");
}

function openGuide() {
    const dialog = document.getElementById("guideModal");
    if (!dialog) return;
    renderGuide();
    if (!dialog.open) { try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); } }
    document.getElementById("guideClose")?.focus?.({ preventScroll: true });
}

// Hands the player back to the real tutorial engine, from step one.
function replayTutorial() {
    closeGuide();
    try {
        const exp = window.LastCityExpansion;
        const state = exp?.state?.();
        if (state?.tutorial) {
            state.tutorial.completedSteps = {};
            state.tutorial.done = false;
            state.tutorial.dismissed = false;
        }
        exp?.resumeTutorial?.();
    } catch (error) { console.error("[LastCity] replay tutorial:", error); }
    if (typeof showNotification === "function") showNotification("Tutorial restarted from step one.");
    if (typeof saveGame === "function") saveGame(false);
}

// ---------------------------------------------------------------
// The radio operator
//
// One voice, deliberately thin. She is not a character system, a quest
// giver or a dialogue tree - she is the person on the other end of the
// beacon, and she says one short line when something genuinely changes.
// Each line fires once per city and is recorded in the save.
//
// Every line also carries the mechanical news it is reporting, so the
// personality and the feedback are the same message rather than two.
// ---------------------------------------------------------------
const OPERATOR_LINES = [
    { id: "firstCamp", when: () => game.buildings.scavenger >= 1,
      say: "Camp's up. That's the first thing out here that works without you standing over it." },
    { id: "firstWorkshop", when: () => game.buildings.workshop >= 1,
      say: "Workshop running. We can shape what we pull out of the ruins now, not just stack it." },
    { id: "firstPower", when: () => game.buildings.power >= 1,
      say: "Power restored. Everything we have built just got louder.", important: true },
    { id: "population", when: () => getPopulation() >= 30,
      say: "Thirty survivors on the roster. Ashfall can support more hands than it has work for." },
    { id: "firstCityCentre", when: () => game.buildings.citycenter >= 1,
      say: "City Center online. People are calling this a city now, not a camp.", important: true },
    { id: "beacon", when: () => (game.adventure?.progression?.beaconModules || 0) >= 3,
      say: "Beacon online. We might not be alone.", important: true },
    { id: "firstRenewal", when: () => game.rebirths >= 1,
      say: "We rebuild knowing what we know. It goes faster the second time.", important: true },
    { id: "zone2", when: () => game.stage2Unlocked === true, synergy: 2,
      say: "The Depot signal is responding. Supply routes both ways.", important: true },
    { id: "zone3", when: () => game.stage3Unlocked === true, synergy: 3,
      say: "Foundry's lit. We can fabricate parts instead of scavenging them.", important: true },
    { id: "zone4", when: () => game.stage4Unlocked === true, synergy: 4,
      say: "Relay is up. Every crew we have is finally on the same channel.", important: true },
    { id: "zone5", when: () => game.stage5Unlocked === true, synergy: 5,
      say: "Citadel answers. Whatever is up there, it has been waiting for us.", important: true }
];

function operatorState() {
    if (!game.operator || typeof game.operator !== "object") game.operator = { seen: {} };
    if (!game.operator.seen || typeof game.operator.seen !== "object") game.operator.seen = {};
    return game.operator;
}

// "Stage bonus unlocked: +10% Ashfall production" - the mechanical half of
// the message, generated from STAGE_SYNERGY so it can never drift from what
// the economy actually grants.
function synergyAnnouncement(stage) {
    const def = typeof STAGE_SYNERGY === "object" ? STAGE_SYNERGY[stage] : null;
    if (!def) return "";
    const parts = [];
    if (def.production) {
        parts.push("+" + Math.round(def.production * 100) + "% production to " +
            (def.scope === "all" ? "every zone" : "every earlier zone"));
    }
    if (def.buildCost) parts.push("\u2212" + Math.round(def.buildCost * 100) + "% building costs");
    if (def.automation) parts.push("+" + Math.round(def.automation * 100) + "% Auto Harvester output");
    return parts.length ? "Zone bonus unlocked \u2014 " + parts.join(" \u00b7 ") : "";
}

// ---------------------------------------------------------------
// Stage unlock
//
// Opening a zone is the biggest thing that happens in the game, and it used
// to be a toast. This is a short panel: what was restored, what is new, and
// what the rest of the civilisation gains. The bonus line is generated from
// STAGE_SYNERGY, so it cannot claim a number the economy does not pay.
// ---------------------------------------------------------------
const ZONE_UNLOCK = {
    2: { title: "DEPOT RESTORED", line: "Supply routes are operational again.",
         adds: ["Scrap", "Logistics infrastructure", "Expedition objectives"] },
    3: { title: "FOUNDRY RESTORED", line: "Civilisation can manufacture again.",
         adds: ["Parts", "Assembly lines", "Engine production"] },
    4: { title: "RELAY RESTORED", line: "The city is reconnecting and coordinating itself.",
         adds: ["Circuits", "Signal networks", "Field collection"] },
    5: { title: "CITADEL REACHED", line: "The last reconstruction site answers.",
         adds: ["Cores", "Reactor systems", "The Guardian"] }
};

function showZoneUnlockPanel(stage) {
    const def = ZONE_UNLOCK[stage];
    if (!def || document.getElementById("zoneUnlockModal")) return;
    const benefit = synergyAnnouncement(stage).replace(/^Zone bonus unlocked \u2014 /, "");
    const dialog = document.createElement("dialog");
    dialog.id = "zoneUnlockModal";
    dialog.className = "zone-unlock-modal";
    dialog.setAttribute("aria-labelledby", "zoneUnlockTitle");
    dialog.innerHTML =
        '<div class="zone-unlock-shell">' +
          '<p class="eyebrow">ZONE 0' + stage + ' \u00b7 ' + (ZONES[stage]?.theme || "") + '</p>' +
          '<h2 id="zoneUnlockTitle">' + def.title + '</h2>' +
          '<p class="zone-unlock-line">' + def.line + '</p>' +
          '<p class="zone-unlock-label">NEW</p>' +
          '<ul class="zone-unlock-adds">' + def.adds.map(a => "<li>" + a + "</li>").join("") + '</ul>' +
          (benefit ? '<p class="zone-unlock-label">CIVILISATION BENEFIT</p>' +
                     '<p class="zone-unlock-benefit">' + benefit + '</p>' : "") +
          '<button type="button" id="zoneUnlockEnter" class="recovery-primary">Enter ' +
            (ZONE_NAMES[stage] || "the zone") + '</button>' +
        '</div>';
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    document.getElementById("zoneUnlockEnter")?.addEventListener("click", () => {
        dialog.close();
        try { document.querySelector('.stage-tab[data-stage="' + stage + '"]')?.click(); } catch (_) { }
    });
    try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
    document.getElementById("zoneUnlockEnter")?.focus?.({ preventScroll: true });
}

function operatorSpeak(line) {
    const log = window.LastCityExpansion?.logEvent;
    if (typeof log === "function") {
        try { log("\u25b8 OPERATOR: " + line.say, line.important ? "good" : "info"); } catch (_) { }
    }
    if (line.synergy) {
        const news = synergyAnnouncement(line.synergy);
        if (news && typeof log === "function") { try { log(news, "good"); } catch (_) { } }
        // The panel carries the same news, so no toast on top of it.
        showZoneUnlockPanel(line.synergy);
        return;
    }
    // Only the genuinely important lines interrupt; the rest wait in the log.
    if (line.important && typeof showNotification === "function") showNotification(line.say);
}

function updateOperator() {
    if (!gameStarted) return;
    const state = operatorState();
    let spoke = false;
    for (const line of OPERATOR_LINES) {
        if (state.seen[line.id]) continue;
        let fired = false;
        try { fired = !!line.when(); } catch (_) { fired = false; }
        if (!fired) continue;
        state.seen[line.id] = true;
        // Restoring a zone is the biggest beat in the game.
        if (typeof grantXp === "function") grantXp(line.synergy ? "zone" : "milestone");
        // One line at a time. A city that meets three conditions at once gets
        // three lines over three ticks, not a wall of text.
        if (!spoke) { operatorSpeak(line); spoke = true; }
    }
}

// ---------------------------------------------------------------
// Tick
// ---------------------------------------------------------------
function updateOnboarding() {
    if (typeof game === "undefined" || !game) return;
    onboardingState();
    updateProgressiveReveal();
    updateLockedStageTabs();
    updateOperator();
    if (currentGameMode === "stats") renderSupplyNetwork();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("guideButton")?.addEventListener("click", openGuide);
    document.getElementById("guideClose")?.addEventListener("click", closeGuide);
    document.getElementById("guideReplay")?.addEventListener("click", replayTutorial);

    // A locked zone opens its requirements panel instead of flashing a toast.
    document.querySelector(".stage-tabs")?.addEventListener("click", event => {
        const tab = event.target.closest?.(".stage-tab");
        const stage = Number(tab?.dataset?.stage);
        if (!Number.isInteger(stage) || isZoneUnlocked(stage)) return;
        event.stopPropagation();
        event.preventDefault();
        showLockedZonePanel(stage);
    }, true);

    // Locked sections explain themselves instead of silently doing nothing.
    // Capture phase, so this runs before the switchGameMode handler.
    document.querySelector(".game-mode-tabs")?.addEventListener("click", event => {
        const tab = event.target.closest?.(".game-mode-tab");
        const mode = tab?.dataset?.mode;
        if (!mode || !REVEAL_RULES[mode] || mode === currentGameMode) return;
        if (sectionRevealed(mode)) return;
        event.stopPropagation();
        event.preventDefault();
        if (typeof showNotification === "function") showNotification("🔒 " + sectionLockReason(mode));
        if (typeof playSfx === "function") playSfx("clack");
    }, true);
});
