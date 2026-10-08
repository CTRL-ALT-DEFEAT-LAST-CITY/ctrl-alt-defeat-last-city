// The title page owns its presentation, optional audio and explicit daily claim.
const LAST_CITY_BUILD = { version: '1.0.0-dev', date: '2026.10.08', channel: 'Local review' };
let startupSaveAvailable = false, ambientAudioArmed = false, ambientLoop = null, dailyClaimError = '';

function normalizeDailyReward(saved = {}) {
    const day = typeof saved?.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDay)
        && Number.isFinite(Date.parse(saved.lastDay + 'T00:00:00Z'))
        && new Date(saved.lastDay + 'T00:00:00Z').toISOString().slice(0, 10) === saved.lastDay ? saved.lastDay : '';
    return { lastDay: day, lastClaimAt: Number.isFinite(saved?.lastClaimAt) && saved.lastClaimAt >= 0 ? saved.lastClaimAt : 0,
        lastAmount: Number.isFinite(saved?.lastAmount) && saved.lastAmount >= 0 ? saved.lastAmount : 0 };
}
function dailyRewardState(now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10), saved = game.dailyReward;
    return { today, eligible: saved.lastDay < today && now >= saved.lastClaimAt,
        amount: Math.ceil(Math.max(250, Math.min(1e100, getSalvagePerSecond() * 60))) };
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
function renderStartupPage() {
    const stage = [5, 4, 3, 2, 1].find(isZoneUnlocked);
    const values = {
        startProgress: startupSaveAvailable ? 'Continue saved city — Rebirth ' + game.rebirths + ' · Stage ' + stage : 'New Game — your first city awaits',
        startSaveHint: (el('cloudSaveStatus')?.textContent || 'Guest play · saved on this device') + (startupSaveAvailable ? ' · ' + formatDuration(game.playTimeSeconds) + ' played' : ''),
        startBuildInfo: 'v' + LAST_CITY_BUILD.version + ' · Build ' + LAST_CITY_BUILD.date + ' · ' + LAST_CITY_BUILD.channel
    };
    for (const [id, value] of Object.entries(values)) if (el(id) && el(id).textContent !== value) el(id).textContent = value;
    if (el('startContinueButton')) { el('startContinueButton').hidden = !startupSaveAvailable; el('startContinueButton').disabled = !!window.LastCityCloud?.isSwitching?.(); }
    if (el('introStartButton')) el('introStartButton').disabled = !!window.LastCityCloud?.isSwitching?.();
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
    if (ambientLoop) return;
    let context;
    try {
        context = new Audio();
        const volume = context.createGain(); volume.gain.value = .012; volume.connect(context.destination);
        const oscillators = [110, 164.81, 220].map(frequency => {
            const voice = context.createOscillator(), gain = context.createGain();
            voice.type = 'sine'; voice.frequency.value = frequency; gain.gain.value = .3;
            voice.connect(gain).connect(volume); voice.start(); return voice;
        });
        const drift = context.createOscillator(), depth = context.createGain();
        drift.frequency.value = .08; depth.gain.value = .003;
        drift.connect(depth).connect(volume.gain); drift.start(); oscillators.push(drift);
        ambientLoop = { context, oscillators };
        context.resume()?.catch?.(() => { if (ambientLoop?.context === context) stopAmbientAudio(); });
    } catch (_) {
        if (ambientLoop?.context === context) stopAmbientAudio();
        else try { context?.close()?.catch?.(() => {}); } catch (_) { }
    }
}
function initStartupUI() {
    el('startContinueButton')?.addEventListener('click', closeIntroModal);
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
