// =============================================
// LAST CITY · COMPANION PROGRESSION
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// Everything added on top of the existing pet system, and nothing taken away
// from it. The original collection, equipped slots, merge-to-gold, hatch odds
// and zone multipliers are untouched; this module layers on:
//
//   * levels and experience, earned by playing
//   * three equipment slots per companion, with items you find and craft
//   * timed training that grants experience and unlocks abilities
//   * daily care (feeding and play) that builds a bond
//   * assignments: one companion helping the city, one exploring, one fighting
//
// Pet ids are the ORIGINAL "<stage>-<rarity>" ids, so a player's existing
// collection gains all of this without being rebuilt. The migration already
// guarantees every owned pet has at least level 1.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function zonesTable() { try { return typeof ZONES !== "undefined" ? ZONES : null; } catch (_) { return null; } }
    function petsTable() { try { return typeof ZONE_PETS !== "undefined" ? ZONE_PETS : null; } catch (_) { return null; } }
    function raritiesTable() { try { return typeof RARITIES !== "undefined" ? RARITIES : null; } catch (_) { return null; } }
    function petInfoOf(id) {
        try { return typeof petInfo === "function" ? petInfo(id) : null; } catch (_) { return null; }
    }
    function fmt(value) { return typeof global.formatNumber === "function" ? global.formatNumber(value) : String(Math.round(value)); }
    function exp() { return EX()?.state() || null; }

    const MAX_LEVEL = 40;

    // ---------------------------------------------------------------
    // Identity helpers
    // ---------------------------------------------------------------

    function ownedPetIds() {
        const g = liveGame();
        const collection = g?.adventure?.collection || {};
        return Object.keys(collection).filter(id => (collection[id] || 0) > 0);
    }

    function petName(id) {
        const info = petInfoOf(id);
        const table = petsTable();
        if (info && table?.[info.stage]?.[info.rarity]) return table[info.stage][info.rarity][0];
        return "Companion";
    }

    function petIcon(id) {
        const info = petInfoOf(id);
        const table = petsTable();
        if (info && table?.[info.stage]?.[info.rarity]) return table[info.stage][info.rarity][1];
        return "🐾";
    }

    function petRarity(id) {
        const info = petInfoOf(id);
        const table = raritiesTable();
        if (info && table?.[info.rarity]) return table[info.rarity];
        return { name: "Common", color: "#a8bac9", bonus: 0.08 };
    }

    function petStage(id) {
        const info = petInfoOf(id);
        if (info) return info.stage;
        const parsed = Number(String(id).split("-")[0]);
        return Number.isFinite(parsed) ? parsed : 1;
    }

    // ---------------------------------------------------------------
    // Experience and levels
    // ---------------------------------------------------------------

    function xpForLevel(level) {
        // Gentle early, steeper later: level 2 costs 60, level 40 about 1.6M.
        return Math.ceil(60 * Math.pow(1.28, Math.max(0, level - 1)));
    }

    function level(id) {
        const state = exp();
        return Math.max(1, Math.min(MAX_LEVEL, Math.floor(state?.pets.levels[id] || 1)));
    }

    function xp(id) {
        const state = exp();
        return Math.max(0, state?.pets.xp[id] || 0);
    }

    function grantXp(id, amount) {
        const state = exp();
        if (!state || !amount || amount <= 0) return 0;
        if (!ownedPetIds().includes(id)) return 0;
        state.pets.xp[id] = xp(id) + amount;
        let gained = 0;
        let guard = 0;
        while (level(id) < MAX_LEVEL && guard++ < MAX_LEVEL) {
            const need = xpForLevel(level(id));
            if (state.pets.xp[id] < need) break;
            state.pets.xp[id] -= need;
            state.pets.levels[id] = level(id) + 1;
            state.pets.totalLevels++;
            gained++;
            checkAbilityUnlocks(id);
        }
        if (gained) {
            EX().sfx("petLevel");
            EX().notify("⬆ " + petName(id) + " reached level " + level(id));
            EX().logEvent(petName(id) + " reached level " + level(id) + ".", "good");
        }
        return gained;
    }

    // Spread experience across the companions currently doing something, so
    // playing the game levels the pets the player actually uses.
    function distributeXp(amount, source) {
        const state = exp();
        if (!state || amount <= 0) return;
        const targets = new Set();
        for (const role of ["city", "explore", "combat"]) {
            const id = state.pets.assignments[role];
            if (id) targets.add(id);
        }
        const g = liveGame();
        // Equipped companions in the current zone also learn, at half rate.
        const equipped = g?.adventure?.equipped || {};
        for (const slots of Object.values(equipped)) {
            for (const id of slots || []) targets.add(id);
        }
        if (!targets.size) return;
        const share = amount / targets.size;
        for (const id of targets) grantXp(id, share);
        void source;
    }

    // ---------------------------------------------------------------
    // Abilities
    // ---------------------------------------------------------------

    const ABILITIES = {
        forager:   { level: 3,  name: "Forager",     icon: "🌿", desc: "+4% zone production per 5 companion levels.", kind: "production" },
        guardian:  { level: 8,  name: "Guardian",    icon: "🛡", desc: "+10% raid defense while assigned to combat.", kind: "combat" },
        pathfinder:{ level: 12, name: "Pathfinder",  icon: "🧭", desc: "+8% exploration success while assigned to exploring.", kind: "explore" },
        industrious:{ level: 18, name: "Industrious", icon: "⚙", desc: "Construction and upgrades finish 15% faster.", kind: "city" },
        luminous:  { level: 25, name: "Luminous",    icon: "✧", desc: "+10% glyph luck while equipped.", kind: "glyph" },
        ascendant: { level: 34, name: "Ascendant",   icon: "🌌", desc: "+12% production in every zone.", kind: "production" }
    };

    function abilityKey(id, ability) { return id + ":" + ability; }

    function hasAbility(id, ability) {
        return !!exp()?.pets.abilityUnlocks[abilityKey(id, ability)];
    }

    function checkAbilityUnlocks(id) {
        const state = exp();
        if (!state) return;
        for (const [key, ability] of Object.entries(ABILITIES)) {
            if (level(id) < ability.level) continue;
            const flag = abilityKey(id, key);
            if (state.pets.abilityUnlocks[flag]) continue;
            state.pets.abilityUnlocks[flag] = true;
            EX().notify("✦ " + petName(id) + " learned " + ability.name);
            EX().logEvent(petName(id) + " learned " + ability.name + ".", "good");
        }
    }

    // ---------------------------------------------------------------
    // Equipment
    //
    // Items drop from missions, combat and discoveries. Each item fits one
    // slot; a companion has three slots.
    // ---------------------------------------------------------------

    const SLOTS = ["collar", "harness", "charm"];

    const ITEMS = {
        wornCollar:    { name: "Worn Collar",     slot: "collar",  icon: "⭕", effect: { production: 0.04 }, desc: "+4% zone production." },
        studdedCollar: { name: "Studded Collar",  slot: "collar",  icon: "⭕", effect: { defense: 0.08 },    desc: "+8% raid defense." },
        signalCollar:  { name: "Signal Collar",   slot: "collar",  icon: "⭕", effect: { production: 0.1 },   desc: "+10% zone production." },
        canvasHarness: { name: "Canvas Harness",  slot: "harness", icon: "➰", effect: { xpRate: 0.2 },      desc: "+20% experience gain." },
        toolHarness:   { name: "Tool Harness",    slot: "harness", icon: "➰", effect: { buildSpeed: 0.1 },  desc: "Builds 10% faster." },
        plateHarness:  { name: "Plated Harness",  slot: "harness", icon: "➰", effect: { combatHp: 0.15 },   desc: "+15% companion health in battle." },
        emberCharm:    { name: "Ember Charm",     slot: "charm",   icon: "✦", effect: { production: 0.06 }, desc: "+6% zone production." },
        glyphCharm:    { name: "Glyph Charm",     slot: "charm",   icon: "✦", effect: { luck: 0.08 },       desc: "+8% glyph luck." },
        voidCharm:     { name: "Void Charm",      slot: "charm",   icon: "✦", effect: { production: 0.08, combatDps: 0.1 }, desc: "+8% production, +10% companion damage." }
    };

    function inventoryCount(itemId) {
        return Math.max(0, Math.floor(exp()?.pets.inventory[itemId] || 0));
    }

    function grantItem(itemId, amount = 1) {
        const state = exp();
        if (!state || !ITEMS[itemId]) return false;
        state.pets.inventory[itemId] = inventoryCount(itemId) + amount;
        EX().notify("📦 Found " + ITEMS[itemId].name);
        return true;
    }

    function equipped(id) {
        return exp()?.pets.equipment[id] || {};
    }

    function equipItem(petId, itemId) {
        const state = exp();
        const item = ITEMS[itemId];
        if (!state || !item) return false;
        if (inventoryCount(itemId) <= 0) { EX().notify("You do not have that item."); return false; }
        const slots = state.pets.equipment[petId] || (state.pets.equipment[petId] = {});
        const previous = slots[item.slot];
        if (previous && ITEMS[previous]) {
            // Returning the old item to the inventory, so nothing is destroyed.
            state.pets.inventory[previous] = inventoryCount(previous) + 1;
        }
        slots[item.slot] = itemId;
        state.pets.inventory[itemId] = inventoryCount(itemId) - 1;
        EX().sfx("petHappy");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        render();
        return true;
    }

    function unequipItem(petId, slot) {
        const state = exp();
        if (!state) return false;
        const slots = state.pets.equipment[petId];
        const itemId = slots?.[slot];
        if (!itemId) return false;
        delete slots[slot];
        state.pets.inventory[itemId] = inventoryCount(itemId) + 1;
        EX().sfx("uiBack");
        EX().save();
        render();
        return true;
    }

    // Total effect of a companion's kit, by effect name.
    function itemEffects(petId) {
        const total = {};
        for (const itemId of Object.values(equipped(petId))) {
            const item = ITEMS[itemId];
            if (!item) continue;
            for (const [key, value] of Object.entries(item.effect)) {
                total[key] = (total[key] || 0) + value;
            }
        }
        return total;
    }

    // ---------------------------------------------------------------
    // Training
    // ---------------------------------------------------------------

    const TRAINING = {
        focus:    { name: "Focus Drill",   minutes: 5,  xp: 140,  icon: "🎯", desc: "A short drill. Reliable experience." },
        endurance:{ name: "Endurance Run", minutes: 15, xp: 520,  icon: "🏃", desc: "Longer, and worth more." },
        field:    { name: "Field Exercise", minutes: 45, xp: 1900, icon: "🏔", desc: "A full day out. The best experience per session." }
    };

    function trainingOf(petId) { return exp()?.pets.training[petId] || null; }

    function startTraining(petId, kind) {
        const state = exp();
        const def = TRAINING[kind];
        if (!state || !def) return false;
        if (trainingOf(petId)) { EX().notify(petName(petId) + " is already training."); return false; }
        const now = Date.now();
        state.pets.training[petId] = { until: now + def.minutes * 60000, started: now, kind };
        EX().sfx("uiOpen");
        EX().notify("🎯 " + petName(petId) + " started " + def.name);
        EX().save();
        render();
        return true;
    }

    function collectTraining(petId) {
        const state = exp();
        const record = trainingOf(petId);
        if (!state || !record) return false;
        if (Date.now() < record.until) return false;
        const def = TRAINING[record.kind] || TRAINING.focus;
        const bonus = 1 + (itemEffects(petId).xpRate || 0) + bond(petId) / 400;
        delete state.pets.training[petId];
        state.pets.trainingsCompleted++;
        grantXp(petId, def.xp * bonus);
        // Training occasionally turns up a piece of kit.
        if (Math.random() < 0.22) {
            const pool = Object.keys(ITEMS);
            grantItem(pool[Math.floor(Math.random() * pool.length)]);
        }
        EX().sfx("petHappy");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        render();
        return true;
    }

    // ---------------------------------------------------------------
    // Care
    // ---------------------------------------------------------------

    const CARE_COOLDOWN = 4 * 60 * 60 * 1000;   // four hours

    function careOf(petId) {
        const state = exp();
        return state?.pets.care[petId] || { fedAt: 0, playedAt: 0, bond: 0 };
    }

    function bond(petId) { return Math.max(0, Math.min(100, careOf(petId).bond)); }

    function careReady(petId, kind) {
        const record = careOf(petId);
        const stamp = kind === "feed" ? record.fedAt : record.playedAt;
        return Date.now() - stamp >= CARE_COOLDOWN;
    }

    function doCare(petId, kind) {
        const state = exp();
        if (!state) return false;
        if (!careReady(petId, kind)) {
            const record = careOf(petId);
            const stamp = kind === "feed" ? record.fedAt : record.playedAt;
            const left = Math.ceil((CARE_COOLDOWN - (Date.now() - stamp)) / 60000);
            EX().notify(petName(petId) + " is happy for now. Back in " + left + " min.");
            return false;
        }
        const record = state.pets.care[petId] || (state.pets.care[petId] = { fedAt: 0, playedAt: 0, bond: 0 });
        if (kind === "feed") record.fedAt = Date.now();
        else record.playedAt = Date.now();
        record.bond = Math.min(100, record.bond + 6);
        grantXp(petId, kind === "feed" ? 45 : 70);
        EX().sfx("petHappy");
        EX().notify((kind === "feed" ? "🍖 Fed " : "🎾 Played with ") + petName(petId) + " · bond " + Math.round(record.bond) + "%");
        EX().save();
        render();
        return true;
    }

    // ---------------------------------------------------------------
    // Assignments
    // ---------------------------------------------------------------

    const ROLES = {
        city:    { name: "City Helper",  icon: "🏙", desc: "Walks the settlement, speeds up construction." },
        explore: { name: "Scout",        icon: "🧭", desc: "Improves exploration mission odds." },
        combat:  { name: "Battle Pet",   icon: "⚔", desc: "Fights alongside your units in every wave." }
    };

    function assign(role, petId) {
        const state = exp();
        if (!state || !ROLES[role]) return false;
        if (petId && !ownedPetIds().includes(petId)) return false;
        if (state.pets.assignments[role] === petId) {
            delete state.pets.assignments[role];
        } else {
            // One role per companion, so a single pet cannot do everything.
            for (const other of Object.keys(ROLES)) {
                if (other !== role && state.pets.assignments[other] === petId) {
                    delete state.pets.assignments[other];
                }
            }
            state.pets.assignments[role] = petId;
        }
        EX().sfx("uiTap");
        EX().emit("pets:assigned", { role, petId });
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        render();
        return true;
    }

    // ---------------------------------------------------------------
    // The audited bonus channel
    //
    // Returns exactly 1 when no companion has gained a level, an item or a
    // bond, so a save that has not touched this system is unaffected.
    // ---------------------------------------------------------------

    function productionMultiplier(stage) {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return 1;
        let multiplier = 1;

        // Equipped companions of this zone contribute their levels and kit.
        const slots = g.adventure?.equipped?.[stage] || [];
        for (const id of slots) {
            if (!id) continue;
            const petLevel = level(id);
            const effects = itemEffects(id);
            let bonus = 0;
            // Levels: a flat, readable 1% a level, before abilities.
            bonus += (petLevel - 1) * 0.01;
            if (hasAbility(id, "forager")) bonus += Math.floor(petLevel / 5) * 0.04;
            if (hasAbility(id, "ascendant")) bonus += 0.12;
            bonus += effects.production || 0;
            bonus += bond(id) / 1000;
            multiplier *= 1 + Math.max(0, bonus);
        }

        // An assigned companion helps every zone a little.
        const helper = state.pets.assignments.city;
        if (helper && ownedPetIds().includes(helper)) {
            multiplier *= 1 + Math.min(0.25, (level(helper) - 1) * 0.004);
        }

        return Number.isFinite(multiplier) && multiplier > 0 ? Math.min(1e4, multiplier) : 1;
    }

    // Read by the glyph-adjacent systems and by combat.
    function luckBonus() {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return 1;
        let bonus = 0;
        for (const slots of Object.values(g.adventure?.equipped || {})) {
            for (const id of slots || []) {
                if (!id) continue;
                bonus += itemEffects(id).luck || 0;
                if (hasAbility(id, "luminous")) bonus += 0.1;
            }
        }
        return 1 + Math.min(1, bonus);
    }

    function buildSpeedBonus() {
        const state = exp();
        if (!state) return 0;
        const helper = state.pets.assignments.city;
        if (!helper) return 0;
        let bonus = itemEffects(helper).buildSpeed || 0;
        if (hasAbility(helper, "industrious")) bonus += 0.15;
        return Math.min(0.5, bonus);
    }

    // ---------------------------------------------------------------
    // UI
    //
    // A dialog of its own, reachable from the City rail and from a button this
    // module adds to the original Pets panel. The original panel re-renders
    // itself from scratch, so the button is re-inserted whenever it is
    // missing rather than being bound once.
    // ---------------------------------------------------------------

    const ui = { selected: null, tab: "roster" };

    function ensureDialog() {
        if (document.getElementById("petPlusModal")) return;
        const dialog = document.createElement("dialog");
        dialog.id = "petPlusModal";
        dialog.className = "petplus-modal";
        dialog.setAttribute("aria-labelledby", "petPlusTitle");
        dialog.innerHTML =
            '<div class="petplus-shell">' +
              '<header class="people-head">' +
                '<div><p class="eyebrow">COMPANIONS</p><h2 id="petPlusTitle">Training &amp; equipment</h2></div>' +
                '<button type="button" class="people-close" data-petplus-action="close" aria-label="Close">×</button>' +
              '</header>' +
              '<nav class="people-tabs" role="tablist">' +
                '<button type="button" class="people-tab active" data-petplus-tab="roster" role="tab">Roster</button>' +
                '<button type="button" class="people-tab" data-petplus-tab="assign" role="tab">Assignments</button>' +
                '<button type="button" class="people-tab" data-petplus-tab="items" role="tab">Items</button>' +
              '</nav>' +
              '<div class="people-body" id="petPlusBody"></div>' +
            '</div>';
        document.body.appendChild(dialog);
        dialog.addEventListener("click", onClick);
    }

    function open(tab = "roster") {
        ensureDialog();
        ui.tab = tab;
        if (!ui.selected) ui.selected = ownedPetIds()[0] || null;
        const dialog = document.getElementById("petPlusModal");
        if (!dialog) return;
        render();
        if (!dialog.open) dialog.showModal();
        EX().sfx("uiOpen");
    }

    function onClick(event) {
        const tab = event.target.closest?.("[data-petplus-tab]");
        if (tab) {
            ui.tab = tab.dataset.petplusTab;
            EX().sfx("uiTap");
            render();
            return;
        }
        const action = event.target.closest?.("[data-petplus-action]");
        if (!action) return;
        const kind = action.dataset.petplusAction;
        const value = action.dataset.petplusValue;
        const extra = action.dataset.petplusExtra;
        if (kind === "close") document.getElementById("petPlusModal")?.close();
        else if (kind === "select") { ui.selected = value; EX().sfx("uiTap"); render(); }
        else if (kind === "train") startTraining(value, extra);
        else if (kind === "collect") collectTraining(value);
        else if (kind === "feed") doCare(value, "feed");
        else if (kind === "play") doCare(value, "play");
        else if (kind === "equip") equipItem(value, extra);
        else if (kind === "unequip") unequipItem(value, extra);
        else if (kind === "assign") assign(extra, value);
    }

    function petRow(id) {
        const rarity = petRarity(id);
        const petLevel = level(id);
        const need = xpForLevel(petLevel);
        const progress = petLevel >= MAX_LEVEL ? 100 : Math.round((xp(id) / need) * 100);
        const state = exp();
        const roles = Object.entries(ROLES)
            .filter(([role]) => state?.pets.assignments[role] === id)
            .map(([, def]) => def.icon).join("");
        return '<button type="button" class="pet-row' + (ui.selected === id ? " active" : "") + '"' +
            ' data-petplus-action="select" data-petplus-value="' + id + '">' +
            '<span class="pet-row-icon" aria-hidden="true">' + petIcon(id) + '</span>' +
            '<span class="pet-row-copy"><strong>' + petName(id) + '</strong>' +
            '<small style="color:' + rarity.color + '">' + rarity.name + ' · Lv ' + petLevel + '</small>' +
            '<em class="pet-xp"><i style="width:' + progress + '%"></i></em></span>' +
            '<span class="pet-row-roles" aria-hidden="true">' + roles + '</span></button>';
    }

    function detail(id) {
        if (!id) return '<p class="people-note">Hatch a companion first — eggs are in the Companions tab.</p>';
        const state = exp();
        const rarity = petRarity(id);
        const petLevel = level(id);
        const zone = zonesTable()?.[petStage(id)];
        const record = trainingOf(id);
        const kit = equipped(id);
        const effects = itemEffects(id);
        const abilities = Object.entries(ABILITIES).map(([key, ability]) => {
            const got = hasAbility(id, key);
            return '<li class="' + (got ? "got" : "") + '">' + ability.icon + ' <strong>' + ability.name + '</strong>' +
                '<small>' + (got ? ability.desc : "Unlocks at level " + ability.level) + '</small></li>';
        }).join("");

        let trainingBlock;
        if (record) {
            const def = TRAINING[record.kind] || TRAINING.focus;
            const remaining = Math.max(0, record.until - Date.now());
            const total = Math.max(1, record.until - record.started);
            const percent = Math.round((1 - remaining / total) * 100);
            trainingBlock = '<p class="inspect-progress"><span style="width:' + percent + '%"></span></p>' +
                (remaining > 0
                    ? '<small>' + def.name + ' · ' + Math.ceil(remaining / 60000) + ' min remaining</small>'
                    : '<button type="button" class="city-action" data-petplus-action="collect" data-petplus-value="' + id + '">Collect training</button>');
        } else {
            trainingBlock = '<div class="petplus-actions">' + Object.entries(TRAINING).map(([key, def]) =>
                '<button type="button" class="city-mini" data-petplus-action="train" data-petplus-value="' + id + '"' +
                ' data-petplus-extra="' + key + '">' + def.icon + ' ' + def.name + ' · ' + def.minutes + 'm</button>').join("") + '</div>';
        }

        const slotRows = SLOTS.map(slot => {
            const itemId = kit[slot];
            const item = ITEMS[itemId];
            const options = Object.entries(ITEMS)
                .filter(([key, candidate]) => candidate.slot === slot && inventoryCount(key) > 0)
                .map(([key, candidate]) =>
                    '<button type="button" class="city-mini" data-petplus-action="equip" data-petplus-value="' + id + '"' +
                    ' data-petplus-extra="' + key + '">' + candidate.icon + ' ' + candidate.name + '</button>').join("");
            return '<div class="slot-row"><span class="slot-name">' + slot + '</span>' +
                (item
                    ? '<span class="slot-item">' + item.icon + ' ' + item.name + ' <small>' + item.desc + '</small></span>' +
                      '<button type="button" class="city-mini" data-petplus-action="unequip" data-petplus-value="' + id + '"' +
                      ' data-petplus-extra="' + slot + '">Remove</button>'
                    : '<span class="slot-empty">empty</span>' + (options || '<small class="slot-none">no items</small>')) +
                '</div>';
        }).join("");

        return '<div class="pet-detail">' +
            '<header><span class="pet-detail-icon" aria-hidden="true">' + petIcon(id) + '</span>' +
            '<div><strong>' + petName(id) + '</strong>' +
            '<small style="color:' + rarity.color + '">' + rarity.name + ' · level ' + petLevel + ' / ' + MAX_LEVEL +
            ' · ' + (zone?.label || "zone") + ' companion</small></div></header>' +
            '<ul class="inspect-stats">' +
            '<li>Experience: <strong>' + fmt(Math.floor(xp(id))) + ' / ' + fmt(xpForLevel(petLevel)) + '</strong></li>' +
            '<li>Bond: <strong>' + Math.round(bond(id)) + '%</strong></li>' +
            '<li>Copies owned: <strong>' + (liveGame()?.adventure?.collection?.[id] || 0) + '</strong></li>' +
            (effects.production ? '<li>Kit production: <strong>+' + Math.round(effects.production * 100) + '%</strong></li>' : '') +
            '</ul>' +
            '<div class="petplus-care">' +
            '<button type="button" class="city-mini" data-petplus-action="feed" data-petplus-value="' + id + '"' +
            (careReady(id, "feed") ? '' : ' disabled') + '>🍖 Feed</button>' +
            '<button type="button" class="city-mini" data-petplus-action="play" data-petplus-value="' + id + '"' +
            (careReady(id, "play") ? '' : ' disabled') + '>🎾 Play</button>' +
            '</div>' +
            '<h4>Training</h4>' + trainingBlock +
            '<h4>Equipment</h4><div class="slot-list">' + slotRows + '</div>' +
            '<h4>Abilities</h4><ul class="ability-list">' + abilities + '</ul>' +
            '</div>';
    }

    function render() {
        const body = document.getElementById("petPlusBody");
        if (!body) return;
        const state = exp();
        if (!state) return;
        for (const tab of document.querySelectorAll("#petPlusModal [data-petplus-tab]")) {
            const active = tab.dataset.petplusTab === ui.tab;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        }

        const owned = ownedPetIds();
        if (!owned.length) {
            body.innerHTML = '<p class="people-note">You have not hatched a companion yet. ' +
                'Open the Pets tab and hatch an egg with this zone\'s currency.</p>';
            return;
        }
        if (!ui.selected || !owned.includes(ui.selected)) ui.selected = owned[0];

        if (ui.tab === "assign") {
            const rows = Object.entries(ROLES).map(([role, def]) => {
                const current = state.pets.assignments[role];
                const options = owned.map(id =>
                    '<button type="button" class="city-mini' + (current === id ? " active" : "") + '"' +
                    ' data-petplus-action="assign" data-petplus-value="' + id + '" data-petplus-extra="' + role + '">' +
                    petIcon(id) + ' ' + petName(id) + ' Lv' + level(id) + '</button>').join("");
                return '<article class="assign-card"><header><span aria-hidden="true">' + def.icon + '</span>' +
                    '<div><strong>' + def.name + '</strong><small>' + def.desc + '</small></div></header>' +
                    '<p class="assign-current">' + (current ? "Assigned: " + petName(current) : "Nobody assigned") + '</p>' +
                    '<div class="assign-options">' + options + '</div></article>';
            }).join("");
            body.innerHTML = '<p class="people-note">A companion can hold one role at a time. ' +
                'Assignments are visible in the city, in missions and in battle.</p>' +
                '<div class="assign-grid">' + rows + '</div>';
            return;
        }

        if (ui.tab === "items") {
            const held = Object.entries(ITEMS).filter(([key]) => inventoryCount(key) > 0);
            body.innerHTML = '<p class="people-note">Items come from training, missions, discoveries and cleared waves. ' +
                'Equip them from a companion\'s Roster page.</p>' +
                (held.length
                    ? '<div class="item-grid">' + held.map(([key, item]) =>
                        '<article class="item-card"><header><span aria-hidden="true">' + item.icon + '</span>' +
                        '<div><strong>' + item.name + '</strong><small>' + item.slot + '</small></div>' +
                        '<em>×' + inventoryCount(key) + '</em></header><p>' + item.desc + '</p></article>').join("") + '</div>'
                    : '<p class="people-note">No items yet. Run a training session or an exploration mission.</p>');
            return;
        }

        body.innerHTML =
            '<div class="petplus-layout">' +
              '<div class="pet-list">' + owned.map(petRow).join("") + '</div>' +
              '<div class="pet-pane">' + detail(ui.selected) + '</div>' +
            '</div>';
    }

    // ---------------------------------------------------------------
    // Earning experience from play
    // ---------------------------------------------------------------

    let xpAccumulator = 0;

    function tick(elapsedMs) {
        const state = exp();
        if (!state) return;
        // Idle experience: slow, so it is a floor rather than a strategy.
        xpAccumulator += elapsedMs / 1000;
        if (xpAccumulator >= 20) {
            distributeXp(xpAccumulator * 0.5, "idle");
            xpAccumulator = 0;
        }
        // Finish training in the background and tell the player.
        for (const [petId, record] of Object.entries(state.pets.training)) {
            if (record.until <= Date.now() && document.getElementById("petPlusModal")?.open) {
                // Collected by hand, so the reward is always visible; this
                // only refreshes the panel so the button appears.
                render();
                break;
            }
            void petId;
        }
        if (document.getElementById("petPlusModal")?.open) render();
    }

    // Adds the entry point to the original Pets panel. The original panel
    // rebuilds its own innerHTML, so this is re-applied whenever it is gone
    // instead of being attached once.
    function attachPetsPanelButton() {
        const panel = document.getElementById("companionPanel");
        if (!panel || !panel.innerHTML) return;
        if (panel.querySelector("[data-petplus-open]")) return;
        const bar = document.createElement("div");
        bar.className = "petplus-entry";
        bar.innerHTML =
            '<button type="button" class="city-action" data-petplus-open="roster">' +
            '⬆ Training, equipment &amp; assignments</button>' +
            '<small>Levels, items, abilities and roles for every companion you own.</small>';
        panel.appendChild(bar);
    }

    function alwaysRender() {
        attachPetsPanelButton();
    }

    function onLoad() {
        ui.selected = null;
        document.getElementById("petPlusModal")?.close?.();
    }

    function init() {
        ensureDialog();
        document.addEventListener("click", event => {
            const trigger = event.target?.closest?.("[data-petplus-open]");
            if (!trigger) return;
            event.preventDefault();
            open(trigger.dataset.petplusOpen || "roster");
        });
        // Experience and loot for finishing real content.
        EX()?.on("combat:boss", () => {
            distributeXp(900, "boss");
            const pool = Object.keys(ITEMS);
            grantItem(pool[Math.floor(Math.random() * pool.length)]);
        });
        EX()?.on("research:complete", () => distributeXp(220, "research"));
        EX()?.on("city:placed", () => distributeXp(40, "build"));
        EX()?.on("city:discovery", () => {
            distributeXp(120, "discovery");
            if (Math.random() < 0.35) {
                const pool = Object.keys(ITEMS);
                grantItem(pool[Math.floor(Math.random() * pool.length)]);
            }
        });
    }

    global.LastCityExpansion?.register?.("pets", {
        init, tick, onLoad, alwaysRender, render,
        productionMultiplier, luckBonus, buildSpeedBonus,
        open,
        ABILITIES, ITEMS, TRAINING, ROLES, SLOTS, MAX_LEVEL,
        level, xp, xpForLevel, bond, hasAbility, itemEffects,
        _grantXp: grantXp,
        _distributeXp: distributeXp,
        _grantItem: grantItem,
        _equipItem: equipItem,
        _unequipItem: unequipItem,
        _startTraining: startTraining,
        _collectTraining: collectTraining,
        _doCare: doCare,
        _assign: assign,
        _ownedPetIds: ownedPetIds
    });
})(typeof window !== "undefined" ? window : globalThis);
