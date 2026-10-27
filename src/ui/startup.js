// The title page owns its presentation, optional audio and explicit daily claim.
const LAST_CITY_BUILD = { version: '1.0.3-dev', date: '2026.10.11', channel: 'Local review' };
let startupSaveAvailable = false, ambientAudioArmed = false, ambientLoop = null, dailyClaimError = '';
let newGuestConfirmed = false;

function normalizeDailyReward(saved = {}) {
    const day = typeof saved?.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDay)
        && Number.isFinite(Date.parse(saved.lastDay + 'T00:00:00Z'))
        && new Date(saved.lastDay + 'T00:00:00Z').toISOString().slice(0, 10) === saved.lastDay ? saved.lastDay : '';
    return { lastDay: day, lastClaimAt: Number.isFinite(saved?.lastClaimAt) && saved.lastClaimAt >= 0 ? saved.lastClaimAt : 0,
        lastAmount: Number.isFinite(saved?.lastAmount) && saved.lastAmount >= 0 ? saved.lastAmount : 0 };
}
function dailyRewardState(now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10), saved = game.dailyReward;
    // Daily crate. The old floor was a flat 250 Salvage, which handed a brand
    // new player roughly seventeen Scavenger Camps before they had gathered
    // anything — it skipped the whole Gather -> Build -> Automate lesson. The
    // floor now starts small and grows with the zones the player has opened,
    // and the production-based term still takes over for established cities.
    const stagesOpen = 1 + Number(!!game.stage2Unlocked) + Number(!!game.stage3Unlocked)
        + Number(!!game.stage4Unlocked) + Number(!!game.stage5Unlocked);
    const floorAmount = [0, 25, 120, 600, 3000, 15000][stagesOpen] || 25;
    return { today, eligible: saved.lastDay < today && now >= saved.lastClaimAt,
        amount: Math.ceil(Math.max(floorAmount, Math.min(1e100, getSalvagePerSecond() * 60))) };
}
function claimDailyReward() {
    if (document.hidden || !el('introModal')?.open || gameStarted || window.LastCityCloud?.isSwitching?.()
        || el('accountModal')?.open) return false;
    const now = Date.now(), reward = dailyRewardState(now);
    if (!reward.eligible || ![game.salvage, game.totalSalvage, game.lifetimeSalvage].every(Number.isFinite)) return false;
    const values = { salvage: game.salvage + reward.amount, totalSalvage: game.totalSalvage + reward.amount,
        lifetimeSalvage: game.lifetimeSalvage + reward.amount, lastSeen: now,
        dailyReward: { lastDay: reward.today, lastClaimAt: now, lastAmount: reward.amount } };
    if (![values.salvage, values.totalSalvage, values.lifetimeSalvage].every(Number.isFinite)) return false;
    // Persist the complete wallet + claim together before crediting the live game.
    // Failed storage doesn't grant a crate that can be claimed again on refresh.
    try { localStorage.setItem(getSaveKey(), JSON.stringify({ ...game, ...values })); }
    catch (_) { dailyClaimError = 'Storage unavailable. Nothing was credited; try again later.'; el('dailyRewardStatus').textContent = dailyClaimError; return false; }
    Object.assign(game, values);
    dailyClaimError = '';
    startupSaveAvailable = true;
    window.LastCityCloud?.onSave?.(false);
    updateGame();
    playSfx('dispatch');
    return true;
}
// True when nobody is signed in, so the save in play is the shared browser
// guest slot rather than an account's own city.
function isGuestSession() {
    try { return typeof getSaveKey === "function" && getSaveKey() === GUEST_SAVE_KEY; }
    catch (_) { return true; }
}

