// =============================================
// LAST CITY · PEOPLE, MISSIONS AND EVENTS
// CTRL + ALT + DEFEAT
// ---------------------------------------------
// The part of the update that makes the settlement feel inhabited:
//
//   * Named NPCs with branching conversations whose choices are recorded
//     permanently and change what they will offer you later.
//   * Relationships that open and close options, and pay out in real
//     resources and recruits.
//   * Exploration missions with travel time, a success chance you can
//     improve, and one-shot rewards guarded by a claim flag.
//   * Hidden discoveries, triggered by searching wreckage in the city view.
//   * Ambient city events that interrupt with a decision worth thinking about.
//
// Every effect is applied through one function (applyOutcome) so a choice can
// never pay out twice and every reward is auditable in one place.
// =============================================

(function (global) {
    "use strict";

    const EX = () => global.LastCityExpansion;

    function liveGame() { try { return typeof game !== "undefined" ? game : null; } catch (_) { return null; } }
    function started() { try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; } }
    function zonesTable() { try { return typeof ZONES !== "undefined" ? ZONES : null; } catch (_) { return null; } }
    function fmt(value) { return typeof global.formatNumber === "function" ? global.formatNumber(value) : String(Math.round(value)); }
    function exp() { return EX()?.state() || null; }

    // ---------------------------------------------------------------
    // Cast
    //
    // Three characters introduced by the opening cinematic, plus two who turn
    // up later, so the people the player met in the intro are the people they
    // then work with.
    // ---------------------------------------------------------------

    const NPCS = {
        mara: {
            name: "Mara", role: "Chief Engineer", icon: "🔧", color: "#65baff",
            intro: "She kept the last substation alive for nine hours after the rest of the grid died.",
            unlock: () => true
        },
        tomas: {
            name: "Tomas", role: "Scavenger Lead", icon: "⛏", color: "#ffc247",
            intro: "Knows every collapsed basement within thirty kilometres, and which ones are worth the climb.",
            unlock: () => true
        },
        vex: {
            name: "Vex", role: "Signal Operator", icon: "📡", color: "#aa8cff",
            intro: "Was on shift when the grid fell. Still listening to the same frequencies.",
            unlock: () => true
        },
        iris: {
            name: "Iris", role: "Field Medic", icon: "⚕", color: "#5bd69b",
            intro: "Walked in out of the ash with a full medical kit and no explanation.",
            unlock: () => (liveGame()?.stage2Unlocked) || (exp()?.survivors.roster.length || 0) >= 8
        },
        hollow: {
            name: "The Hollow Voice", role: "Unknown Transmission", icon: "◉", color: "#ff8b35",
            intro: "Something is answering the beacon. It is not using words it learned from us.",
            unlock: () => !!liveGame()?.stage4Unlocked
        }
    };

    function relationship(id) {
        return Math.max(-100, Math.min(100, exp()?.narrative.relationships[id] || 0));
    }

    function adjustRelationship(id, amount) {
        const state = exp();
        if (!state || !NPCS[id]) return;
        state.narrative.relationships[id] = Math.max(-100, Math.min(100, relationship(id) + amount));
    }

    function relationshipLabel(value) {
        if (value >= 70) return "Trusted";
        if (value >= 35) return "Friendly";
        if (value >= 10) return "Warm";
        if (value > -10) return "Neutral";
        if (value > -40) return "Wary";
        return "Hostile";
    }

    // ---------------------------------------------------------------
    // Conversations
    //
    // A conversation is a list of nodes. `when` gates availability against
    // live game state, and every option records itself in narrative.choices,
    // so the record of what the player decided is permanent.
    // ---------------------------------------------------------------

    const CONVERSATIONS = {
        "mara:first": {
            npc: "mara", once: true,
            when: () => true,
            text: "You're the one who got the camp's power running. Good. I have two jobs and one set of hands — " +
                  "so tell me where you want me: keeping the lights on, or getting the beacon talking?",
            options: [
                {
                    id: "grid", label: "Keep the lights on.",
                    reply: "Sensible. A city that browns out every night doesn't grow.",
                    outcome: { relationship: { mara: 12 }, research: 14, log: "Mara focused on the power grid." }
                },
                {
                    id: "beacon", label: "Get the beacon talking.",
                    reply: "Ambitious. I like ambitious. Don't blame me when the lights flicker.",
                    outcome: { relationship: { mara: 8 }, salvageSeconds: 45, log: "Mara focused on the beacon." }
                },
                {
                    id: "both", label: "Both. We'll find more hands.",
                    reply: "Then find them fast. I'll start on the grid and we'll see who turns up.",
                    outcome: { relationship: { mara: 4 }, recruit: 1, log: "Mara agreed to take on both jobs." }
                }
            ]
        },
        "mara:grid": {
            npc: "mara", once: true,
            when: () => EX()?.cityStats().powerBalance < 0,
            text: "We're drawing more power than we make. I can brown out the workshops to protect the shelters, " +
                  "or run everything hot and hope nothing burns out.",
            options: [
                {
                    id: "safe", label: "Protect the shelters.",
                    reply: "Agreed. People first. Production will suffer and that's the price.",
                    outcome: { relationship: { mara: 14 }, morale: 12, log: "Shelters were prioritised during the brownout." }
                },
                {
                    id: "hot", label: "Run it hot.",
                    reply: "On your head. I'll stand by with an extinguisher.",
                    outcome: { relationship: { mara: -8 }, salvageSeconds: 120, damage: 18, log: "The grid was run past its rating." }
                }
            ]
        },
        "tomas:first": {
            npc: "tomas", once: true,
            when: () => true,
            text: "There's a rail depot four hours east. Half flooded, but the freight containers are sealed. " +
                  "I can take a crew — or I can stay and teach your people to climb properly first.",
            options: [
                {
                    id: "go", label: "Take a crew. Go now.",
                    reply: "Then we leave at first light. Don't expect everyone back on the first run.",
                    outcome: { relationship: { tomas: 10 }, unlockMission: "depotRun", log: "Tomas opened the Depot Run." }
                },
                {
                    id: "teach", label: "Teach them first.",
                    reply: "Slower. Smarter. Fine by me — I'd rather train them than bury them.",
                    outcome: { relationship: { tomas: 16 }, missionBonus: 0.12, log: "Tomas trained the scavenging crews." }
                }
            ]
        },
        "tomas:salvage": {
            npc: "tomas", once: true,
            when: () => (liveGame()?.totalBuildingsBuilt || 0) >= 12,
            text: "Found something odd on the last run. A sealed service hatch with a hand-painted warning, " +
                  "and the paint is fresh. Somebody else is out there. Do we open it?",
            options: [
                {
                    id: "open", label: "Open it.",
                    reply: "Right. I'll go first.",
                    outcome: { relationship: { tomas: 6 }, research: 42, discovery: "hatch", log: "The sealed hatch was opened." }
                },
                {
                    id: "mark", label: "Mark it and walk away.",
                    reply: "Probably wise. I'll note it on the map in case we change our minds.",
                    outcome: { relationship: { tomas: 2 }, salvageSeconds: 60, log: "The hatch was marked and left alone." }
                },
                {
                    id: "watch", label: "Watch it for a week.",
                    reply: "Patient. I'll set up a blind on the ridge.",
                    outcome: { relationship: { tomas: 12 }, unlockMission: "watchers", log: "A watch was set on the hatch." }
                }
            ]
        },
        "vex:first": {
            npc: "vex", once: true,
            when: () => true,
            text: "The beacon isn't the only thing transmitting. There's a repeating pattern on a band nobody " +
                  "should be using. I can boost our signal to reach survivors, or go quiet and listen.",
            options: [
                {
                    id: "broadcast", label: "Broadcast. Find people.",
                    reply: "Then we're shouting in the dark. I hope it's only people who hear us.",
                    outcome: { relationship: { vex: 8 }, recruit: 2, log: "The beacon began broadcasting openly." }
                },
                {
                    id: "listen", label: "Go quiet. Listen first.",
                    reply: "Thank you. I'll have something for you within the week.",
                    outcome: { relationship: { vex: 16 }, research: 36, log: "The settlement went radio-silent to listen." }
                }
            ]
        },
        "vex:pattern": {
            npc: "vex", once: true,
            when: () => !!liveGame()?.stage3Unlocked,
            text: "I decoded part of it. It's a census. Somebody is counting settlements — ours is on the list, " +
                  "with a number beside it that went up last month. Do I tell the others?",
            options: [
                {
                    id: "tell", label: "Tell everyone.",
                    reply: "Agreed. They'd rather be frightened and informed.",
                    outcome: { relationship: { vex: 14 }, morale: -8, unlockMission: "census", log: "The census transmission was made public." }
                },
                {
                    id: "quiet", label: "Keep it between us.",
                    reply: "Understood. I don't like it, but understood.",
                    outcome: { relationship: { vex: -6 }, research: 70, log: "The census was kept quiet." }
                }
            ]
        },
        "iris:first": {
            npc: "iris", once: true,
            when: () => true,
            text: "I'll stay, and I'll treat anyone who walks in — yours or not. That's the condition. " +
                  "Is it a problem?",
            options: [
                {
                    id: "accept", label: "No problem. Anyone who needs it.",
                    reply: "Good. Then I'll need a clinic, and I'll pay for it in people who don't die.",
                    outcome: { relationship: { iris: 20 }, morale: 16, recruit: 1, log: "Iris joined on her own terms." }
                },
                {
                    id: "ours", label: "Our people first.",
                    reply: "Then I'll work to your rules, and I'll like you a little less for it.",
                    outcome: { relationship: { iris: -10 }, salvageSeconds: 90, log: "Iris agreed to prioritise the settlement." }
                }
            ]
        },
        "hollow:first": {
            npc: "hollow", once: true,
            when: () => true,
            text: "YOU HAVE REBUILT FOUR SEVENTEEN OF NINE THOUSAND. THE CENSUS IS INCOMPLETE. " +
                  "SUBMIT YOUR COUNT, OR BE COUNTED.",
            options: [
                {
                    id: "submit", label: "Send it our numbers.",
                    reply: "RECORDED. YOUR SETTLEMENT IS SCHEDULED.",
                    outcome: { relationship: { hollow: 20 }, research: 180, log: "The settlement submitted its census." }
                },
                {
                    id: "refuse", label: "We're not a number.",
                    reply: "NOTED. THE DISCREPANCY WILL BE RESOLVED.",
                    outcome: { relationship: { hollow: -30 }, tokens: 3, log: "The census demand was refused." }
                },
                {
                    id: "lie", label: "Send it the wrong numbers.",
                    reply: "...RECALCULATING.",
                    outcome: { relationship: { hollow: -10 }, research: 90, discovery: "falsecount", log: "False numbers were transmitted." }
                }
            ]
        }
    };

    function conversationAvailable(id) {
        const conversation = CONVERSATIONS[id];
        const state = exp();
        if (!conversation || !state) return false;
        if (conversation.once && state.narrative.choices[id]) return false;
        if (!NPCS[conversation.npc]?.unlock()) return false;
        try { return !!conversation.when(); } catch (_) { return false; }
    }

    function conversationsFor(npc) {
        return Object.keys(CONVERSATIONS).filter(id => CONVERSATIONS[id].npc === npc);
    }

    function nextConversation(npc) {
        return conversationsFor(npc).find(conversationAvailable) || null;
    }

    // ---------------------------------------------------------------
    // Missions
    //
    // Real elapsed time, a success chance the player can improve, and a
    // one-shot payout. Rewards are expressed as multiples of the player's
    // current production so they stay relevant at every stage of the game
    // without ever being a shortcut past it.
    // ---------------------------------------------------------------

    const MISSIONS = {
        firstSweep: {
            name: "Sweep the Ridge", icon: "🧭", minutes: 3, survivors: 1, risk: 0.05,
            desc: "A short sweep of the ridge line above the camp. Low risk, quick return.",
            unlock: () => true,
            reward: { salvageSeconds: 90, research: 8 }
        },
        depotRun: {
            name: "Depot Run", icon: "🚃", minutes: 8, survivors: 3, risk: 0.18,
            desc: "Four hours east to the flooded rail depot. Sealed containers, bad footing.",
            unlock: () => !!exp()?.narrative.choices["tomas:first"],
            reward: { salvageSeconds: 320, research: 26, recruit: 1 }
        },
        waterTable: {
            name: "Map the Water Table", icon: "💧", minutes: 6, survivors: 2, risk: 0.1,
            desc: "Find out where the clean water actually is before another cistern goes in the wrong place.",
            unlock: () => (liveGame()?.buildings?.shelter || 0) >= 3,
            reward: { salvageSeconds: 180, research: 34, morale: 10 }
        },
        watchers: {
            name: "Watch the Hatch", icon: "👁", minutes: 12, survivors: 2, risk: 0.22,
            desc: "A week in a cold blind on the ridge, watching a hatch somebody repainted.",
            unlock: () => !!exp()?.narrative.choices["tomas:salvage"],
            reward: { research: 120, discovery: "watchers", tokens: 1 }
        },
        powerPlant: {
            name: "The Old Plant", icon: "⚡", minutes: 15, survivors: 4, risk: 0.3,
            desc: "The pre-collapse generating station. Still radioactive in places, still full of parts.",
            unlock: () => !!liveGame()?.stage2Unlocked,
            reward: { salvageSeconds: 900, research: 90, recruit: 2 }
        },
        census: {
            name: "Trace the Census", icon: "📡", minutes: 20, survivors: 3, risk: 0.35,
            desc: "Triangulate whoever is counting settlements. Vex thinks they are closer than the signal suggests.",
            unlock: () => !!exp()?.narrative.choices["vex:pattern"],
            reward: { research: 260, tokens: 4, discovery: "census" }
        },
        deepRuins: {
            name: "The Deep Ruins", icon: "🏚", minutes: 25, survivors: 5, risk: 0.4,
            desc: "Below the old financial district, where the flood never reached and nothing has been taken.",
            unlock: () => !!liveGame()?.stage3Unlocked,
            reward: { salvageSeconds: 2400, research: 320, recruit: 3 }
        }
    };

    function missionState(id) {
        const record = exp()?.narrative.missions[id];
        return record || { state: "available", progress: 0, startedAt: 0, completedAt: 0, claimed: false };
    }

    function missionUnlocked(id) {
        const mission = MISSIONS[id];
        if (!mission) return false;
        try { return !!mission.unlock(); } catch (_) { return false; }
    }

    // Success chance: the mission's base risk, improved by having more
    // survivors than it needs, by research, by Tomas's training, and by a
    // companion assigned to exploration.
    function successChance(id) {
        const mission = MISSIONS[id];
        const state = exp();
        if (!mission || !state) return 0;
        let chance = 1 - mission.risk;
        const spare = Math.max(0, state.survivors.roster.length - mission.survivors);
        chance += Math.min(0.2, spare * 0.02);
        if (state.narrative.choices["tomas:first"] === "teach") chance += 0.12;
        const research = EX().moduleFor("research")?.activeEffects?.();
        if (research?.missionSpeed) chance += Math.min(0.1, research.missionSpeed * 0.3);
        const petId = state.pets?.assignments?.explore;
        if (petId) chance += Math.min(0.15, (state.pets.levels[petId] || 1) * 0.01);
        chance += Math.min(0.1, relationship("tomas") / 1000);
        return Math.max(0.15, Math.min(0.97, chance));
    }

    function missionDuration(id) {
        const mission = MISSIONS[id];
        if (!mission) return 0;
        const research = EX().moduleFor("research")?.activeEffects?.();
        const speed = 1 - Math.min(0.5, research?.missionSpeed || 0);
        return Math.max(30000, mission.minutes * 60000 * speed);
    }

    function startMission(id) {
        const mission = MISSIONS[id];
        const state = exp();
        if (!mission || !state) return false;
        if (!missionUnlocked(id)) return false;
        const record = missionState(id);
        if (record.state === "active") { EX().notify("That crew is already out."); return false; }
        if (record.state === "done" && record.claimed) { EX().notify("That mission is finished."); return false; }
        if (state.survivors.roster.length < mission.survivors) {
            EX().notify("Needs " + mission.survivors + " survivors. Build more shelters.");
            EX().sfx("uiDenied");
            return false;
        }
        state.narrative.missions[id] = {
            state: "active", progress: 0,
            startedAt: Date.now(), completedAt: Date.now() + missionDuration(id),
            claimed: false
        };
        EX().sfx("uiOpen");
        EX().logEvent(mission.name + ": crew departed.", "mission");
        EX().notify("🧭 " + mission.name + " — crew departed.");
        EX().save();
        renderPeople();
        return true;
    }

    // Resolve a mission whose timer has elapsed. The roll happens exactly
    // once, here, and the result is stored so a reload cannot reroll it.
    function resolveMission(id) {
        const state = exp();
        const record = state?.narrative.missions[id];
        if (!record || record.state !== "active") return;
        if (Date.now() < record.completedAt) return;
        const success = Math.random() < successChance(id);
        record.state = "done";
        record.progress = success ? 1 : 0;
        const mission = MISSIONS[id];
        EX().logEvent(mission.name + (success ? " succeeded." : " failed. The crew came home empty-handed."),
            success ? "good" : "bad");
        EX().sfx(success ? "discovery" : "uiDenied");
        EX().notify((success ? "✅ " : "⚠ ") + mission.name + (success ? " — crew returned with cargo." : " — crew returned empty."));
        EX().save();
    }

    function claimMission(id) {
        const state = exp();
        const record = state?.narrative.missions[id];
        const mission = MISSIONS[id];
        if (!state || !record || !mission) return false;
        if (record.state !== "done" || record.claimed) return false;
        record.claimed = true;
        if (record.progress >= 1) {
            applyOutcome({ ...mission.reward, log: mission.name + " rewards collected." });
        } else {
            // A failed mission still teaches you something.
            applyOutcome({ research: Math.ceil((mission.reward.research || 10) * 0.2), log: mission.name + ": salvaged what they could." });
        }
        // Missions become repeatable at a reduced payout once claimed, so the
        // board never runs dry.
        record.state = "available";
        record.claimed = false;
        record.startedAt = 0;
        record.completedAt = 0;
        record.progress = 0;
        EX().save();
        renderPeople();
        return true;
    }

    // ---------------------------------------------------------------
    // Outcomes
    //
    // The single place rewards are granted. Everything else describes an
    // outcome; only this applies one.
    // ---------------------------------------------------------------

    function applyOutcome(outcome) {
        const state = exp();
        const g = liveGame();
        if (!state || !g || !outcome) return;
        const parts = [];

        if (outcome.relationship) {
            for (const [id, amount] of Object.entries(outcome.relationship)) {
                adjustRelationship(id, amount);
                if (NPCS[id]) parts.push(NPCS[id].name + (amount >= 0 ? " +" : " ") + amount);
            }
        }
        if (outcome.salvageSeconds) {
            const rate = typeof global.getSalvagePerSecond === "function" ? global.getSalvagePerSecond() : 1;
            const amount = Math.max(50, rate * outcome.salvageSeconds);
            g.salvage += amount;
            g.totalSalvage += amount;
            g.lifetimeSalvage += amount;
            parts.push("+" + fmt(amount) + " Salvage");
        }
        if (outcome.research) {
            const effects = EX().moduleFor("research")?.activeEffects?.();
            const bonus = 1 + (effects?.discoveryBonus || 0);
            const amount = outcome.research * bonus;
            state.research.points += amount;
            state.research.lifetimePoints += amount;
            parts.push("+" + Math.round(amount) + " research");
        }
        if (outcome.tokens) {
            const stage = Math.min(5, Math.max(1, (() => {
                try { return typeof currentStageView !== "undefined" ? currentStageView : 1; } catch (_) { return 1; }
            })()));
            const key = { 1: "shards", 2: "scrapTokens", 3: "partTokens", 4: "networkTokens", 5: "ascensionTokens" }[stage];
            if (key) {
                g[key] = (g[key] || 0) + outcome.tokens;
                parts.push("+" + outcome.tokens + " tokens");
            }
        }
        if (outcome.recruit) {
            let added = 0;
            for (let i = 0; i < outcome.recruit; i++) {
                // A recruit from a story beat arrives even if the roster is
                // already at the population target, which is why this does not
                // go through the city's normal roster sync.
                if (forceRecruit()) added++;
            }
            if (added) parts.push("+" + added + " survivor" + (added === 1 ? "" : "s"));
        }
        if (outcome.morale) {
            for (const survivor of state.survivors.roster) {
                survivor.morale = Math.max(0, Math.min(100, survivor.morale + outcome.morale));
            }
            parts.push((outcome.morale > 0 ? "+" : "") + outcome.morale + " morale");
        }
        if (outcome.damage) {
            EX().emit("combat:raid-damage", { amount: outcome.damage, wave: 0 });
            parts.push("structures damaged");
        }
        if (outcome.missionBonus) {
            // Stored as a choice, read by successChance.
            state.narrative.choices["bonus:mission"] = String(outcome.missionBonus);
        }
        if (outcome.unlockMission) {
            const existing = state.narrative.missions[outcome.unlockMission];
            if (!existing) {
                state.narrative.missions[outcome.unlockMission] =
                    { state: "available", progress: 0, startedAt: 0, completedAt: 0, claimed: false };
            }
            parts.push("new mission available");
        }
        if (outcome.discovery) {
            state.narrative.discoveries[outcome.discovery] = true;
            parts.push("discovery recorded");
        }
        if (outcome.log) EX().logEvent(outcome.log, "story");

        if (parts.length) EX().notify(parts.join(" · "));
        if (typeof global.updateGame === "function") global.updateGame();
        EX().save();
    }

    // Recruiting outside the population cap, used only by story rewards.
    function forceRecruit() {
        const state = exp();
        if (!state || state.survivors.roster.length >= 120) return null;
        const id = state.survivors.nextId++;
        const names = ["Nym", "Ovid", "Pike", "Rhen", "Sable", "Teal", "Umber", "Vale", "Wick", "Yarrow"];
        const survivor = {
            id,
            name: names[id % names.length] + " " + String.fromCharCode(65 + (id * 7) % 26) + ".",
            role: "idle", assignedTo: 0,
            skill: 2 + (id % 3),
            morale: 78,
            recruitedAt: Date.now(),
            portrait: id % 24
        };
        state.survivors.roster.push(survivor);
        state.survivors.recruited++;
        return survivor;
    }

    // ---------------------------------------------------------------
    // Ambient city events
    // ---------------------------------------------------------------

    const EVENTS = {
        caravan: {
            title: "A caravan at the gate", icon: "🛻",
            text: "Six people with a working truck want to trade fuel for shelter and a night's rations. " +
                  "Your food balance is the deciding factor.",
            options: [
                { id: "trade", label: "Trade with them", outcome: { salvageSeconds: 200, morale: 4, log: "Traded with the caravan." } },
                { id: "join", label: "Offer them a place here", outcome: { recruit: 2, morale: -4, log: "The caravan stayed." } },
                { id: "refuse", label: "Send them on", outcome: { morale: -8, research: 10, log: "The caravan was turned away." } }
            ]
        },
        stormWarning: {
            title: "Ash storm inbound", icon: "🌪",
            text: "Vex has an hour's warning on the band. You can shut the plants down and ride it out, " +
                  "or keep producing and accept some damage.",
            options: [
                { id: "shutdown", label: "Shut everything down", outcome: { morale: 6, log: "The settlement rode out the storm." } },
                { id: "produce", label: "Keep working", outcome: { salvageSeconds: 240, damage: 26, log: "Production continued through the storm." } }
            ]
        },
        sickness: {
            title: "Something is going around", icon: "🤒",
            text: "A third of the crew is running a fever. Iris wants everyone stood down for two days.",
            options: [
                { id: "rest", label: "Stand them down", outcome: { morale: 14, relationship: { iris: 12 }, log: "The crew was given two days' rest." } },
                { id: "work", label: "Work through it", outcome: { salvageSeconds: 180, morale: -16, relationship: { iris: -14 }, log: "The crew worked through the illness." } }
            ]
        },
        signalSpike: {
            title: "A spike on the dead band", icon: "📶",
            text: "Something transmitted for four seconds on a frequency that has been silent for a century.",
            options: [
                { id: "chase", label: "Chase the source", outcome: { research: 60, unlockMission: "census", log: "The signal spike was investigated." } },
                { id: "record", label: "Just record it", outcome: { research: 28, log: "The signal spike was archived." } }
            ]
        },
        windfall: {
            title: "An intact vending warehouse", icon: "📦",
            text: "Tomas's crew found a loading bay nobody has touched. It is full, and it is heavy.",
            options: [
                { id: "haul", label: "Haul everything", outcome: { salvageSeconds: 420, morale: -4, log: "The warehouse was emptied in one trip." } },
                { id: "careful", label: "Take it in stages", outcome: { salvageSeconds: 300, morale: 8, relationship: { tomas: 8 }, log: "The warehouse was cleared carefully." } }
            ]
        }
    };

    const EVENT_INTERVAL_MS = 11 * 60 * 1000;

    function scheduleNextEvent(fromNow = EVENT_INTERVAL_MS) {
        const state = exp();
        if (!state) return;
        // A little jitter so events do not arrive like clockwork.
        state.narrative.nextEventAt = Date.now() + fromNow * (0.75 + Math.random() * 0.5);
    }

    function maybeFireEvent() {
        const state = exp();
        if (!state || !started()) return;
        if (EX().busy()) return;
        if (document.getElementById("eventModal")?.open) return;
        if (!state.narrative.nextEventAt) { scheduleNextEvent(); return; }
        if (Date.now() < state.narrative.nextEventAt) return;
        // Only once the player has a settlement worth interrupting.
        if (state.city.plots.length < 3) { scheduleNextEvent(); return; }
        const ids = Object.keys(EVENTS);
        const id = ids[Math.floor(Math.random() * ids.length)];
        scheduleNextEvent();
        openEvent(id);
    }

    // ---------------------------------------------------------------
    // Dialogue UI
    //
    // Two dialogs: one for people and missions, one for an interrupting
    // event. Both are native <dialog> elements, so focus trapping, Escape
    // and the backdrop come from the platform.
    // ---------------------------------------------------------------

    let activeConversation = null;
    let dialogueStep = "ask";
    let dialogueReply = "";

    function ensureDialogs() {
        if (!document.getElementById("peopleModal")) {
            const dialog = document.createElement("dialog");
            dialog.id = "peopleModal";
            dialog.className = "people-modal";
            dialog.setAttribute("aria-labelledby", "peopleTitle");
            dialog.innerHTML =
                '<div class="people-shell">' +
                  '<header class="people-head">' +
                    '<div><p class="eyebrow">THE SETTLEMENT</p><h2 id="peopleTitle">Survivors &amp; missions</h2></div>' +
                    '<button type="button" class="people-close" data-people-action="close" aria-label="Close">×</button>' +
                  '</header>' +
                  '<nav class="people-tabs" role="tablist">' +
                    '<button type="button" class="people-tab active" data-people-tab="people" role="tab">People</button>' +
                    '<button type="button" class="people-tab" data-people-tab="missions" role="tab">Missions</button>' +
                    '<button type="button" class="people-tab" data-people-tab="log" role="tab">Journal</button>' +
                  '</nav>' +
                  '<div class="people-body" id="peopleBody"></div>' +
                '</div>';
            document.body.appendChild(dialog);
            dialog.addEventListener("click", onPeopleClick);
            dialog.addEventListener("close", () => { activeConversation = null; dialogueStep = "ask"; });
        }
        if (!document.getElementById("eventModal")) {
            const dialog = document.createElement("dialog");
            dialog.id = "eventModal";
            dialog.className = "event-modal";
            dialog.setAttribute("aria-labelledby", "eventTitle");
            dialog.innerHTML = '<div class="event-shell" id="eventShell"></div>';
            document.body.appendChild(dialog);
            dialog.addEventListener("click", onEventClick);
            // An event is a decision: Escape should not dismiss it silently.
            dialog.addEventListener("cancel", event => event.preventDefault());
        }
    }

    let peopleTab = "people";

    function openPeople(tab = "people") {
        ensureDialogs();
        peopleTab = tab;
        activeConversation = null;
        dialogueStep = "ask";
        const dialog = document.getElementById("peopleModal");
        if (!dialog) return;
        renderPeople();
        if (!dialog.open) dialog.showModal();
        EX().sfx("uiOpen");
    }

    function onPeopleClick(event) {
        const tab = event.target.closest?.("[data-people-tab]");
        if (tab) {
            peopleTab = tab.dataset.peopleTab;
            activeConversation = null;
            dialogueStep = "ask";
            EX().sfx("uiTap");
            renderPeople();
            return;
        }
        const action = event.target.closest?.("[data-people-action]");
        if (!action) return;
        const kind = action.dataset.peopleAction;
        const value = action.dataset.peopleValue;
        if (kind === "close") {
            document.getElementById("peopleModal")?.close();
        } else if (kind === "talk") {
            const id = nextConversation(value);
            if (!id) return;
            activeConversation = id;
            dialogueStep = "ask";
            EX().sfx("npcGreet");
            renderPeople();
        } else if (kind === "choose") {
            chooseOption(value);
        } else if (kind === "back") {
            activeConversation = null;
            dialogueStep = "ask";
            renderPeople();
        } else if (kind === "start-mission") {
            startMission(value);
        } else if (kind === "claim-mission") {
            claimMission(value);
        }
    }

    function chooseOption(optionId) {
        const conversation = CONVERSATIONS[activeConversation];
        const state = exp();
        if (!conversation || !state) return;
        const option = conversation.options.find(entry => entry.id === optionId);
        if (!option) return;
        // Record first, then pay: the record is what makes the choice
        // permanent, and it is also the guard against a double payout.
        if (state.narrative.choices[activeConversation]) return;
        state.narrative.choices[activeConversation] = option.id;
        state.narrative.met[conversation.npc] = true;
        dialogueReply = option.reply || "";
        dialogueStep = "reply";
        applyOutcome(option.outcome);
        EX().sfx("dialogueBlip");
        renderPeople();
    }

    function renderPeople() {
        const body = document.getElementById("peopleBody");
        if (!body) return;
        const state = exp();
        if (!state) return;

        for (const tab of document.querySelectorAll("#peopleModal [data-people-tab]")) {
            const active = tab.dataset.peopleTab === peopleTab;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        }

        if (activeConversation) {
            const conversation = CONVERSATIONS[activeConversation];
            const npc = NPCS[conversation.npc];
            body.innerHTML =
                '<div class="dialogue">' +
                  '<div class="dialogue-who" style="border-color:' + npc.color + '">' +
                    '<span aria-hidden="true">' + npc.icon + '</span>' +
                    '<div><strong>' + npc.name + '</strong><small>' + npc.role + '</small></div>' +
                  '</div>' +
                  '<p class="dialogue-text">' +
                    (dialogueStep === "reply" ? dialogueReply : conversation.text) + '</p>' +
                  (dialogueStep === "reply"
                    ? '<button type="button" class="city-action" data-people-action="back">Continue</button>'
                    : '<div class="dialogue-options">' + conversation.options.map(option =>
                        '<button type="button" class="dialogue-option" data-people-action="choose" data-people-value="' +
                        option.id + '">' + option.label + '</button>').join("") + '</div>' +
                      '<p class="dialogue-warning">Your answer is recorded permanently and changes what ' +
                      npc.name + ' offers you later.</p>') +
                '</div>';
            return;
        }

        if (peopleTab === "missions") {
            const rows = Object.entries(MISSIONS).map(([id, mission]) => {
                if (!missionUnlocked(id)) {
                    return '<article class="mission-card locked"><header><span aria-hidden="true">🔒</span>' +
                        '<div><strong>' + mission.name + '</strong><small>Not available yet</small></div></header></article>';
                }
                const record = missionState(id);
                const chance = Math.round(successChance(id) * 100);
                const minutes = Math.round(missionDuration(id) / 60000);
                let footer;
                if (record.state === "active") {
                    const remaining = Math.max(0, record.completedAt - Date.now());
                    const total = Math.max(1, record.completedAt - record.startedAt);
                    const percent = Math.round((1 - remaining / total) * 100);
                    footer = '<p class="inspect-progress"><span style="width:' + percent + '%"></span></p>' +
                        '<small>Crew out · back in ' + Math.ceil(remaining / 60000) + ' min</small>';
                } else if (record.state === "done") {
                    footer = '<button type="button" class="city-action" data-people-action="claim-mission" data-people-value="' + id + '">' +
                        (record.progress >= 1 ? "Collect rewards" : "Debrief the crew") + '</button>';
                } else {
                    footer = '<button type="button" class="city-action" data-people-action="start-mission" data-people-value="' + id + '"' +
                        (state.survivors.roster.length < mission.survivors ? ' disabled' : '') + '>Send crew</button>';
                }
                return '<article class="mission-card"><header><span aria-hidden="true">' + mission.icon + '</span>' +
                    '<div><strong>' + mission.name + '</strong>' +
                    '<small>' + minutes + ' min · ' + mission.survivors + ' survivors · ' + chance + '% success</small></div></header>' +
                    '<p>' + mission.desc + '</p>' + footer + '</article>';
            }).join("");
            body.innerHTML = '<p class="people-note">Missions run in real time and keep running while you play. ' +
                'A bigger roster, Tomas\'s training and research all raise your odds.</p>' +
                '<div class="mission-grid">' + rows + '</div>';
            return;
        }

        if (peopleTab === "log") {
            const entries = state.narrative.log;
            body.innerHTML = entries.length
                ? '<ul class="journal">' + entries.map(entry =>
                    '<li class="journal-' + entry.kind + '"><time>' +
                    new Date(entry.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) +
                    '</time><span>' + entry.text + '</span></li>').join("") + '</ul>'
                : '<p class="people-note">Nothing recorded yet. Build, explore and talk to people, and this fills up.</p>';
            return;
        }

        const discovered = Object.keys(state.narrative.discoveries).length;
        const cards = Object.entries(NPCS).map(([id, npc]) => {
            let unlocked = false;
            try { unlocked = !!npc.unlock(); } catch (_) { unlocked = false; }
            if (!unlocked) {
                return '<article class="npc-card locked"><header><span aria-hidden="true">🔒</span>' +
                    '<div><strong>Unknown</strong><small>Not met yet</small></div></header>' +
                    '<p>Keep building. Not everyone has found you.</p></article>';
            }
            const value = relationship(id);
            const pending = nextConversation(id);
            const spoken = conversationsFor(id).filter(key => state.narrative.choices[key]).length;
            return '<article class="npc-card"><header><span aria-hidden="true" style="color:' + npc.color + '">' +
                npc.icon + '</span><div><strong>' + npc.name + '</strong><small>' + npc.role + '</small></div></header>' +
                '<p>' + npc.intro + '</p>' +
                '<p class="npc-standing"><span>' + relationshipLabel(value) + '</span>' +
                '<em class="npc-meter"><i style="width:' + Math.round((value + 100) / 2) + '%;background:' + npc.color + '"></i></em></p>' +
                '<small class="npc-history">' + spoken + ' conversation' + (spoken === 1 ? '' : 's') + ' recorded</small>' +
                (pending
                    ? '<button type="button" class="city-action" data-people-action="talk" data-people-value="' + id + '">Talk <span class="npc-dot">●</span></button>'
                    : '<button type="button" class="city-action" disabled>Nothing new right now</button>') +
                '</article>';
        }).join("");

        body.innerHTML =
            '<p class="people-note">' + state.survivors.roster.length + ' survivors · ' +
            discovered + ' discoveries recorded. Conversations are permanent.</p>' +
            '<div class="npc-grid">' + cards + '</div>';
    }

    // ---------------------------------------------------------------
    // Event dialog
    // ---------------------------------------------------------------

    function openEvent(id) {
        ensureDialogs();
        const event = EVENTS[id];
        const state = exp();
        if (!event || !state) return;
        state.narrative.activeEvent = id;
        state.narrative.eventsSeen++;
        const shell = document.getElementById("eventShell");
        if (shell) {
            shell.innerHTML =
                '<p class="eyebrow">CITY EVENT</p>' +
                '<h2 id="eventTitle"><span aria-hidden="true">' + event.icon + '</span> ' + event.title + '</h2>' +
                '<p class="event-text">' + event.text + '</p>' +
                '<div class="event-options">' + event.options.map(option =>
                    '<button type="button" class="dialogue-option" data-event-choice="' + option.id + '">' +
                    option.label + '</button>').join("") + '</div>';
        }
        const dialog = document.getElementById("eventModal");
        if (dialog && !dialog.open) dialog.showModal();
        EX().sfx("npcGreet");
        EX().logEvent(event.title, "event");
    }

    function onEventClick(clickEvent) {
        const button = clickEvent.target.closest?.("[data-event-choice]");
        if (!button) return;
        const state = exp();
        if (!state) return;
        const event = EVENTS[state.narrative.activeEvent];
        if (!event) { document.getElementById("eventModal")?.close(); return; }
        const option = event.options.find(entry => entry.id === button.dataset.eventChoice);
        state.narrative.choices["event:" + state.narrative.activeEvent + ":" + Date.now()] = option?.id || "none";
        state.narrative.activeEvent = "";
        document.getElementById("eventModal")?.close();
        if (option) applyOutcome(option.outcome);
        EX().sfx("uiTap");
    }

    // ---------------------------------------------------------------
    // Module interface
    // ---------------------------------------------------------------

    function tick() {
        const state = exp();
        if (!state) return;
        for (const id of Object.keys(state.narrative.missions)) {
            if (state.narrative.missions[id].state === "active") resolveMission(id);
        }
        maybeFireEvent();
        // Keep an open mission list ticking down.
        if (document.getElementById("peopleModal")?.open && peopleTab === "missions" && !activeConversation) {
            renderPeople();
        }
    }

    // Shows a dot on the city's People button when somebody has something new.
    function pendingCount() {
        const state = exp();
        if (!state) return 0;
        let count = 0;
        for (const id of Object.keys(NPCS)) if (nextConversation(id)) count++;
        for (const id of Object.keys(MISSIONS)) {
            if (missionState(id).state === "done") count++;
        }
        return count;
    }

    function alwaysRender() {
        const badge = document.getElementById("peopleBadge");
        if (!badge) return;
        const count = pendingCount();
        const text = count > 9 ? "9+" : String(count);
        badge.hidden = count === 0;
        if (!badge.hidden && badge.textContent !== text) badge.textContent = text;
    }

    function onLoad() {
        activeConversation = null;
        dialogueStep = "ask";
        const state = exp();
        if (state && !state.narrative.nextEventAt) scheduleNextEvent();
        document.getElementById("peopleModal")?.close?.();
        document.getElementById("eventModal")?.close?.();
    }

    function init() {
        ensureDialogs();
        // A discovery found by searching wreckage in the city view.
        EX()?.on("city:discovery", () => {
            const state = exp();
            if (!state) return;
            const pool = ["cache-logs", "old-map", "family-photo", "service-manual", "radio-log"];
            const id = pool[Math.floor(Math.random() * pool.length)];
            if (state.narrative.discoveries[id]) {
                applyOutcome({ research: 12 });
                return;
            }
            applyOutcome({ discovery: id, research: 22, log: "A new discovery was catalogued." });
        });
        // A cleared boss wave is worth a story beat.
        EX()?.on("combat:boss", payload => {
            EX().logEvent("A " + (payload?.boss || "boss") + " was destroyed at the perimeter.", "combat");
        });
        // Open the people dialog from anywhere.
        document.addEventListener("click", event => {
            if (event.target?.closest?.("[data-open-people]")) {
                event.preventDefault();
                openPeople(event.target.closest("[data-open-people]").dataset.openPeople || "people");
            }
        });
    }

    global.LastCityExpansion?.register?.("events", {
        init, tick, onLoad, alwaysRender,
        openPeople, openEvent,
        NPCS, MISSIONS, EVENTS, CONVERSATIONS,
        relationship, successChance, missionDuration, pendingCount,
        _applyOutcome: applyOutcome,
        _startMission: startMission,
        _resolveMission: resolveMission,
        _claimMission: claimMission,
        _chooseOption: chooseOption,
        _nextConversation: nextConversation,
        _forceRecruit: forceRecruit
    });
})(typeof window !== "undefined" ? window : globalThis);
