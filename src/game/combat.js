// =============================================
// LAST CITY · CITY DEFENSE
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// A real-time lane battle for defending the settlement. The design borrows the
// *shape* of a lane deployment game — a charge meter that refills, a small
// hand of unit cards, three lanes, towers that shoot back, a boss every fifth
// wave — and fills it with this game's own units, art and economy. No external
// artwork, audio or data is used; every unit is drawn procedurally from the
// same palette language as the city view.
//
// How it connects to the rest of the game:
//   * Defenses come from the city. Turrets and barricades the player actually
//     built contribute tower HP and damage, so building a perimeter matters.
//   * A wave that reaches the core damages real structures through
//     "combat:raid-damage", which the city view repairs for Salvage.
//   * Rewards are one-shot per campaign wave, guarded by a flag in the save,
//     so a reload cannot farm the same wave twice.
//   * Companions assigned to combat fight alongside the player's units.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function started() { try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; } }
    function mode() { try { return typeof currentGameMode !== "undefined" ? currentGameMode : "city"; } catch (_) { return "city"; } }
    function stageView() { try { return typeof currentStageView !== "undefined" ? currentStageView : 1; } catch (_) { return 1; } }
    function zonesTable() { try { return typeof ZONES !== "undefined" ? ZONES : null; } catch (_) { return null; } }
    function fmt(value) { return typeof global.formatNumber === "function" ? global.formatNumber(value) : String(Math.round(value)); }
    function exp() { return EX()?.state() || null; }

    // ---------------------------------------------------------------
    // Units
    //
    // `shape` drives the procedural drawing. `role` drives the AI: melee walks
    // until something is in reach, ranged stops at range, siege ignores units
    // and goes for towers, support heals whoever is in front of it.
    // ---------------------------------------------------------------

    const UNITS = {
        scrapper: {
            name: "Scrapper", icon: "🔨", cost: 2, hp: 150, dps: 26, range: 18, speed: 34,
            role: "melee", shape: "humanoid", color: "#c9a063",
            unlock: null,
            desc: "Cheap, fast and expendable. Good for soaking the first hit of a wave."
        },
        rifleman: {
            name: "Rifleman", icon: "🎯", cost: 3, hp: 110, dps: 34, range: 112, speed: 27,
            role: "ranged", shape: "humanoid", color: "#7da5c9",
            unlock: null,
            desc: "Stops at range and fires. Fragile if anything reaches it."
        },
        bulwark: {
            name: "Bulwark", icon: "🛡️", cost: 4, hp: 420, dps: 18, range: 20, speed: 20,
            role: "melee", shape: "heavy", color: "#8e94a3", armour: 0.35,
            unlock: "wave:3",
            desc: "Armoured. Takes 35% less damage and holds a lane on its own."
        },
        sapper: {
            name: "Sapper", icon: "💥", cost: 4, hp: 130, dps: 60, range: 22, speed: 40,
            role: "siege", shape: "humanoid", color: "#ff8b35",
            unlock: "wave:5",
            desc: "Walks past defenders and hits towers hard. Dies quickly if intercepted."
        },
        medic: {
            name: "Field Medic", icon: "⚕", cost: 3, hp: 120, dps: 0, range: 90, speed: 26,
            role: "support", shape: "humanoid", color: "#b094c9", heal: 22,
            unlock: "wave:7",
            desc: "Heals the friendly unit ahead of it. Pair with a Bulwark."
        },
        drone: {
            name: "Relay Drone", icon: "🛩", cost: 5, hp: 180, dps: 46, range: 130, speed: 46,
            role: "ranged", shape: "drone", color: "#65baff", flying: true,
            unlock: "research:drones",
            desc: "Flies. Ground melee units cannot reach it; towers still can."
        },
        warden: {
            name: "Warden", icon: "⚔", cost: 6, hp: 620, dps: 58, range: 24, speed: 23,
            role: "melee", shape: "heavy", color: "#ffc247", armour: 0.2,
            unlock: "research:wardens",
            desc: "The anchor of a late deck. Expensive, but very hard to shift."
        },
        pulseTower: {
            name: "Pulse Emitter", icon: "⚡", cost: 5, hp: 300, dps: 40, range: 120, speed: 0,
            role: "structure", shape: "tower", color: "#aa8cff", splash: true,
            unlock: "research:pulse",
            desc: "A deployable turret. Does not advance; hits everything in range."
        }
    };

    // Enemies. Deliberately simpler than the player roster: the interest comes
    // from the composition of a wave rather than from each enemy's kit.
    const ENEMIES = {
        husk:     { name: "Husk",      hp: 120, dps: 20, range: 18,  speed: 26, role: "melee",  shape: "humanoid", color: "#7a6a62" },
        raider:   { name: "Raider",    hp: 180, dps: 30, range: 20,  speed: 32, role: "melee",  shape: "humanoid", color: "#a2656f" },
        slinger:  { name: "Slinger",   hp: 110, dps: 26, range: 104, speed: 24, role: "ranged", shape: "humanoid", color: "#8a7fa8" },
        breaker:  { name: "Breaker",   hp: 460, dps: 44, range: 22,  speed: 18, role: "siege",  shape: "heavy",    color: "#6b5a4a", armour: 0.25 },
        stalker:  { name: "Stalker",   hp: 150, dps: 38, range: 18,  speed: 52, role: "melee",  shape: "beast",    color: "#5c6b52" },
        screamer: { name: "Screamer",  hp: 220, dps: 30, range: 118, speed: 28, role: "ranged", shape: "beast",    color: "#9a5a7a", flying: true }
    };

    const BOSSES = {
        warlord:  { name: "Ashfall Warlord",  hp: 2600,  dps: 78,  range: 30, speed: 16, role: "melee", shape: "boss", color: "#c2563f", armour: 0.3,
                    ability: "slam",  desc: "Slams the ground, damaging everything near it." },
        harvester:{ name: "Depot Harvester",  hp: 5200,  dps: 96,  range: 36, speed: 14, role: "siege", shape: "boss", color: "#5d8a55", armour: 0.35,
                    ability: "drain", desc: "Drains your charge meter while it lives." },
        forgelord:{ name: "Forge Colossus",   hp: 9400,  dps: 128, range: 40, speed: 13, role: "melee", shape: "boss", color: "#d08a32", armour: 0.4,
                    ability: "burn",  desc: "Leaves burning ground behind it." },
        signal:   { name: "Signal Tyrant",    hp: 16800, dps: 150, range: 128, speed: 15, role: "ranged", shape: "boss", color: "#5b8fd6", armour: 0.35,
                    ability: "jam",   desc: "Jams one of your cards at a time." },
        guardian: { name: "Citadel Guardian", hp: 30000, dps: 190, range: 46, speed: 14, role: "melee", shape: "boss", color: "#9a7ad6", armour: 0.45,
                    ability: "shield", desc: "Raises a shield that must be broken before it takes damage." }
    };

    // ---------------------------------------------------------------
    // Arena geometry
    //
    // World units, not pixels: the arena is 1000 long and 3 lanes wide, and
    // the renderer scales that to whatever the canvas is.
    // ---------------------------------------------------------------

    const ARENA = { length: 1000, lanes: 3, playerX: 46, enemyX: 918 };

    function laneY(lane) { return (lane + 0.5) / ARENA.lanes; }

    // ---------------------------------------------------------------
    // Runtime state
    // ---------------------------------------------------------------

    const battle = {
        active: false,
        over: false,
        result: null,
        wave: 1,
        endless: false,
        charge: 5,
        chargeMax: 10,
        chargeRate: 0.55,          // per second
        units: [],
        projectiles: [],
        effects: [],
        damageNumbers: [],
        towers: [],
        core: null,
        enemyCore: null,
        spawnQueue: [],
        elapsed: 0,
        lastFrame: 0,
        raf: null,
        running: false,
        selectedCard: null,
        selectedLane: 1,
        nextId: 1,
        shake: 0,
        boss: null,
        jammed: null,
        message: "",
        messageUntil: 0,
        rewardSummary: null
    };

    const view = {
        canvas: null, ctx: null, width: 0, height: 0, dpr: 1,
        mounted: false, tab: "campaign", hoverLane: null
    };

    function say(text) {
        battle.message = text;
        battle.messageUntil = performance.now() + 2200;
    }

    // ---------------------------------------------------------------
    // Progression helpers
    // ---------------------------------------------------------------

    function unitLevel(id) {
        const state = exp();
        return Math.max(1, Math.floor(state?.combat.unitLevels[id] || 1));
    }

    function unitUnlocked(id) {
        const def = UNITS[id];
        if (!def) return false;
        if (!def.unlock) return true;
        const state = exp();
        if (!state) return false;
        if (state.combat.unitsUnlocked[id]) return true;
        const [kind, value] = def.unlock.split(":");
        if (kind === "wave") return (state.combat.bestWave || 0) >= Number(value);
        if (kind === "research") return !!state.research.unlocked[value];
        return false;
    }

    // Levels scale both sides of a unit's statline so a levelled deck stays
    // meaningful against later waves without becoming a different unit.
    function unitStats(id, level = unitLevel(id)) {
        const def = UNITS[id];
        if (!def) return null;
        const scale = Math.pow(1.14, level - 1);
        return {
            ...def,
            hp: Math.round(def.hp * scale),
            dps: Math.round(def.dps * scale * 10) / 10,
            heal: def.heal ? Math.round(def.heal * scale) : 0,
            level
        };
    }

    function unitUpgradeCost(id) {
        const level = unitLevel(id);
        const def = UNITS[id];
        return Math.ceil((def.cost * 600) * Math.pow(1.7, level - 1));
    }

    function deck() {
        const state = exp();
        if (!state) return [];
        const chosen = state.combat.deck.filter(id => UNITS[id] && unitUnlocked(id));
        if (chosen.length) return chosen.slice(0, 6);
        // A sensible starting hand for a player who has not built a deck.
        return Object.keys(UNITS).filter(unitUnlocked).slice(0, 4);
    }

    function toggleDeckCard(id) {
        const state = exp();
        if (!state || !UNITS[id] || !unitUnlocked(id)) return;
        const current = state.combat.deck.filter(entry => UNITS[entry]);
        const at = current.indexOf(id);
        if (at >= 0) current.splice(at, 1);
        else {
            if (current.length >= 6) { say("A deck holds six cards. Remove one first."); EX().sfx("uiDenied"); return; }
            current.push(id);
        }
        state.combat.deck = current;
        EX().sfx("uiTap");
        EX().save();
        renderDeck();
    }

    function upgradeUnit(id) {
        const state = exp();
        const g = liveGame();
        if (!state || !g || !UNITS[id]) return;
        if (!unitUnlocked(id)) { say("Unlock this unit first."); return; }
        const cost = unitUpgradeCost(id);
        if ((g.salvage || 0) < cost) { say("Needs " + fmt(cost) + " Salvage."); EX().sfx("uiDenied"); return; }
        g.salvage -= cost;
        state.combat.unitLevels[id] = unitLevel(id) + 1;
        EX().sfx("bigReward");
        say(UNITS[id].name + " is now level " + unitLevel(id));
        EX().logEvent(UNITS[id].name + " upgraded to level " + unitLevel(id) + ".", "good");
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        renderDeck();
    }

    // ---------------------------------------------------------------
    // Waves
    //
    // Composition is derived from the wave number rather than hand-authored,
    // so the campaign never runs out, but the mix is deliberate: melee first,
    // ranged from wave 2, siege from 4, fliers from 6.
    // ---------------------------------------------------------------

    function waveBoss(wave) {
        if (wave % 5 !== 0) return null;
        const order = ["warlord", "harvester", "forgelord", "signal", "guardian"];
        return order[Math.min(order.length - 1, Math.floor(wave / 5) - 1)];
    }

    function waveComposition(wave) {
        const budget = 4 + wave * 2.4;
        const pool = [["husk", 1]];
        if (wave >= 2) pool.push(["slinger", 1.3]);
        if (wave >= 3) pool.push(["raider", 1.5]);
        if (wave >= 4) pool.push(["breaker", 3.4]);
        if (wave >= 5) pool.push(["stalker", 1.4]);
        if (wave >= 6) pool.push(["screamer", 2.2]);

        const spawns = [];
        let spent = 0;
        let cursor = 0;
        // Deterministic from the wave number, so a wave is the same fight for
        // everyone and can be practised.
        let seed = (wave * 2654435761) >>> 0;
        const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

        while (spent < budget && spawns.length < 46) {
            const [id, weight] = pool[Math.floor(next() * pool.length)];
            spent += weight;
            cursor += 900 + next() * 900;
            spawns.push({ id, at: cursor, lane: Math.floor(next() * ARENA.lanes), boss: false });
        }
        const boss = waveBoss(wave);
        if (boss) spawns.push({ id: boss, at: 2600, lane: 1, boss: true });
        return spawns.sort((a, b) => a.at - b.at);
    }

    function waveScaling(wave) {
        // Enemy statline growth. Kept gentle so unit levels and city defenses
        // can keep pace.
        return { hp: Math.pow(1.17, wave - 1), dps: Math.pow(1.13, wave - 1) };
    }

    // ---------------------------------------------------------------
    // City contribution
    //
    // Towers the player actually built. With no defenses at all they still get
    // one weak core tower, so a first battle is possible but clearly harder.
    // ---------------------------------------------------------------

    function cityDefense() {
        const stats = EX().cityStats();
        const value = stats.combatValue || 0;
        return {
            towerHp: 400 + value * 26,
            towerDps: 12 + value * 1.5,
            coreHp: 900 + (stats.security || 0) * 14,
            turrets: Math.max(1, Math.min(3, Math.round(value / 14) || 1))
        };
    }

    function companionBonus() {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return { hp: 1, dps: 1, name: null };
        const petId = state.pets?.assignments?.combat;
        if (!petId || !(g.adventure?.collection?.[petId] > 0)) return { hp: 1, dps: 1, name: null };
        const level = Math.max(1, state.pets.levels[petId] || 1);
        let name = "Companion";
        try {
            if (typeof petInfo === "function" && typeof ZONE_PETS !== "undefined") {
                const info = petInfo(petId);
                if (info && ZONE_PETS[info.stage]?.[info.rarity]) name = ZONE_PETS[info.stage][info.rarity][0];
            }
        } catch (_) { /* decorative */ }
        return { hp: 1 + level * 0.03, dps: 1 + level * 0.04, name };
    }

    // ---------------------------------------------------------------
    // Battle setup
    // ---------------------------------------------------------------

    function spawnEntity(options) {
        const entity = {
            id: battle.nextId++,
            side: options.side,
            key: options.key,
            name: options.name,
            x: options.x,
            lane: options.lane,
            hp: options.hp,
            maxHp: options.hp,
            dps: options.dps,
            range: options.range,
            speed: options.speed,
            role: options.role,
            shape: options.shape,
            color: options.color,
            armour: options.armour || 0,
            flying: !!options.flying,
            heal: options.heal || 0,
            splash: !!options.splash,
            boss: !!options.boss,
            ability: options.ability || null,
            abilityAt: 0,
            target: null,
            attackAt: 0,
            spawnAt: battle.elapsed,
            shieldHp: options.shieldHp || 0,
            level: options.level || 1
        };
        battle.units.push(entity);
        return entity;
    }

    function startBattle({ wave = null, endless = false } = {}) {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return false;
        if (!started()) { say("Press PLAY first."); return false; }
        if (battle.active) { say("A battle is already running."); return false; }

        const defense = cityDefense();
        const pet = companionBonus();

        battle.active = true;
        battle.over = false;
        battle.result = null;
        battle.endless = endless;
        battle.wave = endless ? Math.max(1, (state.combat.bestWave || 0) + 1) : (wave || nextCampaignWave());
        battle.charge = 5;
        battle.chargeMax = 10;
        battle.units = [];
        battle.projectiles = [];
        battle.effects = [];
        battle.damageNumbers = [];
        battle.elapsed = 0;
        battle.lastFrame = 0;
        battle.nextId = 1;
        battle.shake = 0;
        battle.boss = null;
        battle.jammed = null;
        battle.rewardSummary = null;
        battle.spawnQueue = waveComposition(battle.wave);
        battle.selectedCard = deck()[0] || null;

        // Player core and towers
        battle.core = {
            side: "player", hp: defense.coreHp, maxHp: defense.coreHp, x: ARENA.playerX - 4, lane: 1
        };
        battle.towers = [];
        for (let i = 0; i < defense.turrets; i++) {
            const lane = defense.turrets === 1 ? 1 : i % ARENA.lanes;
            battle.towers.push({
                side: "player", lane,
                x: ARENA.playerX + 54 + i * 7,
                hp: defense.towerHp, maxHp: defense.towerHp,
                dps: defense.towerDps, range: 130, attackAt: 0
            });
        }
        battle.enemyCore = {
            side: "enemy",
            hp: 600 + battle.wave * 220,
            maxHp: 600 + battle.wave * 220,
            x: ARENA.enemyX + 22, lane: 1
        };

        // The assigned companion joins the fight as a free unit.
        if (pet.name) {
            spawnEntity({
                side: "player", key: "companion", name: pet.name,
                x: ARENA.playerX + 96, lane: 1,
                hp: Math.round(260 * pet.hp), dps: Math.round(32 * pet.dps),
                range: 96, speed: 30, role: "ranged", shape: "beast", color: "#5bd69b"
            });
        }

        view.tab = "battle";
        global.LastCityAudio?.playMusic?.("combat", { fade: 1.2 });
        EX().sfx("waveIncoming");
        say("Wave " + battle.wave + " incoming");
        EX().logEvent("Wave " + battle.wave + " began.", "combat");
        startLoop();
        render();
        return true;
    }

    function nextCampaignWave() {
        const state = exp();
        return Math.max(1, (state?.combat.wavesCleared || 0) + 1);
    }

    function endBattle(result) {
        if (!battle.active || battle.over) return;
        battle.over = true;
        battle.active = false;
        battle.result = result;
        const state = exp();
        if (state) state.combat.lastResult = result;

        if (result === "win") {
            EX().sfx("victory");
            global.LastCityAudio?.playMusic?.("victory", { fade: 0.6 });
            grantWaveRewards(battle.wave);
        } else {
            EX().sfx("defeat");
            global.LastCityAudio?.stopMusic?.(1);
            if (state) state.combat.losses++;
            // Whatever got through hits the city for real.
            const leaked = battle.units.filter(unit => unit.side === "enemy").length;
            const damage = 30 + leaked * 18 + battle.wave * 6;
            EX().emit("combat:raid-damage", { amount: damage, wave: battle.wave });
            EX().logEvent("Wave " + battle.wave + " broke through. The city took damage.", "bad");
            say("The wave broke through. Repair your structures in the City tab.");
        }
        stopLoop();
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
        render();
    }

    // Campaign rewards pay once per wave, guarded by a flag. Endless pays a
    // smaller, repeatable amount so it is practice rather than a farm.
    function grantWaveRewards(wave) {
        const state = exp();
        const g = liveGame();
        if (!state || !g) return;
        const key = "wave" + wave;
        const firstTime = !battle.endless && !state.combat.rewarded[key];

        state.combat.wavesCleared = battle.endless
            ? state.combat.wavesCleared
            : Math.max(state.combat.wavesCleared, wave);
        state.combat.bestWave = Math.max(state.combat.bestWave || 0, wave);

        const boss = waveBoss(wave);
        if (boss) state.combat.bossesDefeated[boss] = true;

        const multiplier = firstTime ? 1 : 0.3;
        const zones = zonesTable();
        const stage = Math.min(5, Math.max(1, stageView()));
        const currency = zones?.[stage]?.currency || "salvage";

        // Paid in the currency of the zone the player is standing in, scaled
        // from that zone's own production so it is always a meaningful but
        // never a game-breaking amount.
        const rate = typeof global.zoneRate === "function" ? Math.max(1, global.zoneRate(stage)) : 10;
        const payout = Math.ceil(rate * (35 + wave * 9) * multiplier);
        const research = Math.ceil((8 + wave * 2.5) * multiplier);

        g[currency] = (g[currency] || 0) + payout;
        if (stage === 1) {
            g.totalSalvage += payout;
            g.lifetimeSalvage += payout;
        }
        state.research.points += research;
        state.research.lifetimePoints += research;

        let tokens = 0;
        if (boss && firstTime) {
            tokens = 4 + Math.floor(wave / 5) * 2;
            const tokenKey = { 1: "shards", 2: "scrapTokens", 3: "partTokens", 4: "networkTokens", 5: "ascensionTokens" }[stage];
            if (tokenKey) g[tokenKey] = (g[tokenKey] || 0) + tokens;
        }

        if (firstTime) state.combat.rewarded[key] = true;

        battle.rewardSummary = {
            wave, payout, research, tokens,
            label: zones?.[stage]?.label || "Salvage",
            firstTime, boss: boss ? BOSSES[boss].name : null
        };

        EX().logEvent("Wave " + wave + " cleared: +" + fmt(payout) + " " +
            (zones?.[stage]?.label || "Salvage") + ", +" + research + " research.", "good");
        say("Wave " + wave + " cleared!");

        if (boss && firstTime) {
            EX().emit("combat:boss", { boss, wave });
        }
    }

    function retreat() {
        if (!battle.active) return;
        say("Retreated. No rewards, no damage.");
        battle.over = true;
        battle.active = false;
        battle.result = "retreat";
        stopLoop();
        global.LastCityAudio?.stopMusic?.(0.8);
        render();
    }

    // ---------------------------------------------------------------
    // Deployment
    // ---------------------------------------------------------------

    function deployUnit(id, lane) {
        if (!battle.active || battle.over) return false;
        const def = UNITS[id];
        if (!def || !unitUnlocked(id)) return false;
        if (battle.jammed === id) { say(def.name + " is jammed."); EX().sfx("uiDenied"); return false; }
        if (battle.charge < def.cost) { say("Not enough charge."); EX().sfx("uiDenied"); return false; }
        const stats = unitStats(id);
        const pet = companionBonus();
        battle.charge -= def.cost;
        const entity = spawnEntity({
            side: "player", key: id, name: stats.name,
            x: ARENA.playerX + 84,
            lane: Math.max(0, Math.min(ARENA.lanes - 1, lane)),
            hp: Math.round(stats.hp * pet.hp),
            dps: stats.dps * pet.dps,
            range: stats.range, speed: stats.speed, role: stats.role,
            shape: stats.shape, color: stats.color, armour: stats.armour,
            flying: stats.flying, heal: stats.heal, splash: stats.splash,
            level: stats.level
        });
        addEffect("deploy", entity.x, entity.lane, stats.color);
        EX().sfx("deployUnit");
        return true;
    }

    function addEffect(kind, x, lane, color, extra = {}) {
        if (!EX().motionAllowed() && kind !== "hit") return;
        if (battle.effects.length > 90) battle.effects.shift();
        battle.effects.push({ kind, x, lane, color, born: battle.elapsed, ms: extra.ms || 420, ...extra });
    }

    function addDamageNumber(x, lane, amount, color) {
        if (!EX().motionAllowed()) return;
        if (battle.damageNumbers.length > 40) battle.damageNumbers.shift();
        battle.damageNumbers.push({ x, lane, amount: Math.round(amount), color, born: battle.elapsed, ms: 700 });
    }

    // ---------------------------------------------------------------
    // Simulation
    //
    // Fixed 60Hz steps, accumulated from the frame delta, so the fight plays
    // out identically regardless of display refresh rate.
    // ---------------------------------------------------------------

    const STEP_MS = 1000 / 60;
    let accumulator = 0;

    function applyDamage(entity, amount, source) {
        if (!entity || entity.hp <= 0) return;
        let damage = amount * (1 - (entity.armour || 0));
        if (entity.shieldHp > 0) {
            const absorbed = Math.min(entity.shieldHp, damage);
            entity.shieldHp -= absorbed;
            damage -= absorbed;
            if (entity.shieldHp <= 0) {
                EX().sfx("shieldBreak");
                addEffect("shield-break", entity.x, entity.lane, "#aa8cff", { ms: 520 });
            }
        }
        if (damage <= 0) return;
        entity.hp -= damage;
        addDamageNumber(entity.x, entity.lane, damage, entity.side === "enemy" ? "#ffc247" : "#ff8b35");
        if (entity.hp <= 0) {
            entity.hp = 0;
            onDeath(entity, source);
        }
    }

    function onDeath(entity, source) {
        addEffect("death", entity.x, entity.lane, entity.color, { ms: 520 });
        EX().sfx(entity.boss ? "explosion" : "unitDown");
        if (entity.side === "enemy") {
            const state = exp();
            if (state) state.combat.totalKills++;
            // Killing feeds a little charge back, which rewards defending well.
            battle.charge = Math.min(battle.chargeMax, battle.charge + (entity.boss ? 3 : 0.35));
        }
        void source;
    }

    function livingUnits(side) {
        return battle.units.filter(unit => unit.side === side && unit.hp > 0);
    }

    function findTarget(unit) {
        const enemySide = unit.side === "player" ? "enemy" : "player";
        const forward = unit.side === "player" ? 1 : -1;

        // Siege units ignore bodies and walk for the structures.
        if (unit.role !== "siege") {
            let best = null, bestDistance = Infinity;
            for (const other of battle.units) {
                if (other.side !== enemySide || other.hp <= 0) continue;
                // Ground melee cannot reach fliers.
                if (other.flying && unit.role === "melee" && !unit.flying) continue;
                const gap = (other.x - unit.x) * forward;
                if (gap < -30) continue;                       // already behind us
                const laneGap = Math.abs(other.lane - unit.lane);
                if (laneGap > 1) continue;                     // only adjacent lanes
                const distance = Math.abs(other.x - unit.x) + laneGap * 60;
                if (distance < bestDistance) { bestDistance = distance; best = other; }
            }
            if (best) return best;
        }

        // Structures
        const structures = [];
        if (unit.side === "player") {
            if (battle.enemyCore.hp > 0) structures.push(battle.enemyCore);
        } else {
            for (const tower of battle.towers) if (tower.hp > 0) structures.push(tower);
            if (battle.core.hp > 0) structures.push(battle.core);
        }
        let best = null, bestDistance = Infinity;
        for (const structure of structures) {
            const distance = Math.abs(structure.x - unit.x) + Math.abs((structure.lane ?? 1) - unit.lane) * 40;
            if (distance < bestDistance) { bestDistance = distance; best = structure; }
        }
        return best;
    }

    function stepUnit(unit, dt) {
        if (unit.hp <= 0) return;

        // Support units heal instead of attacking.
        if (unit.role === "support") {
            const forward = unit.side === "player" ? 1 : -1;
            let ahead = null, bestGap = Infinity;
            for (const friend of battle.units) {
                if (friend.side !== unit.side || friend.hp <= 0 || friend === unit) continue;
                const gap = (friend.x - unit.x) * forward;
                if (gap <= 0 || gap > unit.range) continue;
                if (friend.hp >= friend.maxHp) continue;
                if (gap < bestGap) { bestGap = gap; ahead = friend; }
            }
            if (ahead) {
                if (battle.elapsed >= unit.attackAt) {
                    unit.attackAt = battle.elapsed + 1000;
                    ahead.hp = Math.min(ahead.maxHp, ahead.hp + unit.heal);
                    addEffect("heal", ahead.x, ahead.lane, "#5bd69b", { ms: 480 });
                    EX().sfx("ability");
                }
            } else {
                unit.x += unit.speed * dt * (unit.side === "player" ? 1 : -1);
            }
            return;
        }

        if (unit.role === "structure") {
            // Deployed turret: never moves, shoots anything in range.
            const target = findTarget(unit);
            if (target && Math.abs(target.x - unit.x) <= unit.range) fire(unit, target);
            return;
        }

        const target = findTarget(unit);
        unit.target = target;
        if (!target) {
            unit.x += unit.speed * dt * (unit.side === "player" ? 1 : -1);
            return;
        }
        const distance = Math.abs(target.x - unit.x);
        if (distance > unit.range) {
            unit.x += unit.speed * dt * (unit.side === "player" ? 1 : -1);
            // Drift toward the target's lane so fights converge instead of
            // units walking past each other forever.
            if (target.lane !== undefined && target.lane !== unit.lane && Math.random() < dt * 0.6) {
                unit.lane += Math.sign(target.lane - unit.lane);
            }
        } else {
            fire(unit, target);
        }

        // Boss abilities
        if (unit.boss && unit.ability && battle.elapsed >= unit.abilityAt) {
            unit.abilityAt = battle.elapsed + 7000;
            useBossAbility(unit);
        }
    }

    function fire(unit, target) {
        if (battle.elapsed < unit.attackAt) return;
        const interval = 900;
        unit.attackAt = battle.elapsed + interval;
        const damage = unit.dps * (interval / 1000);
        if (unit.range > 60) {
            battle.projectiles.push({
                x: unit.x, lane: unit.lane, targetId: target.id ?? -1,
                target, damage, color: unit.color,
                speed: 420, side: unit.side, splash: unit.splash
            });
            EX().sfx("rangedShot");
        } else {
            applyDamage(target, damage, unit);
            addEffect("hit", target.x, target.lane ?? unit.lane, "#ffd27a", { ms: 220 });
            EX().sfx("meleeHit");
        }
    }

    function useBossAbility(boss) {
        EX().sfx("bossRoar");
        battle.shake = 12;
        if (boss.ability === "slam") {
            for (const unit of livingUnits("player")) {
                if (Math.abs(unit.x - boss.x) < 120) applyDamage(unit, boss.dps * 1.2, boss);
            }
            addEffect("slam", boss.x, boss.lane, "#ff8b35", { ms: 620 });
        } else if (boss.ability === "drain") {
            battle.charge = Math.max(0, battle.charge - 3);
            addEffect("drain", boss.x, boss.lane, "#5d8a55", { ms: 620 });
            say("The Harvester drained your charge.");
        } else if (boss.ability === "burn") {
            addEffect("burn", boss.x - 60, boss.lane, "#d08a32", { ms: 4000, damage: boss.dps * 0.3 });
        } else if (boss.ability === "jam") {
            const hand = deck();
            battle.jammed = hand[Math.floor(Math.random() * hand.length)] || null;
            say(battle.jammed ? UNITS[battle.jammed].name + " jammed!" : "Signal interference!");
            global.setTimeout(() => { if (battle.jammed) battle.jammed = null; }, 6000);
        } else if (boss.ability === "shield") {
            boss.shieldHp = boss.maxHp * 0.25;
            addEffect("shield", boss.x, boss.lane, "#aa8cff", { ms: 700 });
            say("The Guardian raised its shield.");
        }
    }

    function stepTowers(dt) {
        for (const tower of battle.towers) {
            if (tower.hp <= 0) continue;
            let best = null, bestDistance = Infinity;
            for (const enemy of livingUnits("enemy")) {
                const distance = Math.abs(enemy.x - tower.x) + Math.abs(enemy.lane - tower.lane) * 50;
                if (distance > tower.range) continue;
                if (distance < bestDistance) { bestDistance = distance; best = enemy; }
            }
            if (best && battle.elapsed >= tower.attackAt) {
                tower.attackAt = battle.elapsed + 1000;
                battle.projectiles.push({
                    x: tower.x, lane: tower.lane, target: best, targetId: best.id,
                    damage: tower.dps, color: "#65baff", speed: 520, side: "player"
                });
            }
        }
        void dt;
    }

    function stepProjectiles(dt) {
        for (let i = battle.projectiles.length - 1; i >= 0; i--) {
            const shot = battle.projectiles[i];
            const target = shot.target;
            if (!target || target.hp <= 0) { battle.projectiles.splice(i, 1); continue; }
            const direction = Math.sign(target.x - shot.x) || 1;
            shot.x += direction * shot.speed * dt;
            if (Math.abs(target.x - shot.x) <= 14) {
                applyDamage(target, shot.damage, null);
                if (shot.splash) {
                    for (const other of battle.units) {
                        if (other === target || other.side === shot.side || other.hp <= 0) continue;
                        if (Math.abs(other.x - target.x) < 70) applyDamage(other, shot.damage * 0.5, null);
                    }
                    addEffect("splash", target.x, target.lane ?? shot.lane, shot.color, { ms: 380 });
                }
                addEffect("hit", target.x, target.lane ?? shot.lane, shot.color, { ms: 200 });
                battle.projectiles.splice(i, 1);
            }
        }
    }

    function stepEffects() {
        for (let i = battle.effects.length - 1; i >= 0; i--) {
            const effect = battle.effects[i];
            if (battle.elapsed - effect.born >= effect.ms) { battle.effects.splice(i, 1); continue; }
            // Burning ground keeps hurting whatever stands in it.
            if (effect.kind === "burn" && effect.damage) {
                for (const unit of livingUnits("player")) {
                    if (Math.abs(unit.x - effect.x) < 70) applyDamage(unit, effect.damage * (STEP_MS / 1000), null);
                }
            }
        }
        for (let i = battle.damageNumbers.length - 1; i >= 0; i--) {
            if (battle.elapsed - battle.damageNumbers[i].born >= battle.damageNumbers[i].ms) {
                battle.damageNumbers.splice(i, 1);
            }
        }
    }

    function stepSpawns() {
        while (battle.spawnQueue.length && battle.spawnQueue[0].at <= battle.elapsed) {
            const spawn = battle.spawnQueue.shift();
            const scaling = waveScaling(battle.wave);
            const def = spawn.boss ? BOSSES[spawn.id] : ENEMIES[spawn.id];
            if (!def) continue;
            const entity = spawnEntity({
                side: "enemy", key: spawn.id, name: def.name,
                x: ARENA.enemyX - 10, lane: spawn.lane,
                hp: Math.round(def.hp * (spawn.boss ? 1 : scaling.hp)),
                dps: def.dps * (spawn.boss ? 1 : scaling.dps),
                range: def.range, speed: def.speed, role: def.role,
                shape: def.shape, color: def.color, armour: def.armour,
                flying: def.flying, boss: spawn.boss, ability: def.ability
            });
            if (spawn.boss) {
                battle.boss = entity;
                entity.abilityAt = battle.elapsed + 4000;
                EX().sfx("bossRoar");
                battle.shake = 16;
                say(def.name + " has arrived.");
            }
        }
    }

    function step() {
        const dt = STEP_MS / 1000;
        battle.elapsed += STEP_MS;

        battle.charge = Math.min(battle.chargeMax, battle.charge + battle.chargeRate * dt);

        stepSpawns();
        for (const unit of battle.units) stepUnit(unit, dt);
        stepTowers(dt);
        stepProjectiles(dt);
        stepEffects();

        // Clear the dead, but leave bosses on screen for a beat so the kill
        // reads before the arena empties.
        battle.units = battle.units.filter(unit => unit.hp > 0 || (unit.boss && battle.elapsed - unit.spawnAt < 1e9 && unit.hp > 0));

        if (battle.shake > 0.3) battle.shake *= 0.92;

        // Win: every spawn dealt with and the enemy core destroyed, or simply
        // the whole wave killed.
        const enemiesLeft = livingUnits("enemy").length + battle.spawnQueue.length;
        if (enemiesLeft === 0) { endBattle("win"); return; }
        if (battle.core.hp <= 0) { endBattle("loss"); return; }

        // A long stalemate ends as a loss rather than running forever.
        if (battle.elapsed > 240000) { endBattle("loss"); }
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    function resizeCanvas() {
        if (!view.canvas) return;
        const rect = view.canvas.getBoundingClientRect();
        const width = Math.max(260, Math.round(rect.width));
        const height = Math.max(180, Math.round(rect.height));
        const dpr = Math.min(2, global.devicePixelRatio || 1);
        if (view.width === width && view.height === height && view.dpr === dpr) return;
        view.width = width;
        view.height = height;
        view.dpr = dpr;
        view.canvas.width = Math.round(width * dpr);
        view.canvas.height = Math.round(height * dpr);
    }

    // Arena space -> canvas space.
    function px(x) { return (x / ARENA.length) * view.width; }
    const LANE_TOP = 0.3;
    const LANE_SPAN = 0.62;
    function py(lane) {
        return view.height * LANE_TOP + ((lane + 0.5) / ARENA.lanes) * view.height * LANE_SPAN;
    }
    function laneHeight() { return (view.height * LANE_SPAN) / ARENA.lanes; }
    function laneFromY(y) {
        const local = (y - view.height * LANE_TOP) / (view.height * LANE_SPAN);
        return Math.max(0, Math.min(ARENA.lanes - 1, Math.floor(local * ARENA.lanes)));
    }

    function drawArena(ctx) {
        const g = liveGame();
        let stage = 1;
        if (g) {
            if (g.stage5Unlocked) stage = 5;
            else if (g.stage4Unlocked) stage = 4;
            else if (g.stage3Unlocked) stage = 3;
            else if (g.stage2Unlocked) stage = 2;
        }
        const skies = {
            1: ["#2a1d1b", "#140f12"], 2: ["#172318", "#0d1410"],
            3: ["#2a1a12", "#140d0a"], 4: ["#111b2e", "#0a0f1a"], 5: ["#1a1430", "#0d0a18"]
        }[stage];

        const sky = ctx.createLinearGradient(0, 0, 0, view.height);
        sky.addColorStop(0, skies[0]);
        sky.addColorStop(1, skies[1]);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, view.width, view.height);

        const top = view.height * LANE_TOP;
        const usable = view.height * LANE_SPAN;

        // Ruined skyline on the horizon, lit from behind.
        const glow = ctx.createLinearGradient(0, top - view.height * 0.22, 0, top);
        glow.addColorStop(0, "rgba(0,0,0,0)");
        glow.addColorStop(1, "rgba(255,150,80,.09)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, top - view.height * 0.22, view.width, view.height * 0.22);
        ctx.fillStyle = "rgba(0,0,0,.5)";
        for (let i = 0; i < 18; i++) {
            const seed = ((i * 73) % 100) / 100;
            const w = view.width * (0.035 + seed * 0.055);
            const h = view.height * (0.06 + seed * 0.2);
            ctx.fillRect(i * view.width / 18 - w * 0.2, top - h, w, h);
        }

        // Lane bands. Alternating tone plus a dashed divider, so three lanes
        // are obvious at a glance on any screen size.
        for (let lane = 0; lane < ARENA.lanes; lane++) {
            const y = top + (lane / ARENA.lanes) * usable;
            const height = usable / ARENA.lanes;
            ctx.fillStyle = lane % 2 === 0 ? "rgba(188,205,225,.07)" : "rgba(188,205,225,.035)";
            ctx.fillRect(0, y, view.width, height);
            if (view.hoverLane === lane && battle.active) {
                ctx.fillStyle = "rgba(101,186,255,.1)";
                ctx.fillRect(0, y, view.width, height);
            }
            if (lane > 0) {
                ctx.strokeStyle = "rgba(255,255,255,.14)";
                ctx.lineWidth = 1;
                ctx.setLineDash([8, 9]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(view.width, y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        // Rubble strip below the lanes, for depth.
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(0, top + usable, view.width, view.height - top - usable);
        ctx.fillStyle = "rgba(255,255,255,.03)";
        for (let i = 0; i < 26; i++) {
            const seed = ((i * 37) % 100) / 100;
            ctx.fillRect(seed * view.width, top + usable + seed * (view.height - top - usable) * 0.7,
                6 + seed * 14, 3 + seed * 4);
        }

        // Deployment zone
        const zoneEnd = px(ARENA.playerX + 92);
        const zone = ctx.createLinearGradient(0, 0, zoneEnd, 0);
        zone.addColorStop(0, "rgba(91,214,155,.16)");
        zone.addColorStop(1, "rgba(91,214,155,0)");
        ctx.fillStyle = zone;
        ctx.fillRect(0, top, zoneEnd, usable);
        ctx.strokeStyle = "rgba(91,214,155,.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(zoneEnd, top);
        ctx.lineTo(zoneEnd, top + usable);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(91,214,155,.55)";
        ctx.font = "600 9px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("DEPLOY ZONE", 8, top + usable - 6);
    }

    // Lighten (amount > 0) or darken (amount < 0) a hex colour.
    function shadeHex(hex, amount) {
        const value = String(hex || "#888888").replace("#", "");
        const full = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
        const num = parseInt(full, 16);
        if (!Number.isFinite(num)) return hex;
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        if (amount >= 0) { r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount; }
        else { r *= 1 + amount; g *= 1 + amount; b *= 1 + amount; }
        return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
    }

    function healthBar(ctx, x, y, width, ratio, color, shieldRatio = 0) {
        const height = Math.max(3, Math.min(5, width * 0.12));
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillRect(x - width / 2, y, width, height);
        ctx.fillStyle = color;
        ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height);
        if (shieldRatio > 0) {
            ctx.fillStyle = "rgba(170,140,255,.85)";
            ctx.fillRect(x - width / 2, y - 3, width * Math.min(1, shieldRatio), 2);
        }
    }

    function drawFighter(ctx, unit) {
        const x = px(unit.x);
        const y = py(unit.lane);
        const scale = unit.boss ? 1.9 : unit.shape === "heavy" ? 1.28 : 1;
        const size = Math.max(18, laneHeight() * 0.62) * scale;
        const facing = unit.side === "player" ? 1 : -1;
        const bob = unit.speed > 0 ? Math.sin(battle.elapsed * 0.012 + unit.id) * size * 0.08 : 0;

        ctx.save();
        // Shadow
        ctx.fillStyle = "rgba(0,0,0,.26)";
        ctx.beginPath();
        ctx.ellipse(x, y + size * 0.42, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        if (unit.flying) ctx.translate(0, -size * 0.55 + Math.sin(battle.elapsed * 0.006 + unit.id) * 3);

        if (unit.shape === "drone") {
            ctx.fillStyle = unit.color;
            ctx.beginPath();
            ctx.ellipse(x, y + bob, size * 0.4, size * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,.5)";
            ctx.lineWidth = 1.2;
            const spin = battle.elapsed * 0.04;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.ellipse(x + side * size * 0.42, y + bob - size * 0.1,
                    size * 0.2 * Math.abs(Math.cos(spin)), size * 0.06, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (unit.shape === "beast") {
            ctx.fillStyle = unit.color;
            ctx.beginPath();
            ctx.ellipse(x, y + bob, size * 0.42, size * 0.26, 0, 0, Math.PI * 2);
            ctx.fill();
            // Head and tail
            ctx.beginPath();
            ctx.arc(x + facing * size * 0.4, y + bob - size * 0.12, size * 0.17, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = unit.color;
            ctx.lineWidth = size * 0.1;
            ctx.beginPath();
            ctx.moveTo(x - facing * size * 0.4, y + bob);
            ctx.lineTo(x - facing * size * 0.62, y + bob - size * 0.2);
            ctx.stroke();
        } else if (unit.shape === "tower") {
            ctx.fillStyle = unit.color;
            ctx.fillRect(x - size * 0.26, y - size * 0.7, size * 0.52, size * 1.2);
            ctx.fillStyle = "rgba(255,255,255,.22)";
            ctx.fillRect(x - size * 0.26, y - size * 0.7, size * 0.52, size * 0.16);
            const pulse = (Math.sin(battle.elapsed * 0.008) + 1) / 2;
            ctx.fillStyle = "rgba(170,140,255," + (0.4 + pulse * 0.5).toFixed(2) + ")";
            ctx.beginPath();
            ctx.arc(x, y - size * 0.8, size * 0.14, 0, Math.PI * 2);
            ctx.fill();
        } else if (unit.shape === "boss") {
            // A hulking figure: heavy legs, a tapered torso, oversized
            // pauldrons and a small head with lit eyes. Built so the
            // silhouette reads as a person at any size.
            const dark = "rgba(0,0,0,.4)";
            // Legs
            ctx.fillStyle = unit.color;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(x + side * size * 0.07, y - size * 0.02);
                ctx.lineTo(x + side * size * 0.3, y - size * 0.02);
                ctx.lineTo(x + side * size * 0.27, y + size * 0.44);
                ctx.lineTo(x + side * size * 0.06, y + size * 0.44);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = dark;
            ctx.fillRect(x - size * 0.32, y + size * 0.4, size * 0.64, size * 0.06);
            // Torso
            ctx.fillStyle = unit.color;
            ctx.beginPath();
            ctx.moveTo(x - size * 0.34, y - size * 0.46);
            ctx.lineTo(x + size * 0.34, y - size * 0.46);
            ctx.lineTo(x + size * 0.24, y + size * 0.02);
            ctx.lineTo(x - size * 0.24, y + size * 0.02);
            ctx.closePath();
            ctx.fill();
            // Chest plate
            ctx.fillStyle = dark;
            ctx.fillRect(x - size * 0.22, y - size * 0.3, size * 0.44, size * 0.1);
            // Pauldrons, overhanging the shoulders
            ctx.fillStyle = shadeHex(unit.color, 0.18);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(x + side * size * 0.3, y - size * 0.52);
                ctx.lineTo(x + side * size * 0.56, y - size * 0.4);
                ctx.lineTo(x + side * size * 0.48, y - size * 0.22);
                ctx.lineTo(x + side * size * 0.3, y - size * 0.3);
                ctx.closePath();
                ctx.fill();
            }
            // Weapon arm
            ctx.strokeStyle = shadeHex(unit.color, -0.25);
            ctx.lineWidth = Math.max(2, size * 0.09);
            ctx.beginPath();
            ctx.moveTo(x + facing * size * 0.4, y - size * 0.3);
            ctx.lineTo(x + facing * size * 0.72, y - size * 0.05);
            ctx.stroke();
            // Head
            ctx.fillStyle = shadeHex(unit.color, -0.3);
            ctx.beginPath();
            ctx.arc(x, y - size * 0.62, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffe9a8";
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(x + side * size * 0.06, y - size * 0.63, size * 0.035, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // humanoid / heavy
            const width = unit.shape === "heavy" ? size * 0.42 : size * 0.3;
            ctx.fillStyle = unit.color;
            ctx.fillRect(x - width / 2, y - size * 0.42 + bob, width, size * 0.62);
            ctx.beginPath();
            ctx.arc(x, y - size * 0.52 + bob, size * 0.17, 0, Math.PI * 2);
            ctx.fill();
            // Weapon line, pointing the way it is facing
            ctx.strokeStyle = "rgba(255,255,255,.4)";
            ctx.lineWidth = Math.max(1, size * 0.07);
            ctx.beginPath();
            ctx.moveTo(x + facing * width * 0.5, y - size * 0.22 + bob);
            ctx.lineTo(x + facing * (width * 0.5 + size * 0.3), y - size * 0.3 + bob);
            ctx.stroke();
            if (unit.shape === "heavy") {
                ctx.fillStyle = "rgba(255,255,255,.16)";
                ctx.fillRect(x - width * 0.6, y - size * 0.3 + bob, width * 1.2, size * 0.12);
            }
        }

        // Attack flash
        if (battle.elapsed - (unit.attackAt - 900) < 110 && unit.attackAt > 0) {
            ctx.fillStyle = "rgba(255,230,170,.5)";
            ctx.beginPath();
            ctx.arc(x + facing * size * 0.6, y - size * 0.25, size * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        healthBar(ctx, x, y - size * (unit.boss ? 0.88 : 0.74), size * (unit.boss ? 0.9 : 0.52),
            unit.hp / unit.maxHp, unit.side === "player" ? "#5bd69b" : "#ff6a5a",
            unit.shieldHp > 0 ? unit.shieldHp / (unit.maxHp * 0.25) : 0);

        if (unit.boss && view.width > 420) {
            ctx.fillStyle = "rgba(245,247,250,.9)";
            ctx.font = "600 10px Inter, Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(unit.name, x, y - size * 1.45);
        }
    }

    function drawStructures(ctx) {
        // Player core
        const coreX = px(battle.core.x);
        const coreY = py(1);
        const size = Math.max(30, laneHeight() * 0.95);
        ctx.fillStyle = battle.core.hp > 0 ? "#3a4668" : "#241f28";
        ctx.fillRect(coreX - size * 0.4, coreY - size * 0.9, size * 0.8, size * 1.5);
        ctx.fillStyle = "rgba(255,255,255,.14)";
        ctx.fillRect(coreX - size * 0.4, coreY - size * 0.9, size * 0.8, size * 0.18);
        ctx.fillStyle = "#ffc247";
        ctx.beginPath();
        ctx.arc(coreX, coreY - size * 1.05, size * 0.14, 0, Math.PI * 2);
        ctx.fill();
        healthBar(ctx, coreX, coreY - size * 1.4, size * 1.5, battle.core.hp / battle.core.maxHp, "#65baff");
        ctx.fillStyle = "rgba(200,215,230,.8)";
        ctx.font = "600 9px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CORE", coreX, coreY + size * 0.85);

        // Player towers
        for (const tower of battle.towers) {
            const x = px(tower.x);
            const y = py(tower.lane);
            const towerSize = Math.max(20, laneHeight() * 0.6);
            ctx.fillStyle = tower.hp > 0 ? "#52343a" : "#2a2024";
            ctx.fillRect(x - towerSize * 0.3, y - towerSize * 0.8, towerSize * 0.6, towerSize * 1.2);
            if (tower.hp > 0) {
                ctx.strokeStyle = "#a2656f";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y - towerSize * 0.75);
                ctx.lineTo(x + towerSize * 0.55, y - towerSize * 0.85);
                ctx.stroke();
            }
            healthBar(ctx, x, y - towerSize * 1.1, towerSize * 1.1, tower.hp / tower.maxHp, "#5bd69b");
        }

        // Enemy spawn portal
        const enemyX = px(battle.enemyCore.x);
        const enemyY = py(1);
        const portal = Math.max(26, laneHeight() * 0.85);
        const swirl = battle.elapsed * 0.002;
        ctx.save();
        ctx.strokeStyle = "rgba(255,106,90,.55)";
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(enemyX, enemyY, portal * (0.4 + i * 0.22),
                portal * (0.8 + i * 0.2), swirl + i, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        healthBar(ctx, enemyX, enemyY - portal * 1.3, portal * 1.5,
            battle.enemyCore.hp / battle.enemyCore.maxHp, "#ff6a5a");
    }

    function drawEffectsLayer(ctx) {
        for (const effect of battle.effects) {
            const progress = (battle.elapsed - effect.born) / effect.ms;
            const x = px(effect.x);
            const y = py(effect.lane);
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - progress);
            if (effect.kind === "hit" || effect.kind === "splash") {
                ctx.fillStyle = effect.color;
                const radius = (effect.kind === "splash" ? 34 : 13) * (0.4 + progress);
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (effect.kind === "death") {
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    const distance = 10 + progress * 28;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(angle) * distance * 0.4, y + Math.sin(angle) * distance * 0.4);
                    ctx.lineTo(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
                    ctx.stroke();
                }
            } else if (effect.kind === "deploy") {
                ctx.strokeStyle = effect.color;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.arc(x, y, 8 + progress * 30, 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect.kind === "heal") {
                ctx.fillStyle = "rgba(91,214,155,.8)";
                ctx.font = "600 13px Inter, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("+", x, y - 14 - progress * 16);
            } else if (effect.kind === "slam") {
                ctx.strokeStyle = "rgba(255,139,53,.8)";
                ctx.lineWidth = 4 * (1 - progress);
                ctx.beginPath();
                ctx.ellipse(x, y, 30 + progress * 110, 12 + progress * 40, 0, 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect.kind === "burn") {
                ctx.fillStyle = "rgba(255,120,40,.3)";
                ctx.fillRect(x - 70, y - 10, 140, 20);
                for (let i = 0; i < 6; i++) {
                    const flame = Math.sin(battle.elapsed * 0.01 + i) * 6;
                    ctx.fillStyle = "rgba(255,180,70,.5)";
                    ctx.fillRect(x - 60 + i * 22, y - 6 + flame, 5, 10);
                }
            } else if (effect.kind === "shield" || effect.kind === "shield-break") {
                ctx.strokeStyle = "rgba(170,140,255,.85)";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, 26 + progress * (effect.kind === "shield-break" ? 40 : 6), 0, Math.PI * 2);
                ctx.stroke();
            } else if (effect.kind === "drain") {
                ctx.strokeStyle = "rgba(93,138,85,.8)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(px(ARENA.playerX), py(1));
                ctx.stroke();
            }
            ctx.restore();
        }

        for (const shot of battle.projectiles) {
            const x = px(shot.x);
            const y = py(shot.lane);
            ctx.fillStyle = shot.color;
            ctx.beginPath();
            ctx.arc(x, y - 4, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x - (shot.side === "player" ? 10 : -10), y - 5, 10, 2);
            ctx.globalAlpha = 1;
        }

        for (const number of battle.damageNumbers) {
            const progress = (battle.elapsed - number.born) / number.ms;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - progress);
            ctx.font = "700 11px Inter, Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(0,0,0,.6)";
            ctx.fillText(number.amount, px(number.x) + 1, py(number.lane) - 20 - progress * 18 + 1);
            ctx.fillStyle = number.color;
            ctx.fillText(number.amount, px(number.x), py(number.lane) - 20 - progress * 18);
            ctx.restore();
        }
    }

    function drawHud(ctx) {
        // Wave label
        ctx.fillStyle = "rgba(245,247,250,.92)";
        ctx.font = "700 12px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText((battle.endless ? "ENDLESS · WAVE " : "WAVE ") + battle.wave, 12, 20);

        const left = battle.spawnQueue.length + livingUnits("enemy").length;
        ctx.fillStyle = "rgba(129,147,166,.9)";
        ctx.font = "600 10px Inter, Arial, sans-serif";
        ctx.fillText(left + " hostile" + (left === 1 ? "" : "s") + " remaining", 12, 35);

        // Charge meter
        const meterWidth = Math.min(220, view.width * 0.4);
        const x = view.width - meterWidth - 12;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(x, 12, meterWidth, 10);
        const ratio = battle.charge / battle.chargeMax;
        const meter = ctx.createLinearGradient(x, 0, x + meterWidth, 0);
        meter.addColorStop(0, "#aa8cff");
        meter.addColorStop(1, "#65baff");
        ctx.fillStyle = meter;
        ctx.fillRect(x, 12, meterWidth * ratio, 10);
        // Pips at each whole point of charge
        ctx.strokeStyle = "rgba(0,0,0,.45)";
        ctx.lineWidth = 1;
        for (let i = 1; i < battle.chargeMax; i++) {
            const pipX = x + (meterWidth / battle.chargeMax) * i;
            ctx.beginPath();
            ctx.moveTo(pipX, 12);
            ctx.lineTo(pipX, 22);
            ctx.stroke();
        }
        ctx.fillStyle = "rgba(245,247,250,.9)";
        ctx.font = "700 10px Inter, Arial, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("CHARGE " + Math.floor(battle.charge) + "/" + battle.chargeMax, view.width - 12, 34);

        // Centre message
        if (battle.message && performance.now() < battle.messageUntil) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (battle.messageUntil - performance.now()) / 400);
            ctx.textAlign = "center";
            ctx.font = "700 15px Inter, Arial, sans-serif";
            ctx.fillStyle = "rgba(6,10,16,.8)";
            const width = ctx.measureText(battle.message).width + 26;
            ctx.fillRect(view.width / 2 - width / 2, view.height * 0.14, width, 28);
            ctx.fillStyle = "#ffc247";
            ctx.fillText(battle.message, view.width / 2, view.height * 0.14 + 19);
            ctx.restore();
        }
    }

    function drawFrame() {
        const ctx = view.ctx;
        // There is nothing to draw until a battle has been set up. render()
        // can reach this before the first fight (and after a save load, which
        // clears the arena), so the guard belongs here rather than at each
        // call site.
        if (!ctx || !battle.core || !battle.enemyCore) return;
        resizeCanvas();
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.clearRect(0, 0, view.width, view.height);

        ctx.save();
        const state = exp();
        if (battle.shake > 0.4 && state?.settings.cameraShake && EX().motionAllowed()) {
            ctx.translate((Math.random() - 0.5) * battle.shake, (Math.random() - 0.5) * battle.shake);
        }

        drawArena(ctx);
        drawStructures(ctx);

        // Painter order: fliers above ground units.
        const sorted = [...battle.units].sort((a, b) => (a.flying ? 1 : 0) - (b.flying ? 1 : 0) || a.lane - b.lane);
        for (const unit of sorted) drawFighter(ctx, unit);

        drawEffectsLayer(ctx);
        ctx.restore();
        drawHud(ctx);
    }

    function frame(now) {
        if (!battle.running) return;
        const delta = battle.lastFrame ? Math.min(250, now - battle.lastFrame) : STEP_MS;
        battle.lastFrame = now;
        if (battle.active && !battle.over) {
            accumulator += delta;
            // Cap catch-up so a backgrounded tab cannot fast-forward a fight.
            let steps = 0;
            while (accumulator >= STEP_MS && steps < 8) {
                step();
                accumulator -= STEP_MS;
                steps++;
                if (battle.over) break;
            }
        }
        drawFrame();
        renderBattleBar();
        if (battle.running) battle.raf = global.requestAnimationFrame(frame);
    }

    function startLoop() {
        if (battle.running) return;
        battle.running = true;
        battle.lastFrame = 0;
        accumulator = 0;
        battle.raf = global.requestAnimationFrame(frame);
    }

    function stopLoop() {
        battle.running = false;
        if (battle.raf) global.cancelAnimationFrame(battle.raf);
        battle.raf = null;
        // Leave the final frame on screen so the result is readable.
        if (view.ctx) drawFrame();
    }

    // ---------------------------------------------------------------
    // Panel UI
    // ---------------------------------------------------------------

    function mount() {
        const panel = document.getElementById("combatPanel");
        if (!panel || view.mounted) return;
        panel.innerHTML =
            '<div class="combat-shell">' +
              '<nav class="combat-tabs" role="tablist">' +
                '<button type="button" class="combat-tab active" data-combat-tab="campaign" role="tab">Campaign</button>' +
                '<button type="button" class="combat-tab" data-combat-tab="deck" role="tab">Deck</button>' +
                '<button type="button" class="combat-tab" data-combat-tab="records" role="tab">Records</button>' +
              '</nav>' +
              '<div class="combat-arena-wrap">' +
                '<canvas id="combatCanvas" aria-label="Battle arena" role="img"></canvas>' +
                '<div class="combat-result" id="combatResult" hidden></div>' +
              '</div>' +
              '<div class="combat-bar" id="combatBar"></div>' +
              '<div class="combat-cards" id="combatCards"></div>' +
              '<div class="combat-body" id="combatBody"></div>' +
            '</div>';
        view.canvas = document.getElementById("combatCanvas");
        view.ctx = view.canvas?.getContext("2d") || null;
        view.mounted = true;

        if (view.canvas) {
            view.canvas.style.touchAction = "none";
            // Tapping a lane deploys the selected card into that lane, which
            // is the whole control scheme on a phone.
            view.canvas.addEventListener("pointerdown", event => {
                if (!battle.active || battle.over) return;
                const rect = view.canvas.getBoundingClientRect();
                const lane = laneFromY(event.clientY - rect.top);
                battle.selectedLane = lane;
                if (battle.selectedCard) deployUnit(battle.selectedCard, lane);
                renderCards();
            });
            view.canvas.addEventListener("pointermove", event => {
                const rect = view.canvas.getBoundingClientRect();
                view.hoverLane = laneFromY(event.clientY - rect.top);
            });
            view.canvas.addEventListener("pointerleave", () => { view.hoverLane = null; });
        }

        const panelNode = panel;
        panelNode.addEventListener("click", event => {
            const action = event.target.closest?.("[data-combat-action]");
            if (action) {
                const kind = action.dataset.combatAction;
                const value = action.dataset.combatValue;
                if (kind === "start") startBattle({ wave: Number(value) || null });
                else if (kind === "endless") startBattle({ endless: true });
                else if (kind === "retreat") retreat();
                else if (kind === "card") {
                    battle.selectedCard = value;
                    EX().sfx("uiTap");
                    renderCards();
                }
                else if (kind === "deploy") deployUnit(value, battle.selectedLane);
                else if (kind === "toggle-deck") toggleDeckCard(value);
                else if (kind === "upgrade") upgradeUnit(value);
                else if (kind === "lane") { battle.selectedLane = Number(value); renderCards(); }
                else if (kind === "dismiss-result") {
                    const node = document.getElementById("combatResult");
                    if (node) node.hidden = true;
                    view.tab = "campaign";
                    render();
                }
                return;
            }
            const tab = event.target.closest?.("[data-combat-tab]");
            if (tab) {
                view.tab = tab.dataset.combatTab;
                const state = exp();
                if (state) state.settings.lastCombatTab = view.tab;
                EX().sfx("uiTap");
                render();
            }
        });

        if (global.ResizeObserver && view.canvas) {
            new ResizeObserver(() => { resizeCanvas(); drawFrame(); }).observe(view.canvas);
        }

        const state = exp();
        if (state && ["campaign", "deck", "records"].includes(state.settings.lastCombatTab)) {
            view.tab = state.settings.lastCombatTab;
        }
    }

    function renderBattleBar() {
        const bar = document.getElementById("combatBar");
        if (!bar) return;
        if (!battle.active && !battle.over) {
            if (bar.dataset.state !== "idle") {
                bar.dataset.state = "idle";
                bar.innerHTML = "";
                bar.hidden = true;
            }
            return;
        }
        bar.hidden = false;
        const lanes = [0, 1, 2].map(lane =>
            '<button type="button" class="lane-pick' + (battle.selectedLane === lane ? " active" : "") + '"' +
            ' data-combat-action="lane" data-combat-value="' + lane + '">' +
            ["Top", "Middle", "Bottom"][lane] + '</button>').join("");
        const signature = "live:" + battle.selectedLane + ":" + (battle.over ? 1 : 0);
        if (bar.dataset.state !== signature) {
            bar.dataset.state = signature;
            bar.innerHTML =
                '<div class="lane-picker" role="group" aria-label="Deployment lane">' + lanes + '</div>' +
                (battle.over ? '' : '<button type="button" class="combat-retreat" data-combat-action="retreat">Retreat</button>');
        }
    }

    function renderCards() {
        const mountNode = document.getElementById("combatCards");
        if (!mountNode) return;
        if (!battle.active || battle.over) {
            if (!mountNode.hidden) { mountNode.hidden = true; mountNode.innerHTML = ""; mountNode.dataset.signature = ""; }
            return;
        }
        mountNode.hidden = false;
        const hand = deck();
        const signature = hand.join(",") + "|" + battle.selectedCard + "|" + Math.floor(battle.charge) + "|" + battle.jammed;
        if (mountNode.dataset.signature === signature) return;
        mountNode.dataset.signature = signature;
        mountNode.innerHTML = hand.map(id => {
            const def = UNITS[id];
            const stats = unitStats(id);
            const affordable = battle.charge >= def.cost;
            const jammed = battle.jammed === id;
            return '<button type="button" class="combat-card' +
                (battle.selectedCard === id ? " selected" : "") +
                (affordable && !jammed ? "" : " locked") + '"' +
                ' data-combat-action="card" data-combat-value="' + id + '"' +
                ' aria-pressed="' + (battle.selectedCard === id) + '">' +
                '<span class="card-cost">' + def.cost + '</span>' +
                '<span class="card-icon" aria-hidden="true">' + def.icon + '</span>' +
                '<span class="card-name">' + def.name + '</span>' +
                '<span class="card-stats">Lv ' + stats.level + ' · ' + stats.hp + 'hp · ' + stats.dps + 'dps</span>' +
                (jammed ? '<span class="card-jammed">JAMMED</span>' : '') +
                '</button>';
        }).join("") +
        '<p class="combat-cards-hint">Tap a card, then tap a lane on the battlefield to deploy.</p>';
    }

    function renderResult() {
        const node = document.getElementById("combatResult");
        if (!node) return;
        if (!battle.over || !battle.result || battle.result === "retreat") { node.hidden = true; return; }
        const summary = battle.rewardSummary;
        node.hidden = false;
        node.className = "combat-result " + (battle.result === "win" ? "win" : "loss");
        node.innerHTML = battle.result === "win"
            ? '<h2>Wave ' + battle.wave + ' cleared</h2>' +
              (summary
                ? '<ul><li>+' + fmt(summary.payout) + ' ' + summary.label + '</li>' +
                  '<li>+' + summary.research + ' research points</li>' +
                  (summary.tokens ? '<li>+' + summary.tokens + ' tokens</li>' : '') +
                  (summary.boss ? '<li>' + summary.boss + ' defeated</li>' : '') +
                  (summary.firstTime ? '' : '<li class="muted">Replay reward (30%)</li>') + '</ul>'
                : '') +
              '<button type="button" class="city-action" data-combat-action="dismiss-result">Continue</button>'
            : '<h2>The wave broke through</h2>' +
              '<p>Your structures took damage. Repair them in the City tab, build more turrets and barricades, then try again.</p>' +
              '<button type="button" class="city-action" data-combat-action="dismiss-result">Continue</button>';
    }

    function renderBody() {
        const mountNode = document.getElementById("combatBody");
        if (!mountNode) return;
        const state = exp();
        const g = liveGame();
        if (!state || !g) return;

        if (battle.active) {
            if (mountNode.dataset.signature !== "live") {
                mountNode.dataset.signature = "live";
                mountNode.innerHTML = "";
            }
            return;
        }

        if (view.tab === "deck") {
            const chosen = state.combat.deck.filter(id => UNITS[id]);
            const rows = Object.entries(UNITS).map(([id, def]) => {
                const unlocked = unitUnlocked(id);
                const inDeck = chosen.includes(id);
                const stats = unitStats(id);
                const cost = unitUpgradeCost(id);
                return '<article class="unit-card' + (unlocked ? "" : " locked") + '">' +
                    '<header><span aria-hidden="true">' + def.icon + '</span><div><strong>' + def.name + '</strong>' +
                    '<small>' + def.cost + ' charge · ' + def.role + '</small></div></header>' +
                    '<p>' + def.desc + '</p>' +
                    (unlocked
                        ? '<p class="unit-stats">Lv ' + stats.level + ' · ' + stats.hp + ' hp · ' + stats.dps + ' dps' +
                          (def.range > 60 ? ' · range ' + def.range : '') + '</p>' +
                          '<div class="unit-actions">' +
                          '<button type="button" class="city-mini" data-combat-action="toggle-deck" data-combat-value="' + id + '">' +
                          (inDeck ? "Remove" : "Add to deck") + '</button>' +
                          '<button type="button" class="city-mini" data-combat-action="upgrade" data-combat-value="' + id + '"' +
                          ((g.salvage || 0) < cost ? ' disabled' : '') + '>Upgrade · ' + fmt(cost) + '</button></div>'
                        : '<p class="unit-locked">🔒 ' + unlockText(def) + '</p>') +
                    '</article>';
            }).join("");
            const signature = "deck:" + chosen.join(",") + ":" + Object.keys(UNITS).map(unitLevel).join(",") + ":" + Math.floor(g.salvage || 0);
            if (mountNode.dataset.signature !== signature) {
                mountNode.dataset.signature = signature;
                mountNode.innerHTML =
                    '<p class="combat-note">Your deck holds up to six cards (' + chosen.length + '/6 chosen). ' +
                    'Upgrades are permanent and survive every reset.</p>' +
                    '<div class="unit-grid">' + rows + '</div>';
            }
            return;
        }

        if (view.tab === "records") {
            const stats = EX().cityStats();
            const signature = "records:" + state.combat.wavesCleared + ":" + state.combat.bestWave + ":" +
                state.combat.totalKills + ":" + state.combat.losses + ":" + Math.round(stats.combatValue);
            if (mountNode.dataset.signature !== signature) {
                mountNode.dataset.signature = signature;
                const bosses = Object.entries(BOSSES).map(([id, def]) =>
                    '<li>' + (state.combat.bossesDefeated[id] ? "✓ " : "🔒 ") + def.name + '</li>').join("");
                mountNode.innerHTML =
                    '<div class="combat-records">' +
                    '<ul class="inspect-stats">' +
                    '<li>Waves cleared: <strong>' + state.combat.wavesCleared + '</strong></li>' +
                    '<li>Best wave: <strong>' + state.combat.bestWave + '</strong></li>' +
                    '<li>Total kills: <strong>' + fmt(state.combat.totalKills) + '</strong></li>' +
                    '<li>Defeats: <strong>' + state.combat.losses + '</strong></li>' +
                    '<li>City raid defense: <strong>' + Math.round(stats.combatValue) + '</strong></li>' +
                    '</ul>' +
                    '<p class="combat-note">Raid defense comes from turrets and barricades standing in your city. ' +
                    'It becomes tower health and tower damage in every battle.</p>' +
                    '<h4>Bosses</h4><ul class="boss-list">' + bosses + '</ul></div>';
            }
            return;
        }

        // Campaign
        const next = nextCampaignWave();
        const defense = cityDefense();
        const pet = companionBonus();
        const boss = waveBoss(next);
        const signature = "campaign:" + next + ":" + Math.round(defense.towerHp) + ":" + (pet.name || "") + ":" + (battle.result || "");
        if (mountNode.dataset.signature !== signature) {
            mountNode.dataset.signature = signature;
            mountNode.innerHTML =
                '<div class="combat-brief">' +
                  '<div class="brief-main">' +
                    '<p class="eyebrow">NEXT ENGAGEMENT</p>' +
                    '<h2>Wave ' + next + (boss ? ' · ' + BOSSES[boss].name : '') + '</h2>' +
                    '<p>' + (boss
                        ? BOSSES[boss].desc + ' Bring your strongest deck.'
                        : 'Hostiles will advance down three lanes. Hold the core.') + '</p>' +
                    '<ul class="inspect-stats">' +
                      '<li>Core health: <strong>' + fmt(Math.round(defense.coreHp)) + '</strong></li>' +
                      '<li>Towers: <strong>' + defense.turrets + ' × ' + fmt(Math.round(defense.towerHp)) + ' hp</strong></li>' +
                      '<li>Tower damage: <strong>' + Math.round(defense.towerDps) + ' dps</strong></li>' +
                      '<li>Companion: <strong>' + (pet.name || "none assigned") + '</strong></li>' +
                    '</ul>' +
                    '<div class="brief-actions">' +
                      '<button type="button" class="city-action" data-combat-action="start" data-combat-value="' + next + '">Begin wave ' + next + '</button>' +
                      '<button type="button" class="city-mini" data-combat-action="endless">Practice (endless)</button>' +
                    '</div>' +
                  '</div>' +
                  '<aside class="brief-side">' +
                    '<p class="eyebrow">HOW IT WORKS</p>' +
                    '<ol><li>Charge refills over time. Each card costs charge.</li>' +
                    '<li>Tap a card, then tap a lane to deploy there.</li>' +
                    '<li>Melee cannot hit fliers. Siege ignores units and goes for towers.</li>' +
                    '<li>Lose and the wave damages real city structures.</li></ol>' +
                  '</aside>' +
                '</div>';
        }
    }

    function unlockText(def) {
        if (!def.unlock) return "Available";
        const [kind, value] = def.unlock.split(":");
        if (kind === "wave") return "Reach wave " + value;
        if (kind === "research") return "Research required";
        return "Locked";
    }

    function renderDeck() { renderBody(); renderCards(); }

    function render() {
        mount();
        if (!view.mounted) return;
        const tabs = document.querySelectorAll("#combatPanel [data-combat-tab]");
        for (const tab of tabs) {
            const active = tab.dataset.combatTab === view.tab;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        }
        const wrap = document.querySelector("#combatPanel .combat-arena-wrap");
        if (wrap) wrap.hidden = !(battle.active || battle.over);
        renderBattleBar();
        renderCards();
        renderResult();
        renderBody();
        resizeCanvas();
        if (battle.active) startLoop();
        else if (battle.over && battle.core) drawFrame();
    }

    function tick() {
        // A battle keeps running on its own frame loop; nothing to do per
        // second except keep the idle panel's numbers fresh.
        if (!battle.active && mode() === "combat") renderBody();
    }

    function onLoad() {
        battle.active = false;
        battle.over = false;
        battle.units = [];
        battle.projectiles = [];
        battle.effects = [];
        stopLoop();
        const state = exp();
        if (state && ["campaign", "deck", "records"].includes(state.settings.lastCombatTab)) {
            view.tab = state.settings.lastCombatTab;
        }
    }

    function init() {
        if (mode() === "combat") render();
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && battle.running) stopLoop();
            else if (!document.hidden && battle.active && mode() === "combat") startLoop();
        });
    }

    global.LastCityExpansion?.register?.("combat", {
        init, render, tick, onLoad,
        UNITS, ENEMIES, BOSSES,
        startBattle, endBattle, retreat, deployUnit,
        unitStats, unitUnlocked, waveComposition, waveBoss, cityDefense,
        isActive: () => battle.active,
        _battle: battle,
        _step: step,
        _deck: deck,
        _toggleDeckCard: toggleDeckCard,
        _upgradeUnit: upgradeUnit
    });
})(typeof window !== "undefined" ? window : globalThis);
