// ===============================================================
// RECONSTRUCTION LEVEL
//
// A second progression track running alongside Salvage, for two reasons.
//
// 1. ENGAGEMENT. Production per second climbs smoothly and never gives the
//    player a discrete "I achieved something" beat. A level does.
//
// 2. SPENDING HAS TO BE A DECISION. Prices alone cap the TOTAL you can own,
//    but they do not make the moment of spending interesting: banking fifteen
//    minutes of income and pressing MAX took a city from 2.7 to 8.9 Salvage a
//    second in one press, and with enough banked Salvage MAX bought all 25
//    remaining Scavenger Camps at once. Every purchase now also costs BUILD
//    ALLOWANCE, which is earned by playing rather than by waiting.
//
// The balance between the two is the whole design:
//
//   - XP comes from ACTIVE play - gathering by hand, building, finishing
//     objectives, renewing. Idling earns Salvage but not XP, so the limit
//     bites exactly on the player who hoards and dumps.
//   - Allowance also trickles back on a timer, so a player who steps away
//     still returns able to act. It is capped, so the trickle can never
//     accumulate into a second dump.
//   - Normal play earns allowance faster than it spends it. The ceiling is
//     meant to be invisible unless you are deliberately hoarding.
//
// Nothing here touches production. It gates WHEN you may buy, never what a
// purchase is worth.
// ===============================================================

// Experience needed to reach level n from level n-1.
// Gentle enough that the opening gives a level roughly every minute or two,
// and steep enough that it keeps meaning something later.
const LEVEL_XP_BASE = 60;
const LEVEL_XP_EXPONENT = 1.22;
const LEVEL_MAX = 999;

function xpForLevel(level) {
    const n = Math.max(1, Math.floor(level));
    return Math.round(LEVEL_XP_BASE * Math.pow(n, LEVEL_XP_EXPONENT));
}

// Build allowance.
// The refill RATE is what does the work, not the budget.
//
// A player buying at a natural pace purchases roughly every eleven seconds in
// Ashfall, so a refill a little faster than that is invisible to them. What it
// is not invisible to is a burst: the CAP is what a hoarder can spend at once,
// and it is deliberately far below the 25 camps that MAX used to buy.
//
// Tuned against the purchase-path simulator: at 45 seconds a first run spent
// 14.5% of its time waiting on allowance, which is exactly the dead time the
// pacing work spent three passes removing.
const ALLOWANCE_PER_LEVEL = 5;        // granted immediately on level up
const ALLOWANCE_REFILL_MS = 10000;    // one back every 10 seconds
const ALLOWANCE_CAP_BASE = 6;         // most that can ever be held at once...
const ALLOWANCE_CAP_PER_LEVEL = 0.25; // ...growing slowly with the level
const ALLOWANCE_START = 6;            // a new city starts at its ceiling

// What each action is worth. Deliberately weighted towards doing things
// rather than owning things.
// XP rewards a DECISION, not a quantity.
//
// Paying per building meant a batch of six granted 72 XP, which levelled the
// player up and handed back five allowance - the reward was refunding the
// limit it existed to enforce. One purchase is one decision, whether it placed
// one building or six.
const XP_REWARDS = {
    gather: 1,          // one hand-gathered Salvage
    building: 18,       // a build order, however many it placed
    upgrade: 15,        // buying an upgrade level
    infrastructure: 15, // a zone building
    contract: 60,       // claiming a city contract
    milestone: 40,      // a beacon module, a relay tower, a delivered engine
    renewal: 250,       // a city renewal or zone reset
    zone: 600           // restoring a whole zone
};

function levelState() {
    if (!game.progress || typeof game.progress !== "object") {
        game.progress = { level: 1, xp: 0, allowance: ALLOWANCE_START, lastRefill: Date.now(), spent: 0 };
    }
    const p = game.progress;
    if (!Number.isFinite(p.level) || p.level < 1) p.level = 1;
    if (!Number.isFinite(p.xp) || p.xp < 0) p.xp = 0;
    if (!Number.isFinite(p.allowance) || p.allowance < 0) p.allowance = 0;
    if (!Number.isFinite(p.lastRefill)) p.lastRefill = Date.now();
    return p;
}

function allowanceCap() {
    const p = levelState();
    return Math.floor(ALLOWANCE_CAP_BASE + p.level * ALLOWANCE_CAP_PER_LEVEL);
}