function renderStartupPage() {
    const stage = [5, 4, 3, 2, 1].find(isZoneUnlocked);
    const guest = isGuestSession(), storedGuest = guest ? guestSaveSummary() : null;
    const values = {
        startProgress: startupSaveAvailable ? 'Continue saved city — Rebirth ' + game.rebirths + ' · Stage ' + stage : 'New Game — your first city awaits',
        startSaveHint: (el('cloudSaveStatus')?.textContent || 'Guest play · saved on this device') + (startupSaveAvailable ? ' · ' + formatDuration(game.playTimeSeconds) + ' played' : ''),
        startBuildInfo: 'v' + LAST_CITY_BUILD.version + ' · Build ' + LAST_CITY_BUILD.date + ' · ' + LAST_CITY_BUILD.channel
    };
    for (const [id, value] of Object.entries(values)) if (el(id) && el(id).textContent !== value) el(id).textContent = value;
    if (el('startContinueButton')) { el('startContinueButton').hidden = !startupSaveAvailable; el('startContinueButton').disabled = !!window.LastCityCloud?.isSwitching?.(); }
    if (el('introStartButton')) el('introStartButton').disabled = !!window.LastCityCloud?.isSwitching?.();

    // Guest mode. One browser is often shared, so a guest is asked whether the
    // stored city is theirs instead of silently inheriting the last person's.
    const newGuest = el('startNewGuestButton');
    if (newGuest) {
        newGuest.hidden = !(guest && storedGuest);
        newGuest.disabled = !!window.LastCityCloud?.isSwitching?.();
    }
    if (el('startPlayLabel') && guest) {
        el('startPlayLabel').textContent = storedGuest ? 'CONTINUE GUEST CITY' : 'PLAY AS GUEST';
    }
    if (guest && storedGuest && el('startProgress')) {
        el('startProgress').textContent = 'Guest city on this browser — Rebirth ' + storedGuest.rebirths +
            ' · Stage ' + storedGuest.stage +
            (storedGuest.playTimeSeconds ? ' · ' + formatDuration(storedGuest.playTimeSeconds) + ' played' : '');
    }
    if (guest && storedGuest && el('startAccountHint')) {
        el('startAccountHint').textContent = 'Not your city? Choose “Start a new guest game” below. Account cities are stored separately and are never replaced.';
    }
    const daily = dailyRewardState();
    el('dailyRewardAmount').textContent = formatNumber(daily.eligible ? daily.amount : game.dailyReward.lastAmount) + ' Salvage';
    el('dailyRewardButton').disabled = !daily.eligible || !!window.LastCityCloud?.isSwitching?.();
    el('dailyRewardButton').textContent = daily.eligible ? 'Claim crate' : 'Claimed';
    el('dailyRewardStatus').textContent = daily.eligible ? dailyClaimError || 'Optional · no streak to maintain · resets 00:00 UTC' : 'Supplies received · next crate resets at 00:00 UTC';
    renderStartupSettings();
}
function renderStartupSettings() {
    for (const [id, enabled, on, off] of [
        ['startSoundButton', game.soundEnabled, '🔊 Sound on', '🔇 Sound off'],
        ['startAmbientButton', game.ambientEnabled === true, '♫ Ambient on', '♫ Ambient off'],
        ['ambientButton', game.ambientEnabled === true, '♫ Ambient on', '♫ Ambient off'],
        ['startEffectsButton', game.effectsEnabled !== false, '✦ Effects on', '✧ Effects off']
    ]) if (el(id)) { el(id).textContent = enabled ? on : off; el(id).setAttribute('aria-pressed', String(!!enabled)); el(id).disabled = !!window.LastCityCloud?.isSwitching?.(); }
    if (el('startResetButton')) el('startResetButton').disabled = !!window.LastCityCloud?.isSwitching?.();
    if (el('startAudioHint')) el('startAudioHint').textContent = !game.soundEnabled ? 'All audio is muted, including ambient sound.'
        : game.ambientEnabled ? ambientAudioArmed ? 'Gentle ambient tones · pauses when this page is hidden.' : 'Ambient enabled · press Play to begin listening.'
        : 'Ambient is optional. Audio begins only after you interact.';
}
function toggleStartupPanel(id) {
    if (!['startSettingsPanel', 'startCreditsPanel'].includes(id)) return;
    const open = el(id).hidden;
    for (const [panel, button] of [['startSettingsPanel', 'startSettingsButton'], ['startCreditsPanel', 'startCreditsButton']]) {
        el(panel).hidden = !(open && panel === id);
        el(button).setAttribute('aria-expanded', String(open && panel === id));
    }
    renderStartupSettings();
}
function closeStartupPanels() {
    for (const [panel, button] of [['startSettingsPanel', 'startSettingsButton'], ['startCreditsPanel', 'startCreditsButton']]) {
        el(panel).hidden = true; el(button).setAttribute('aria-expanded', 'false');
    }
}
function toggleAmbientAudio() {
    if (window.LastCityCloud?.isSwitching?.()) return;
    game.ambientEnabled = game.ambientEnabled !== true;
    ambientAudioArmed = true;
    syncAmbientAudio(); renderStartupSettings(); saveGame(false);
}
function stopAmbientAudio() {
    if (!ambientLoop) return;
    const previous = ambientLoop; ambientLoop = null;
    for (const node of previous.oscillators) { try { node.stop(); node.disconnect(); } catch (_) { } }
    try { previous.context.close()?.catch?.(() => {}); } catch (_) { }
}
function syncAmbientAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!ambientAudioArmed || !game.soundEnabled || game.ambientEnabled !== true || document.hidden
        || window.LastCityCloud?.isSwitching?.() || el('accountModal')?.open || !Audio) { stopAmbientAudio(); return; }
    const stage=typeof currentStageView==='number'?currentStageView:1;
    if (ambientLoop?.stage===stage) return;
    if (ambientLoop) stopAmbientAudio();
    let context;
    try {
        context = new Audio();
        const volume = context.createGain(); volume.gain.value = .012; volume.connect(context.destination);
        const tones={1:[110,164.81,220],2:[98,146.83,196],3:[82.41,123.47,164.81],4:[130.81,196,261.63],5:[146.83,220,293.66]};
        const oscillators = tones[stage].map(frequency => {
            const voice = context.createOscillator(), gain = context.createGain();
            voice.type = 'sine'; voice.frequency.value = frequency; gain.gain.value = .3;
            voice.connect(gain).connect(volume); voice.start(); return voice;
        });
        const drift = context.createOscillator(), depth = context.createGain();
        drift.frequency.value = {1:.08,2:.045,3:.12,4:.18,5:.06}[stage]; depth.gain.value = .003;
        drift.connect(depth).connect(volume.gain); drift.start(); oscillators.push(drift);
        ambientLoop = { context, oscillators, stage };
        context.resume()?.catch?.(() => { if (ambientLoop?.context === context) stopAmbientAudio(); });
    } catch (_) {
        if (ambientLoop?.context === context) stopAmbientAudio();
        else try { context?.close()?.catch?.(() => {}); } catch (_) { }
    }
}
// Starts a brand-new guest city. The previous guest city is moved aside rather
// than deleted, so a mis-tap is recoverable, and account cities are untouched
// because they live under their own save keys.
function startNewGuestGame() {
    if (window.LastCityCloud?.isSwitching?.()) return false;
    if (!isGuestSession()) { showNotification('Sign out first to start a guest city.'); return false; }
    const summary = guestSaveSummary();
    if (summary && !newGuestConfirmed) {
        newGuestConfirmed = true;
        const button = el('startNewGuestButton');
        if (button) button.textContent = 'Tap again to replace the guest city';
        if (el('startSaveHint')) {
            el('startSaveHint').textContent = 'The current guest city (Rebirth ' + summary.rebirths +
                ') will be set aside and a new one started.';
        }
        setTimeout(() => {
            newGuestConfirmed = false;
            const reset = el('startNewGuestButton');
            if (reset) reset.textContent = 'Start a new guest game';
            renderStartupPage();
        }, 6000);
        return false;
    }
    newGuestConfirmed = false;
    archiveGuestSave();
    startupSaveAvailable = false;
    startFreshCity('');
    const button = el('startNewGuestButton');
    if (button) button.textContent = 'Start a new guest game';
    renderStartupPage();
    playSfx('ui');
    return true;
}

