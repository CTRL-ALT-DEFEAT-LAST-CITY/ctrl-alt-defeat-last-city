const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const timers = new Map(), nodes = new Map(), animations = [];
const state = { reduced: false, mobile: false, now: 1000 };
let sequence = 0;
function node() {
    const classes = new Set();
    return {
        hidden: false, width: 200, style: {}, children: [], attributes: {}, listeners: {},
        classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        appendChild(child) { this.children.push(child); child.parent = this; },
        remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
        getBoundingClientRect() { return { left: 20, top: 30, width: this.width, height: 80 }; },
        querySelectorAll() { return this.children; }, querySelector() { return this.children[0]; },
        animate(frames, timing) {
            const animation = { frames, timing, cancel() { this.cancelled = true; } };
            animations.push(animation);
            return animation;
        }
    };
}
for (const id of ["fxLayer", "effectsButton", "stage1Panel", "stage2Panel", "statsPanel", "companionPanel"]) nodes.set(id, node());
const body = node(), doc = { body, hidden: false, createElement: node, addEventListener(name, callback) { this[name] = callback; } };
const context = vm.createContext({
    game: { effectsEnabled: true, salvage: 123, adventure: { eggsHatched: 0 } },
    currentStageView: 1, currentGameMode: "city", activeHatch: null,
    document: doc, window: { matchMedia(query) { return { matches: query.includes("reduced") ? state.reduced : state.mobile, addEventListener(name, callback) { state.motionChange = callback; } }; } },
    el: id => nodes.get(id), Date: { now: () => state.now },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    saveGame() { state.saves = (state.saves || 0) + 1; },
    revealHatch() { context.activeHatch.phase = "revealed"; state.reveals = (state.reveals || 0) + 1; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "effects.js"), "utf8"), context);
const run = code => vm.runInContext(code, context);
run("initVfx()");
const snapshot = JSON.stringify(context.game);

// Particle budgets and timer cleanup apply even if animationend never fires.
for (let i = 0; i < 50; i++) run("mountVfx(document.createElement('i'))");
assert.equal(run("liveVfx.size"), 40);
assert.equal(nodes.get("fxLayer").children.length, 40);
for (const callback of [...timers.values()]) callback();
assert.equal(run("liveVfx.size"), 0);
assert.equal(timers.size, 0);
state.mobile = true;
for (let i = 0; i < 30; i++) run("mountVfx(document.createElement('i'))");
assert.equal(run("liveVfx.size"), 20);
run("clearVfx()");
state.mobile = false;

// Stagger is bounded, hidden cards are skipped, and rapid navigation cancels old motion.
const panel = nodes.get("stage1Panel");
panel.children = Array.from({ length: 15 }, node);
panel.children[0].width = 0;
run("animateViewEntry(el('stage1Panel'))");
assert.equal(run("vfxAnimations.size"), 9);
assert.equal(animations.at(-1).timing.delay, 175);
const previous = animations.slice();
run("animateViewEntry(el('statsPanel'))");
assert(previous.every(animation => animation.cancelled));
assert.equal(run("vfxAnimations.size"), 1);
animations.at(-1).onfinish();
assert.equal(run("vfxAnimations.size"), 0);
assert.equal(timers.size, 0);

// One target's feedback is throttled and replaced, not stacked.
run("pulseVfx(el('effectsButton')); pulseVfx(el('effectsButton'))");
assert.equal(run("vfxAnimations.size"), 1);
const firstPulse = animations.at(-1);
state.now += 200;
run("pulseVfx(el('effectsButton'))");
assert(firstPulse.cancelled);
assert.equal(run("vfxAnimations.size"), 1);
run("clearVfx()");
assert.equal(JSON.stringify(context.game), snapshot, "Effects must not change the economy or inventory");

// Device preference changes cancel motion and safely finish an already-paid hatch.
context.activeHatch = { phase: "rolling" };
run("mountVfx(document.createElement('i')); animateViewEntry(el('statsPanel'))");
state.reduced = true;
state.motionChange();
assert.equal(run("canPlayVfx()"), false);
assert.equal(run("liveVfx.size + vfxAnimations.size"), 0);
assert.equal(timers.size, 0);
assert.equal(state.reveals, 1);
assert(body.classList.contains("vfx-disabled"));
const before = animations.length;
run("animateViewEntry(el('statsPanel')); pulseVfx(el('effectsButton'))");
assert.equal(animations.length, before);
assert.equal(run("mountVfx(document.createElement('i'))"), false);
state.reduced = false;
state.motionChange();
assert.equal(run("canPlayVfx()"), true);
nodes.get("effectsButton").listeners.click();
assert.equal(context.game.effectsEnabled, false);
assert.equal(state.saves, 1);
assert.equal(nodes.get("effectsButton").attributes["aria-pressed"], "false");
doc.hidden = true;
context.game.effectsEnabled = true;
assert.equal(run("canPlayVfx()"), false);
doc.hidden = false;
run("syncVfxPreference()");

// Keyboard activation receives a centered ripple; disabled/account buttons do not.
const button = node();
button.closest = () => null;
doc.click({ target: { closest: () => button }, detail: 0 });
const ripple = nodes.get("fxLayer").children[0];
assert.equal(ripple.style.left, "120px");
assert.equal(ripple.style.top, "70px");
assert.equal(ripple.attributes["aria-hidden"], "true");
button.disabled = true;
doc.click({ target: { closest: () => button }, detail: 0 });
assert.equal(run("liveVfx.size"), 1);
run("clearVfx()");
button.disabled = false;
button.closest = selector => selector === "#accountModal" ? node() : null;
doc.click({ target: { closest: () => button }, detail: 0 });
assert.equal(run("liveVfx.size"), 0, "Account controls remain outside game VFX");
button.closest = selector => selector === "dialog" ? node() : null;
doc.click({ target: { closest: () => button }, detail: 0 });
assert.equal(run("liveVfx.size"), 0, "Dialogs use in-layer feedback instead of behind-dialog particles");
assert.equal(run("vfxAnimations.size"), 1);
run("clearVfx()");
const noAnimationApi = node();
delete noAnimationApi.animate;
context.noAnimationApi = noAnimationApi;
run("animateVfx(noAnimationApi, [])");
assert.equal(run("vfxAnimations.size"), 0);
console.log("Passed: VFX budgets, mobile cap, timer cleanup, stagger limits, rapid navigation cancellation, pulse throttling, unchanged gameplay, reduced motion, hatch safety, saved toggle and keyboard feedback.");