// The trickle. Called from the game loop; also catches up after a reload so
// time away is credited, but only up to the cap.
function refillAllowance(now = Date.now()) {
    const p = levelState();
    if (p.allowance >= allowanceCap()) { p.lastRefill = now; return 0; }
    const elapsed = now - p.lastRefill;
    if (elapsed < ALLOWANCE_REFILL_MS) return 0;
    const earned = Math.floor(elapsed / ALLOWANCE_REFILL_MS);
    const before = p.allowance;
    p.allowance = Math.min(allowanceCap(), p.allowance + earned);
    p.lastRefill = now - (elapsed % ALLOWANCE_REFILL_MS);
    return p.allowance - before;
}

function allowanceLeft() {
    refillAllowance();
    return Math.floor(levelState().allowance);
}

// Seconds until the next allowance arrives, for the interface.
function allowanceNextIn(now = Date.now()) {
    const p = levelState();
    if (p.allowance >= allowanceCap()) return 0;
    return Math.max(0, Math.ceil((ALLOWANCE_REFILL_MS - (now - p.lastRefill)) / 1000));
}

function spendAllowance(count = 1) {
    const p = levelState();
    refillAllowance();
    const amount = Math.max(0, Math.floor(count));
    if (p.allowance < amount) return false;
    p.allowance -= amount;
    p.spent = (p.spent || 0) + amount;
    return true;
}

// How many of something the player may buy right now: what they can afford,
// capped by what they are allowed to place. This is what stops MAX from
// emptying a banked balance into the board in one press.
function allowedCount(affordable) {
    return Math.max(0, Math.min(Math.floor(affordable) || 0, allowanceLeft()));
}

function grantXp(kind, times = 1) {
    const amount = (XP_REWARDS[kind] || 0) * Math.max(0, times);
    if (!amount) return 0;
    const p = levelState();
    p.xp += amount;
    let levelled = 0;
    while (p.level < LEVEL_MAX && p.xp >= xpForLevel(p.level)) {
        p.xp -= xpForLevel(p.level);
        p.level++;
        levelled++;
        p.allowance = Math.min(allowanceCap(), p.allowance + ALLOWANCE_PER_LEVEL);
    }
    if (levelled) announceLevel(p.level, levelled);
    return amount;
}

function announceLevel(level, gained) {
    const message = "Reconstruction Level " + level + " · +" +
        (ALLOWANCE_PER_LEVEL * gained) + " build allowance";
    if (typeof showNotification === "function") showNotification(message);
    if (typeof playSfx === "function") { try { playSfx("upgrade"); } catch (_) { } }
    try { window.LastCityExpansion?.logEvent?.(message, "good"); } catch (_) { }
}

// A renewal clears the city but not what the player has learned: level, XP and
// allowance all survive, the same way research and companions do.
function normalizeProgress(saved, loaded) {
    if (saved && typeof saved === "object") {
        const level = Math.max(1, Math.min(LEVEL_MAX, Math.floor(Number(saved.level) || 1)));
        return {
            level,
            xp: Math.max(0, Number(saved.xp) || 0),
            allowance: Math.max(0, Math.min(Math.floor(ALLOWANCE_CAP_BASE + level * ALLOWANCE_CAP_PER_LEVEL),
                                            Number(saved.allowance) || 0)),
            lastRefill: Number.isFinite(saved.lastRefill) ? saved.lastRefill : Date.now(),
            spent: Math.max(0, Number(saved.spent) || 0)
        };
    }
    const level = levelFromProgress(loaded);
    return {
        level,
        xp: 0,
        allowance: Math.floor(ALLOWANCE_CAP_BASE + level * ALLOWANCE_CAP_PER_LEVEL),
        lastRefill: Date.now(),
        spent: 0
    };
}

// A save written before this feature existed has no level, but its owner has
// obviously been playing. Starting them at level 1 with six builds in hand
// would throttle a city of two hundred buildings, so an existing save is
// credited a level from the progression it already has.
function levelFromProgress(loaded) {
    if (!loaded || typeof loaded !== "object") return 1;
    const owned = Object.values(loaded.buildings || {})
        .reduce((sum, n) => sum + (Number(n) || 0), 0);
    const zones = [2, 3, 4, 5].filter(s => loaded["stage" + s + "Unlocked"]).length;
    const renewals = Number(loaded.rebirths) || 0;
    const credit = 1
        + Math.floor(owned / 12)
        + zones * 4
        + Math.min(20, Math.floor(renewals * 1.5));
    return Math.max(1, Math.min(LEVEL_MAX, credit));
}