function initStartupUI() {
    el('startContinueButton')?.addEventListener('click',()=>typeof launchCityTerminal==='function'?launchCityTerminal():closeIntroModal());
    el('startSettingsButton')?.addEventListener('click', () => toggleStartupPanel('startSettingsPanel'));
    el('startCreditsButton')?.addEventListener('click', () => toggleStartupPanel('startCreditsPanel'));
    document.querySelectorAll('[data-start-close]').forEach(button => button.addEventListener('click', () => {
        closeStartupPanels(); el(button.dataset.startClose === 'startSettingsPanel' ? 'startSettingsButton' : 'startCreditsButton').focus();
    }));
    el('startSoundButton')?.addEventListener('click', toggleGameSound);
    el('startAmbientButton')?.addEventListener('click', toggleAmbientAudio);
    el('ambientButton')?.addEventListener('click', toggleAmbientAudio);
    el('startEffectsButton')?.addEventListener('click', () => {
        if (window.LastCityCloud?.isSwitching?.()) return;
        game.effectsEnabled = game.effectsEnabled === false; syncVfxPreference(); renderStartupSettings(); saveGame(false);
    });
    el('startResetButton')?.addEventListener('click', resetAllProgress);
    el('startNewGuestButton')?.addEventListener('click', startNewGuestGame);
    el('dailyRewardButton')?.addEventListener('click', claimDailyReward);
    el('introModal')?.addEventListener('cancel', event => {
        event.preventDefault();
        const panel = ['startSettingsPanel', 'startCreditsPanel'].find(id => !el(id).hidden);
        if (panel) { closeStartupPanels(); el(panel === 'startSettingsPanel' ? 'startSettingsButton' : 'startCreditsButton').focus(); }
    });
    document.addEventListener?.('visibilitychange', () => {
        document.body.classList.toggle('startup-motion-paused', document.hidden);
        syncAmbientAudio();
    });
    window.addEventListener?.('pagehide', stopAmbientAudio);
}
