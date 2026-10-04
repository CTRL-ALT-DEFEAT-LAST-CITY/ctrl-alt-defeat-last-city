// Zone presentation and a persistent, milestone-earned narrative archive.
const WORLD_THEMES = {
    1: { name: "Ashfall Outpost", mood: "Embers in the ruins", art: "ashfall", color: "#f4bf76", activity: "Build & restore", intro: "A single campfire. A broken beacon. A city worth bringing back." },
    2: { name: "Overgrown Depot", mood: "Life through the cracks", art: "depot", color: "#92e2b1", activity: "Search & recover", intro: "Follow the rails, find the lost keys, and give the survivors a way home." },
    3: { name: "Copperworks Foundry", mood: "The heart starts beating", art: "foundry", color: "#ffab7d", activity: "Assemble & deliver", intro: "Every engine you build brings another silent district back to life." },
    4: { name: "Neon Relay", mood: "Signals in the dark", art: "relay", color: "#c4a5ff", activity: "Collect & connect", intro: "Catch drifting energy and weave the scattered settlements into one city." },
    5: { name: "Celestial Citadel", mood: "Beyond the last skyline", art: "citadel", color: "#a8dfff", activity: "Break shields & reclaim", intro: "The Guardian still protects the old world. Show it that a new one can begin." }
};
const STORY_ENTRIES = [
    { id: "prologue", stage: 1, title: "The Last Light", speaker: "Builder's journal", hint: "Begin your journey", check: () => true,
      text: ["Year 2189. When the grid fell, the world did not end all at once. It went quiet, one window at a time.", "You arrive at Ashfall with a hand tool and a radio that only answers in static. Someone has scratched three words into the shelter door: WE ARE HERE.", "You light a fire beside the old beacon. Tomorrow, you will find enough salvage to make something that lasts."] },
    { id: "first-camp", stage: 1, title: "A Fire with a Name", speaker: "Mara · camp coordinator", hint: "Build your first Scavenger Camp", check: () => game.buildings.scavenger > 0 || !!game.achievements.firstCamp,
      text: ["Mara plants a little flag beside the camp. 'An outpost needs a name before it needs a skyline,' she says. Ashfall will do.", "The scavengers return with bent beams, copper wire, and a kettle that still works. It is not much. It is enough to begin.", "For the first time, your radio receives something other than static: three faint knocks, repeating from beyond the rail yard."] },
    { id: "shelter", stage: 1, title: "A Door That Opens", speaker: "Builder's journal", hint: "Build a Shelter", check: () => game.buildings.shelter > 0 || game.rebirths > 0 || isZoneUnlocked(2),
      text: ["You expected a shelter to hold supplies. By nightfall, it holds people.", "A mechanic, a gardener, and a child carrying a sleeping cat stand at the doorway. They saw the smoke and followed it.", "A city is not the buildings you finish. It is the people who trust you enough to stay. Their hands will help build what comes next."] },
    { id: "beacon", stage: 1, title: "Someone Answers", speaker: "Recovered radio transmission", hint: "Restore all three beacon modules", check: () => game.adventure.progression.beaconModules >= 3 || isZoneUnlocked(2),
      text: ["The beacon's third module clicks into place. A column of amber light cuts through the ash.", "'Ashfall, this is the depot. We thought nobody was left.' The voice is thin, but unmistakably human.", "Mara hands you a map of the old railway. The beacon was never only a tower. It was a promise that someone would come looking."] },
    { id: "depot-arrival", stage: 2, title: "The Garden on the Tracks", speaker: "Ivo · expedition scout", hint: "Unlock Overgrown Depot", check: () => isZoneUnlocked(2),
      text: ["The rails disappear beneath moss. Trees grow through the roofs of carriages, and the depot clock has stopped at a minute nobody remembers.", "Ivo meets you at the gate. 'The railway kept more than trains moving. Five keys control the old routes. Find them, and we can reach the foundry.'", "You establish a camp between two silent platforms. Somewhere in the leaves, a small companion decides to follow you."] },
    { id: "depot-keys", stage: 2, title: "Names on the Brass", speaker: "Ivo's field notes", hint: "Recover three depot keys", check: () => isZoneUnlocked(2) && (game.adventure.keys >= 3 || isZoneUnlocked(3)),
      text: ["Each key bears a district name instead of a number. Whoever designed the depot expected every neighborhood to matter.", "The third key lies beneath a station bench beside an unfinished letter: 'If the lights return, take the south line home.'", "Ivo folds the letter carefully. You are not searching for treasure. You are recovering the paths people once used to find each other."] },
    { id: "depot-gate", stage: 2, title: "The South Line", speaker: "Builder's journal", hint: "Open the foundry gate", check: () => isZoneUnlocked(3),
      text: ["Five keys turn. The gate shudders, then rises. Beyond it, copper chimneys stand against the evening sky.", "The survivors begin loading supplies before anyone asks. The camp has become a depot again.", "On the far side of the tracks, a furnace glows. The foundry has been waiting for someone to give it work."] },
    { id: "foundry-arrival", stage: 3, title: "An Engine without a City", speaker: "Sera · foundry engineer", hint: "Unlock Copperworks Foundry", check: () => isZoneUnlocked(3),
      text: ["Sera has kept one furnace alive through years of silence. 'Machines do not know when to give up,' she says. 'I took the hint.'", "The foundry's order board still carries requests from water pumps, shelters, and relay stations. A different engine for every kind of need.", "You clear the assembly line. Gears, springs, and plates become more than scrap when you put them in the right order."] },
    { id: "first-engine", stage: 3, title: "The Sound of Running Water", speaker: "Delivery receipt · south district", hint: "Deliver your first engine", check: () => isZoneUnlocked(3) && (game.adventure.deliveries >= 1 || isZoneUnlocked(4)),
      text: ["Your first engine reaches an abandoned pumping station. Sera connects it, tightens the last bolt, and steps back.", "Water moves through the pipes. Someone laughs, then everyone does.", "The receipt has no price written on it. Only a message: 'We can stay here now.' You pin it beside the next order."] },
    { id: "foundry-orders", stage: 3, title: "Eighteen Reasons", speaker: "Sera's workshop log", hint: "Complete 18 engine deliveries", check: () => isZoneUnlocked(3) && (game.adventure.deliveries >= 18 || isZoneUnlocked(4)),
      text: ["Eighteen engines leave the foundry. Each powers a place that was nearly forgotten: a clinic, a greenhouse, a station, a home.", "The last order is different. Three relay towers need power, and their destination is marked NEON DISTRICT.", "'We have learned to build,' Sera says. 'Now we need to learn to connect.' Beyond the gate, violet light flickers between rooftops."] },
    { id: "relay-arrival", stage: 4, title: "A City in Fragments", speaker: "Nox · relay operator", hint: "Unlock Neon Relay", check: () => isZoneUnlocked(4),
      text: ["Energy drifts through the district in bright fragments. The old network can carry it, but none of the towers agree on where it should go.", "Nox gives you a collector. 'Catch the loose signal. Build the relays. A city is stronger when its districts can talk.'", "Under the violet sky, you begin gathering the pieces of a conversation that stopped years ago."] },
    { id: "relay-energy", stage: 4, title: "Voices in the Signal", speaker: "Recovered network buffer", hint: "Collect 20 energy pickups", check: () => isZoneUnlocked(4) && (game.adventure.progression.fieldCollected >= 20 || isZoneUnlocked(5)),
      text: ["The twentieth fragment carries a recording. A teacher calls attendance. A train announces its next stop. A gardener asks for tomorrow's weather.", "These are the things the network was built to carry. Ordinary lives, crossing extraordinary distances.", "Nox tunes the collector. Beneath the old recordings, a new signal waits high above the skyline: CITADEL REACTOR ONLINE."] },
    { id: "relay-towers", stage: 4, title: "Three Lights, One Horizon", speaker: "Nox's relay report", hint: "Build all three Relay Towers", check: () => isZoneUnlocked(4) && (game.adventure.progression.relayTowers >= 3 || isZoneUnlocked(5)),
      text: ["The three towers synchronize. Amber from Ashfall, green from the depot, and copper from the foundry flow into a single violet pulse.", "Messages arrive faster than Nox can read them. Every district has something to offer. Every district needs something in return.", "Then the Citadel answers: 'Unauthorized civilization detected.' Its Guardian still follows the last command of the old world."] },
    { id: "citadel-arrival", stage: 5, title: "The Last Command", speaker: "Citadel security archive", hint: "Unlock Celestial Citadel", check: () => isZoneUnlocked(5),
      text: ["Above the clouds, the Citadel's reactor never went dark. Its Guardian was ordered to seal the core until humanity could recover.", "No one told it what recovery would look like. It has mistaken isolation for protection ever since.", "You bring proof of another answer: a camp, a railway, a foundry, and a network of people who chose to help each other."] },
    { id: "guardian-shields", stage: 5, title: "A Crack in the Protocol", speaker: "Guardian diagnostic stream", hint: "Disable all three Guardian shields", check: () => isZoneUnlocked(5) && (game.adventure.shields.length >= 3 || game.adventure.bossHealth < 100 || game.adventure.bossDefeated),
      text: ["The shields fall. For a moment the Guardian hesitates, comparing the city below with the empty world stored in its memory.", "'Population detected. Water systems detected. Cooperative infrastructure detected.' Its voice softens, then the old security command returns.", "You charge the cannon. Reclaiming the reactor will take more than one opening. The people below keep the relays steady."] },
    { id: "guardian-fall", stage: 5, title: "Permission to Begin", speaker: "Guardian final transmission", hint: "Defeat the Guardian", check: () => isZoneUnlocked(5) && game.adventure.bossDefeated,
      text: ["The Guardian lowers its weapons. The reactor's light spills across the clouds.", "'Recovery confirmed,' it says. 'I was waiting for a command. You brought a city.'", "Power reaches the districts in waves. Mara raises the camp flag. Ivo starts the station clock. Sera opens the workshop doors. Nox leaves the network running."] },
    { id: "ending", stage: 5, title: "The First City", speaker: "Builder's journal", hint: "Purchase The Last City upgrade", check: () => game.gameCompleted,
      text: ["People still call it the Last City. You understand why. It reminds them how close the light came to going out.", "But new roads stretch beyond the old map. Other settlements answer the beacon. The city is no longer an ending.", "You close this journal and leave a fresh one on the table. Tomorrow, someone else will begin."] }
];
let storySelected = "prologue", storyScope = "all", worldUIReady = false;

