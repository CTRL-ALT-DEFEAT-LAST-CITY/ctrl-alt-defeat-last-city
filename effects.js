// Presentation only: effects never grant currency or delay player input.
const liveVfx = new Map();
const vfxAnimations = new Map();
const vfxPulseTimes = new WeakMap();
let vfxEnabledLast = null;

function canPlayVfx() {
    return game.effectsEnabled !== false && !document.hidden
        && !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}
function clearVfx() {
    for (const [node, timer] of liveVfx) { clearTimeout(timer); node.remove(); }
    liveVfx.clear();
    for (const { animation, timer } of vfxAnimations.values()) {
        clearTimeout(timer); animation.cancel();
    }
    vfxAnimations.clear();
}
function syncVfxPreference() {
    const enabled = canPlayVfx();
    document.body.classList.toggle("vfx-disabled", !enabled);
    const button = el("effectsButton");
    if (button) {
        button.textContent = game.effectsEnabled === false ? "✧ Effects off" : "✦ Effects on";
        button.setAttribute("aria-pressed", String(game.effectsEnabled !== false));
        button.title = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
            ? "Reduced motion is enabled on your device" : "Toggle visual effects";
    }
    if (enabled !== vfxEnabledLast) {
        vfxEnabledLast = enabled;
        if (!enabled) {
            clearVfx();
            if (activeHatch?.phase === "rolling") revealHatch();
        }
    }
}
function mountVfx(node, duration = 1100) {
    const layer = el("fxLayer");
    const limit = window.matchMedia?.("(max-width: 700px)")?.matches ? 20 : 40;
    if (!canPlayVfx() || !layer || liveVfx.size >= limit) return false;
    node.setAttribute("aria-hidden", "true");
    const remove = () => {
        clearTimeout(liveVfx.get(node));
        liveVfx.delete(node);
        node.remove();
    };
    liveVfx.set(node, setTimeout(remove, duration));
    node.addEventListener("animationend", remove, { once: true });
    layer.appendChild(node);
    return true;
}
function animateVfx(node, frames, options = {}) {
    if (!node?.animate || !canPlayVfx() || node.hidden || node.getBoundingClientRect().width === 0) return;
    const previous = vfxAnimations.get(node);
    if (previous) { clearTimeout(previous.timer); previous.animation.cancel(); }
    // Bound work even when navigating rapidly between freshly rendered inventories.
    if (vfxAnimations.size >= 16 && !previous) return;
    const timing = { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)", ...options };
    const animation = node.animate(frames, timing);
    const finish = () => {
        if (vfxAnimations.get(node)?.animation !== animation) return;
        clearTimeout(vfxAnimations.get(node).timer);
        vfxAnimations.delete(node);
        animation.cancel();
    };
    vfxAnimations.set(node, { animation, timer: setTimeout(finish, timing.duration + (timing.delay || 0) + 100) });
    animation.onfinish = finish;
}
function animateViewEntry(panel) {
    if (!canPlayVfx() || !panel) return;
    // Cancel stale entrances so repeated tab changes never pile up.
    for (const { animation, timer } of vfxAnimations.values()) { clearTimeout(timer); animation.cancel(); }
    vfxAnimations.clear();
    animateVfx(panel, [{ opacity: .4, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }]);
    const cards = [...panel.querySelectorAll(".resource-card, .city-panel, .building-panel, .upgrade-sidebar, .stats-hero, .stat-group, .egg-display, .inventory-equipped, .pet-card")]
        .filter(card => card.getBoundingClientRect().width > 0).slice(0, 8);
    cards.forEach((card, index) => animateVfx(card,
        [{ opacity: .3, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 300, delay: index * 25 }));
}
function animateNavigation(tab) {
    const panel = currentGameMode === "stats" ? el("statsPanel")
        : currentGameMode === "companions" ? el("companionPanel") : el("stage" + currentStageView + "Panel");
    animateViewEntry(panel);
    pulseVfx(tab);
}
function pulseVfx(node, color = "rgba(94,234,255,.45)") {
    if (!node || !canPlayVfx()) return;
    const now = Date.now();
    if (now - (vfxPulseTimes.get(node) ?? -Infinity) < 180) return;
    vfxPulseTimes.set(node, now);
    animateVfx(node, [{ boxShadow: "0 0 0 2px " + color }, { boxShadow: "0 0 0 10px transparent" }], { duration: 450 });
}
function pulseResource(stage, critical = false) {
    if (stage !== currentStageView || currentGameMode !== "city") return;
    pulseVfx(el("stage" + stage + "Panel")?.querySelector(".resource-card"), critical ? "rgba(255,194,71,.65)" : undefined);
}
function initVfx() {
    syncVfxPreference();
    el("effectsButton")?.addEventListener("click", () => {
        game.effectsEnabled = game.effectsEnabled === false;
        syncVfxPreference();
        saveGame(false);
    });
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", syncVfxPreference);
    document.addEventListener?.("visibilitychange", syncVfxPreference);
    // Capture the original target before purchase handlers replace button markup.
    document.addEventListener?.("click", event => {
        const button = event.target.closest?.("button");
        if (!button || button.disabled || !canPlayVfx() || button.closest?.("#accountModal")) return;
        if (button.closest?.("dialog")) { pulseVfx(button); return; }
        const rect = button.getBoundingClientRect();
        const ripple = document.createElement("i");
        ripple.className = "interaction-ripple";
        ripple.style.left = (event.detail ? event.clientX : rect.left + rect.width / 2) + "px";
        ripple.style.top = (event.detail ? event.clientY : rect.top + rect.height / 2) + "px";
        mountVfx(ripple, 650);
    }, true);
}
