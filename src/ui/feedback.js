// Private feedback transport; only receipt/reward metadata enters a cloud city save.
let feedbackBusy = false, feedbackSession = 0, feedbackSource = 'manual', feedbackOfflineCalculation = false;
function normalizeFeedback(saved = {}) {
    const bounded = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
    return { playSeconds: bounded(saved?.playSeconds, 1e9), promptHandled: saved?.promptHandled === true,
        rewardClaimed: saved?.rewardClaimed === true, boostSeconds: saved?.rewardClaimed === true ? bounded(saved?.boostSeconds, 120) : 0,
        submittedCount: bounded(saved?.submittedCount, 1e6), lastSubmissionId: typeof saved?.lastSubmissionId === 'string' ? saved.lastSubmissionId.slice(0, 36) : '' };
}
function feedbackActivityAllowed() {
    return gameStarted && !document.hidden && !window.LastCityCloud?.isSwitching?.()
        && !['introModal', 'accountModal', 'feedbackModal', 'loreModal', 'hatchModal', 'petMergeModal'].some(id => el(id)?.open)
        && !game.showOfflineModal && !document.querySelector('.offline-modal');
}
function feedbackResourceMultiplier() { return !feedbackOfflineCalculation && game.feedback?.boostSeconds > 0 && feedbackActivityAllowed() ? 2 : 1; }
function feedbackRecordKey() { return getSaveKey() + ':feedback-outbox-v1'; }
function pendingFeedback() {
    try {
        const record = JSON.parse(localStorage.getItem(feedbackRecordKey()) || 'null');
        const p = record?.payload;
        return p && /^[0-9a-f-]{36}$/i.test(p.p_id) && /^[0-9a-f-]{36}$/i.test(p.p_device_id)
            && typeof p.p_message === 'string' && p.p_message.trim().length >= 10 && p.p_message.length <= 2000
            && ['balance', 'bug', 'idea', 'other'].includes(p.p_category) ? record : null;
    } catch (_) { return null; }
}
function feedbackMessage(text) { if (el('feedbackMessage')) el('feedbackMessage').textContent = text; }
function renderFeedbackStatus() {
    const seconds = game.feedback?.boostSeconds || 0, active = feedbackResourceMultiplier() === 2;
    const pending = pendingFeedback();
    if (el('feedbackBoostBadge')) { el('feedbackBoostBadge').hidden = !seconds; el('feedbackBoostBadge').textContent = '×2 resources · ' + seconds + 's' + (active ? '' : ' · paused'); }
    if (el('settingsFeedbackStatus')) el('settingsFeedbackStatus').textContent = pending ? 'Feedback saved on this device · awaiting confirmation. Open feedback to retry.' : seconds ? 'Thank-you boost: ' + seconds + 's of active play remaining.'
        : game.feedback?.rewardClaimed ? 'Feedback is always welcome. Your one-time reward has been claimed.' : 'First confirmed feedback earns ×2 resources for 2 minutes of active play.';
    if (el('feedbackOffer')) el('feedbackOffer').textContent = game.feedback?.rewardClaimed ? 'Thanks for helping shape Last City. You can send more feedback; the one-time reward is already claimed.'
        : 'All opinions welcome. Your first confirmed feedback earns ×2 resources for 2 minutes of active play.';
    if (el('feedbackSubmitButton')) { el('feedbackSubmitButton').disabled = feedbackBusy; el('feedbackSubmitButton').textContent = feedbackBusy ? 'Sending…' : pending ? 'Retry saved feedback' : 'Send feedback'; }
    for (const id of ['feedbackText', 'feedbackCategory', 'feedbackRating']) if (el(id)) el(id).disabled = feedbackBusy || !!pending;
}
function openFeedback(source = 'manual') {
    if (document.hidden || window.LastCityCloud?.isSwitching?.() || el('feedbackModal')?.open
        || ['accountModal', 'loreModal', 'hatchModal', 'petMergeModal'].some(id => el(id)?.open)
        || document.querySelector('.offline-modal')) return false;
    feedbackSource = source === 'prompt' ? 'prompt' : 'manual';
    if (el('feedbackTitle')) el('feedbackTitle').textContent = feedbackSource === 'prompt' ? 'Five minutes in — how does it feel?' : 'How is the rebuild going?';
    if (el('feedbackSkipButton')) el('feedbackSkipButton').textContent = 'Skip for now';
    if (typeof stopGlyphAuto === 'function') stopGlyphAuto('Auto-roll stopped for feedback.');
    if (typeof autoHatchSession !== 'undefined' && autoHatchSession) stopAutoHatch('Auto hatch stopped for feedback.');
    const record = pendingFeedback();
    if (record) { el('feedbackText').value = record.payload.p_message; el('feedbackCategory').value = record.payload.p_category; el('feedbackRating').value = record.payload.p_rating || ''; }
    else { el('feedbackText').value = ''; el('feedbackRating').value = ''; }
    feedbackMessage(record ? 'Your previous feedback is saved on this device. Retry to send it and receive confirmation.' : '');
    if (el('playerSettings')) el('playerSettings').open = false;
    renderFeedbackStatus();
    el('feedbackModal').showModal();
    (record ? el('feedbackSubmitButton') : el('feedbackText'))?.focus?.();
    return true;
}
function dismissFeedback() {
    // Skip/Escape are equally valid. No automatic nag repeats after dismissal.
    if (feedbackSource === 'prompt') game.feedback.promptHandled = true;
    el('feedbackModal')?.close(); saveGame(false); renderFeedbackStatus();
}
function clearFeedbackSession() {
    feedbackSession++; feedbackBusy = false;
    el('feedbackModal')?.close();
}
function tickFeedback() {
    if (!feedbackActivityAllowed()) return;
    game.feedback.playSeconds++;
    if (game.feedback.boostSeconds > 0) game.feedback.boostSeconds--;
    if (game.feedback.playSeconds >= 300 && !game.feedback.promptHandled && !pendingFeedback()) {
        if (openFeedback('prompt')) { game.feedback.promptHandled = true; saveGame(false); }
    }
}
async function flushFeedback() {
    if (feedbackBusy || document.hidden || window.LastCityCloud?.isSwitching?.()) return false;
    const record = pendingFeedback();
    if (!record) return false;
    const storageKey = feedbackRecordKey(), saveKey = getSaveKey(), session = feedbackSession;
    feedbackBusy = true; renderFeedbackStatus(); feedbackMessage('Sending your saved feedback…');
    const current = () => session === feedbackSession && saveKey === getSaveKey() && !window.LastCityCloud?.isSwitching?.();
    try {
        if (!record.acknowledged) {
            if (!window.LastCityCloud?.submitFeedback) throw new Error('Feedback service is still connecting. Your text is saved here; retry shortly.');
            const receipt = await window.LastCityCloud.submitFeedback(record.payload);
            if (receipt !== record.payload.p_id) throw new Error('Feedback was not confirmed. Your text is saved here for retry.');
            record.acknowledged = true;
            // Retain a receipt if a subsequent city/reward save fails.
            localStorage.setItem(storageKey, JSON.stringify(record));
        }
        if (!current()) return false;
        if (game.feedback.lastSubmissionId !== record.payload.p_id) {
            const feedback = { ...game.feedback, promptHandled: true, submittedCount: game.feedback.submittedCount + 1,
                lastSubmissionId: record.payload.p_id, rewardClaimed: true,
                boostSeconds: game.feedback.rewardClaimed ? game.feedback.boostSeconds : 120 };
            // Commit claim + timer together before changing live reward state.
            localStorage.setItem(saveKey, JSON.stringify({ ...game, feedback, lastSeen: Date.now() }));
            game.feedback = feedback; startupSaveAvailable = true;
            window.LastCityCloud?.onSave?.(false);
        }
        localStorage.removeItem(storageKey);
        feedbackMessage('Feedback received. Thank you!' + (game.feedback.boostSeconds ? ' Your resource boost runs during active play.' : ''));
        if (el('feedbackSkipButton')) el('feedbackSkipButton').textContent = 'Keep playing';
        el('feedbackText').value = ''; renderFeedbackStatus(); updateGame();
        return true;
    } catch (error) {
        if (current()) feedbackMessage('Not completed: ' + (error.message || 'Connection or storage unavailable.') + ' Your saved feedback can be retried; no duplicate reward will be granted.');
        return false;
    } finally {
        if (current()) { feedbackBusy = false; renderFeedbackStatus(); }
    }
}
async function submitPlayerFeedback(event) {
    event?.preventDefault?.();
    if (!el('feedbackModal')?.open || feedbackBusy || document.hidden || window.LastCityCloud?.isSwitching?.()) return false;
    if (!pendingFeedback()) {
        const message = el('feedbackText').value.trim(), category = el('feedbackCategory').value, rating = Number(el('feedbackRating').value) || null;
        if (message.length < 10 || message.length > 2000 || !['balance', 'bug', 'idea', 'other'].includes(category)
            || rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) { feedbackMessage('Please write 10–2,000 characters of feedback and choose valid options.'); return false; }
        try {
            let device = localStorage.getItem('lastCityFeedbackDeviceV1');
            if (!/^[0-9a-f-]{36}$/i.test(device || '')) { device = window.crypto.randomUUID(); localStorage.setItem('lastCityFeedbackDeviceV1', device); }
            const payload = { p_id: window.crypto.randomUUID(), p_device_id: device, p_message: message, p_category: category, p_rating: rating,
                p_stage: currentStageView, p_play_seconds: game.feedback.playSeconds, p_build: LAST_CITY_BUILD.version + '/' + LAST_CITY_BUILD.date, p_source: feedbackSource };
            localStorage.setItem(feedbackRecordKey(), JSON.stringify({ payload, acknowledged: false }));
        } catch (_) { feedbackMessage('Browser storage is unavailable. Nothing was submitted or rewarded. Keep your text and retry.'); return false; }
    }
    return flushFeedback();
}
function initFeedbackUI() {
    for (const id of ['startFeedbackButton', 'settingsFeedbackButton']) el(id)?.addEventListener('click', () => openFeedback());
    el('feedbackForm')?.addEventListener('submit', event => { void submitPlayerFeedback(event); });
    for (const id of ['feedbackCloseButton', 'feedbackSkipButton']) el(id)?.addEventListener('click', dismissFeedback);
    el('feedbackModal')?.addEventListener('cancel', event => { event.preventDefault(); dismissFeedback(); });
    window.addEventListener?.('online', () => { void flushFeedback(); });
    setInterval(() => { void flushFeedback(); }, 30000);
}