function normalizeStory(saved = {}) {
    return {
        unlocked: Object.fromEntries(STORY_ENTRIES.filter(entry => Number.isFinite(saved?.unlocked?.[entry.id]) && saved.unlocked[entry.id] > 0).map(entry => [entry.id, saved.unlocked[entry.id]])),
        read: Object.fromEntries(STORY_ENTRIES.filter(entry => saved?.read?.[entry.id] === true && Number.isFinite(saved?.unlocked?.[entry.id]) && saved.unlocked[entry.id] > 0).map(entry => [entry.id, true]))
    };
}
function unlockedStories() { return STORY_ENTRIES.filter(entry => game.story.unlocked[entry.id]); }
function unreadStories() { return unlockedStories().filter(entry => !game.story.read[entry.id]); }
function checkStoryUnlocks() {
    const fresh = STORY_ENTRIES.filter(entry => !game.story.unlocked[entry.id] && entry.check());
    fresh.forEach(entry => { game.story.unlocked[entry.id] = Date.now(); });
    // This timestamp is the discovery time, not a reward or a second gameplay action.
    return fresh;
}
function switchGameMode(mode) {
    if (!["city", "upgrades", "stats", "companions", "stories"].includes(mode) || window.LastCityCloud?.isSwitching?.()) return;
    const changed = currentGameMode !== mode;
    currentGameMode = mode;
    ["upgrades", "stats", "companions", "stories"].forEach(name => document.body.classList.toggle(name + "-open", mode === name));
    gameModeTabs.forEach(tab => { tab.classList.toggle("active", tab.dataset.mode === mode); tab.setAttribute("aria-pressed", String(tab.dataset.mode === mode)); });
    updateGame();
    if (changed) animateNavigation(document.querySelector('.game-mode-tab[data-mode="' + mode + '"]'));
}
function openStory(id) {
    if (!game.story.unlocked[id] || !STORY_ENTRIES.some(entry => entry.id === id) || window.LastCityCloud?.isSwitching?.()) return false;
    storySelected = id;
    if (storyScope !== "all" && Number(storyScope) !== STORY_ENTRIES.find(entry => entry.id === id).stage) storyScope = "all";
    game.story.read[id] = true;
    switchGameMode("stories");
    renderStoryArchive();
    animateVfx(el("storyReaderTitle")?.closest?.(".story-reader"), [{ opacity: .5 }, { opacity: 1 }], { duration: 250 });
    saveGame(false);
    el("storyReaderTitle")?.focus?.({ preventScroll: true });
    return true;
}
function renderStoryArchive() {
    const panel = el("storyPanel");
    if (!panel || currentGameMode !== "stories") return;
    const entries = STORY_ENTRIES.filter(entry => storyScope === "all" || entry.stage === Number(storyScope));
    if (!entries.some(entry => entry.id === storySelected && game.story.unlocked[entry.id])) {
        storySelected = entries.find(entry => game.story.unlocked[entry.id])?.id || "";
    }
    const selected = STORY_ENTRIES.find(entry => entry.id === storySelected && game.story.unlocked[entry.id]);
    const markup = '<div class="archive-heading"><div><p class="eyebrow">RECOVERED TRANSMISSIONS</p><h2>City Archives</h2><p>Your journey, one discovery at a time. Stories stay unlocked through renewals.</p></div><strong>' + unlockedStories().length + '/' + STORY_ENTRIES.length + ' discovered</strong></div>'
        + '<div class="story-filters" aria-label="Filter stories by zone">' + ["all", 1, 2, 3, 4, 5].map(stage => '<button data-story-filter="' + stage + '" aria-pressed="' + (String(stage) === storyScope) + '">' + (stage === "all" ? "All chapters" : WORLD_THEMES[stage].name) + '</button>').join("") + '</div>'
        + '<div class="archive-layout"><nav class="story-index" aria-label="Story index">' + entries.map(entry => {
            const unlocked = !!game.story.unlocked[entry.id], unread = unlocked && !game.story.read[entry.id];
            return '<button data-story-id="' + entry.id + '" aria-pressed="' + (entry.id === storySelected) + '" ' + (!unlocked ? "disabled" : "") + '><small>CHAPTER ' + entry.stage + (unread ? ' · UNREAD' : unlocked ? ' · RECOVERED' : ' · LOCKED') + '</small><strong>' + (unlocked ? entry.title : 'Unrecovered transmission') + '</strong><span>' + (unlocked ? entry.speaker : entry.hint) + '</span></button>';
        }).join("") + '</nav><article class="story-reader" aria-labelledby="storyReaderTitle">' + (selected
            ? '<div class="story-art story-art-' + selected.stage + '" role="img" aria-label="' + WORLD_THEMES[selected.stage].name + ' landscape"></div><div class="story-page"><p class="eyebrow">' + WORLD_THEMES[selected.stage].name + ' · ' + selected.speaker + '</p><h3 id="storyReaderTitle" tabindex="-1">' + selected.title + '</h3>' + selected.text.map(paragraph => '<p>' + paragraph + '</p>').join("") + '<button data-story-id="' + selected.id + '" class="secondary-button">' + (game.story.read[selected.id] ? "Read again" : "Mark as read") + '</button></div>'
            : '<div class="story-page"><h3 id="storyReaderTitle" tabindex="-1">A signal still waiting</h3><p>Complete this zone’s milestones to recover its stories. You can return to any unlocked chapter whenever you like.</p></div>') + '</article></div>';
    if (panel.innerHTML !== markup) panel.innerHTML = markup;
}
function renderWorldUI() {
    const theme = WORLD_THEMES[currentStageView], unread = unreadStories(), latest = unread[unread.length - 1];
    document.body.dataset.zone = currentStageView;
    stageTabs.forEach(tab => tab.setAttribute("aria-pressed", String(Number(tab.dataset.stage) === currentStageView)));
    document.body.style.setProperty("--world-art", "url('assets/zones/" + theme.art + ".png')");
    const values = { worldZoneName: theme.name, worldZoneMood: theme.mood, worldZoneIntro: theme.intro,
        worldZoneNumber: "ZONE 0" + currentStageView + " / 05", worldActivity: theme.activity,
        worldObjective: (currentStageView < 5 ? isZoneUnlocked(currentStageView + 1) : game.adventure.bossDefeated) ? "Objective complete · keep building your legacy" : ZONES[currentStageView].quest };
    for (const [id, value] of Object.entries(values)) if (el(id) && el(id).textContent !== value) el(id).textContent = value;
    const count = el("storyUnreadCount");
    if (count) { if (String(count.textContent) !== String(unread.length)) count.textContent = unread.length; count.hidden = !unread.length; }
    const notice = el("storyNotice");
    if (notice) notice.hidden = !latest || currentGameMode === "stories";
    const noticeTitle = latest ? "New story: " + latest.title : "Stories up to date";
    if (el("storyNoticeTitle") && el("storyNoticeTitle").textContent !== noticeTitle) el("storyNoticeTitle").textContent = noticeTitle;
    if (el("readLatestStory")) el("readLatestStory").dataset.storyId = latest?.id || "";
    renderStoryArchive();
}
function initWorldUI() {
    if (worldUIReady) return;
    worldUIReady = true;
    // Use the same destination names as the zone selector and narrative.
    for (let stage = 1; stage < 5; stage++) ZONES[stage].next = WORLD_THEMES[stage + 1].name;
    document.addEventListener?.("click", event => {
        const settings = el("playerSettings");
        if (settings?.open && settings.contains && !settings.contains(event.target)) settings.open = false;
    });
    document.addEventListener?.("keydown", event => {
        const settings = el("playerSettings");
        if (event.key === "Escape" && settings?.open && !activeHatch && !mergeSelection && !el("accountModal")?.open) {
            settings.open = false;
            settings.querySelector("summary")?.focus?.();
        }
    });
    el("storyPanel")?.addEventListener("click", event => {
        const button = event.target.closest?.("button");
        if (!button || button.disabled) return;
        if (button.dataset.storyId) openStory(button.dataset.storyId);
        else if (button.dataset.storyFilter && ["all", "1", "2", "3", "4", "5"].includes(button.dataset.storyFilter)) {
            storyScope = button.dataset.storyFilter;
            renderStoryArchive();
            animateViewEntry(el("storyPanel"));
        }
    });
    el("readLatestStory")?.addEventListener("click", event => openStory(event.currentTarget.dataset.storyId));
    el("worldExploreButton")?.addEventListener("click", () => {
        switchGameMode("city");
        el("zone" + currentStageView)?.scrollIntoView?.({ behavior: canPlayVfx() ? "smooth" : "auto", block: "start" });
    });
    el("worldUpgradeButton")?.addEventListener("click", () => switchGameMode("upgrades"));
    if (currentGameMode === "city") renderZone(currentStageView);
    renderWorldUI();
}
