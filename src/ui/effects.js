// Presentation only: effects never grant currency or delay player input.
const liveVfx = new Map();
const vfxAnimations = new Map();
const vfxPulseTimes = new WeakMap();
let vfxEnabledLast = null;
let gatherFeedbackAnchor = null;

function canPlayVfx() {
    return game.effectsEnabled !== false && !document.hidden
        && !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}
function clearVfx() {
    if (typeof clearTerminalPresentation === 'function') clearTerminalPresentation();
    finishTerminalBoot(false);
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
function mountVfx(node, duration = 1100, inLayer = null) {
    const layer = inLayer || el("fxLayer");
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
        : currentGameMode === "companions" ? el("companionPanel") : currentGameMode === "stories" ? el("storyPanel") : currentGameMode === "glyphs" ? el("glyphPanel") : el("stage" + currentStageView + "Panel");
    animateViewEntry(panel);
    if(typeof terminalPowerCycle==='function' && !tab?.dataset?.stage)terminalPowerCycle(panel);
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
    pulseVfx(el('walletBalance'),critical?'#b594ff88':'#ffbd7288');
}
function initVfx() {
    initTerminalUI();
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
        if (!button || button.disabled || button.closest?.("#accountModal")) return;
        if (typeof playSfx === 'function' && button.id !== 'energyButton' && button.id !== 'mobileGather') playSfx('clack');
        if (!canPlayVfx()) return;
        if (button.closest?.("dialog")) { pulseVfx(button); return; }
        const rect = (button.id==='energyButton' && gatherFeedbackAnchor ? gatherFeedbackAnchor : button).getBoundingClientRect();
        const ripple = document.createElement("i");
        ripple.className = "interaction-ripple";
        ripple.style.left = (event.detail ? event.clientX : rect.left + rect.width / 2) + "px";
        ripple.style.top = (event.detail ? event.clientY : rect.top + rect.height / 2) + "px";
        mountVfx(ripple, 650);
    }, true);
}

// Terminal presentation is disposable UI state, never part of a city save.
let terminalBootTimer = null, terminalBootToken = 0, terminalBootKey = '', terminalBootReturn = null;
let terminalLastFlash = -Infinity, terminalLastGlitch = -Infinity, terminalToastTimer = null, terminalToastToken = 0;
let terminalWalletValue = null, terminalWalletStage = 0, terminalProgressSavedAt = 0;
const TERMINAL_HELP = {
    1: ['Ashfall Outpost','Salvage funds buildings, tools and Ember Eggs. Shards buy permanent research.', 'Gather for active income; build Camps and Workshops for passive output. Shelters add workforce. Restore three beacon modules and build four City Centers to reach the Depot.', 'City renewal resets unarchived City production and Salvage. Glyphs, pets and permanent research stay. Preview renewal before confirming.'],
    2: ['Overgrown Depot','Scrap funds Depot buildings, tools and Moss Eggs. Depot Tokens buy permanent research.', 'Search all three sites. Each gives a key at search 8; Camp and Train give another at 14. Search cooldown is shared. Recover five keys, build two Depot Camps and fund the 500-Scrap gate.', 'Upgrade Recovery Tools for throughput. Automation and supply links stay on resets; blueprints preserve the rest of the board.'],
    3: ['Copperworks Foundry','Parts fund production, tools and Clockwork Eggs. Foundry Tokens buy permanent research.', 'Choose the three pieces in the shown recipe, pay the processing cost, wait for processing, then Deliver. Recipes change every six deliveries. Complete 18 deliveries, build two Assembly Lines and fund the gate.', 'Profit previews exclude the refunded input cost. Finish paid orders before resetting: Foundry blueprints do not preserve an unfinished job.'],
    4: ['Neon Relay','Circuits fund towers, tools and Prism Eggs. Relay Tokens buy permanent research.', 'Collect blue and gold energy from the field. Build three towers at their displayed pickup and funding requirements. Collect 80 energy pickups to complete the relay.', 'Field Amplifier increases pickup rewards and spawn speed. Collection Drone enables automatic pickup while the field is active.'],
    5: ['Celestial Citadel','Cores fund the reactor, tools and Astral Eggs. Ascension Tokens buy permanent research.', 'Channel energy, disable the three shields, then charge and fire the cannon. Each successful shot reduces Guardian health. Reclaim the reactor, then buy The Last City in Research.', 'Core Drive builds passive production; Reactor Focus improves channel yield. Glyph buffs and pets remain permanent across resets.']
};
function clearTerminalSession() {
    if (typeof clearTerminalPresentation === 'function') clearTerminalPresentation(true);
    finishTerminalBoot(false,false);clearTimeout(terminalToastTimer);terminalToastToken++;terminalToastTimer=null;
    terminalWalletValue=null;terminalWalletStage=0;terminalProgressSavedAt=0;
    el('notification')?.classList.remove('show');
}
function silenceGameAudio() {
    if(typeof sfxVoices==='undefined')return;
    for(const voice of sfxVoices){try{voice.stop();voice.onended?.();}catch(_){}}
    sfxVoices.clear();
}
function clearLayerVfx(layer) {
    if(!layer)return;
    for(const [node,timer] of liveVfx)if(node.parentNode===layer || layer.contains?.(node)){clearTimeout(timer);liveVfx.delete(node);node.remove();}
}
function finishTerminalBoot(animate = true,showOffline = true) {
    terminalBootToken++; clearTimeout(terminalBootTimer); terminalBootTimer=null;
    const modal=el('terminalBootModal'), wasOpen=modal?.open;
    const sameSave=terminalBootKey && typeof getSaveKey==='function' && terminalBootKey===getSaveKey();
    clearLayerVfx(modal);
    modal?.close?.(); document.body.classList.remove?.('terminal-booting');
    if (wasOpen && animate && canPlayVfx()) animateVfx(document.querySelector('main'),[{opacity:.65},{opacity:.9},{opacity:.8},{opacity:1}],{duration:350});
    if (wasOpen) terminalBootReturn?.focus?.({preventScroll:true});
    terminalBootKey='';terminalBootReturn=null;
    if(wasOpen && showOffline && sameSave && game.showOfflineModal && !document.hidden && !window.LastCityCloud?.isSwitching?.() && typeof showOfflineModal==='function')showOfflineModal();
}
function startTerminalBoot(kind = 'startup') {
    const modal=el('terminalBootModal');
    if (!modal || !canPlayVfx() || !gameStarted || modal.open || document.querySelector('.offline-modal') || (game.showOfflineModal && kind!=='startup')
        || ['accountModal','feedbackModal','loreModal','hatchModal','petMergeModal','renewalModal','zoneHelpModal'].some(id=>el(id)?.open)
        || window.LastCityCloud?.isSwitching?.()) return false;
    clearVfx();
    terminalBootReturn=document.activeElement;terminalBootKey=getSaveKey();
    const token=++terminalBootToken;
    modal.dataset.sequence=kind;el('terminalBootText').textContent='';el('terminalBootProgress').value=0;
    modal.showModal(); document.body.classList.add('terminal-booting');
    if(kind==='renewal'){
        const wave=document.createElement('i');wave.className='terminal-renewal-wave';mountVfx(wave,950,modal);
        terminalFlash(modal);
    }
    if(typeof glyphAuto!=='undefined' && glyphAuto)stopGlyphAuto('Auto-roll paused for terminal boot.');
    if(typeof autoHatchSession!=='undefined' && autoHatchSession)stopAutoHatch('Auto hatch paused for terminal boot.');
    el('terminalBootSkip')?.focus?.({preventScroll:true});
    const text='> ASHFALL TERMINAL v2.189...\n> CONNECTING TO RELAY...\n> SIGNAL ACQUIRED.';
    let index=0, glitched=false;
    const glitchBoot=typeof terminalPresentationRandom==='function' && terminalPresentationRandom()<.1;
    delete modal.dataset.glitch;
    if(typeof terminalPowerCycle==='function')terminalPowerCycle(null,modal);
    playSfx(kind==='renewal'?'rebirth':'boot');
    const step=()=>{
        if (token!==terminalBootToken) return;
        if (!canPlayVfx() || terminalBootKey!==getSaveKey() || window.LastCityCloud?.isSwitching?.()) return finishTerminalBoot(false);
        el('terminalBootText').textContent=text.slice(0,++index);
        el('terminalBootProgress').value=index/text.length*100;
        if(glitchBoot && !glitched && index===40){
            glitched=true;modal.dataset.glitch='true';
            el('terminalBootText').textContent+='\n> SIGNAL NOISE / RETRY...';
            terminalBootTimer=setTimeout(()=>{delete modal.dataset.glitch;step();},160);return;
        }
        if(index<text.length) terminalBootTimer=setTimeout(step,18);
        else terminalBootTimer=setTimeout(()=>{if(token===terminalBootToken)finishTerminalBoot();},240);
    };
    terminalBootTimer=setTimeout(step,kind==='renewal'?650:320);
    return true;
}
function launchCityTerminal() {
    if(gameStarted) return;
    closeIntroModal({deferOffline:true});
    if(gameStarted && !startTerminalBoot())showOfflineModal();
}
function terminalGlitch() {
    if(!canPlayVfx() || Date.now()-terminalLastGlitch<900) return;
    terminalLastGlitch=Date.now();
    animateVfx(el('crtOverlay'),[{opacity:.16,transform:'translateX(-2px)'},{opacity:.07,transform:'translateX(2px)'},{opacity:1,transform:'none'}],{duration:240});
}
function terminalFlash(inLayer=null) {
    if(!canPlayVfx() || Date.now()-terminalLastFlash<1000) return;
    terminalLastFlash=Date.now();
    const node=document.createElement('i');node.className='terminal-flash';mountVfx(node,160,inLayer);
}
function terminalShake(critical=false) {
    // Never transform the main wrapper: it contains the fixed mobile navigation.
    animateVfx(el('stage'+currentStageView+'Panel'),[{transform:'translate(0,0)'},{transform:'translate('+ (critical?4:1)+'px,-1px)'},{transform:'translate(-'+(critical?4:1)+'px,1px)'},{transform:'translate(0,0)'}],{duration:critical?220:120});
}
function terminalRing(anchor,inLayer=null) {
    if(!anchor || !canPlayVfx())return;
    const rect=anchor.getBoundingClientRect(), ring=document.createElement('i');ring.className='terminal-shockwave';
    ring.style.left=(rect.left+rect.width/2)+'px';ring.style.top=(rect.top+rect.height/2)+'px';mountVfx(ring,600,inLayer);
}
function terminalGather(critical,anchor=el('energyButton')) {
    terminalShake(critical);
    if(critical) {terminalFlash();terminalRing(anchor);terminalGlitch();}
}
function terminalPurchase(anchor=document.activeElement) {
    anchor?.classList.remove?.('navigation-target');
    if(anchor?.dataset)delete anchor.dataset.navigationTarget;
    if(typeof terminalPurchaseReceipt==='function')terminalPurchaseReceipt(anchor);
    const card=anchor?.closest?.('.building-card,.upgrade-card,.infrastructure-grid button,.preservation-card') || anchor;
    if(!card || !canPlayVfx())return;
    animateVfx(card,[{transform:'translateY(2px)',borderColor:'var(--world-color)'},{transform:'translateY(0)',borderColor:'var(--world-color)'}],{duration:200,delay:100});
    const rect=card.getBoundingClientRect();
    for(let i=0;i<6;i++){
        const dust=document.createElement('i');dust.className='terminal-dust';
        dust.style.left=(rect.left+rect.width*(i+1)/7)+'px';dust.style.top=rect.bottom+'px';
        dust.style.setProperty('--dust-x',(i-2.5)*12+'px');if(!mountVfx(dust,500))break;
    }
    terminalGlitch();
}
function terminalHatchReveal() {
    playSfx('hatch');
    const layer=el('hatchFx');if(!canPlayVfx() || game.skipHatchAnimations || !layer)return;
    terminalFlash(layer);
    animateVfx(el('hatchPrizeIcon'),[{transform:'scale(0)',opacity:0},{transform:'scale(1.2)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}],{duration:540});
    for(let i=0;i<12;i++){
        const p=document.createElement('i');p.className='terminal-confetti';p.style.left=((i+.5)/12*100)+'%';
        p.style.background=['#ffbd72','#b594ff','#66ddca','#a9d9ff'][i%4];p.style.animationDelay=(i%3)*50+'ms';
        if(!mountVfx(p,1300,layer))break;
    }
    terminalGlitch();
}
function clearHatchEffects() {
    const layer=el('hatchFx');
    clearLayerVfx(layer);
    for(const [node,record] of vfxAnimations)if(node===el('hatchPrizeIcon') || node===el('hatchResult') || node.closest?.('#hatchModal')){clearTimeout(record.timer);record.animation.cancel();vfxAnimations.delete(node);}
}
function terminalZoneTravel(from,to) {
    if(from===to)return;
    playSfx('travel');
    if(typeof terminalPowerCycle==='function')terminalPowerCycle(el('stage'+to+'Panel'));
    if(typeof terminalLog==='function')terminalLog('Relay connected: '+ZONES[to].name,'ok');
    const direction=to>from?1:-1;
    animateVfx(el('worldBanner'),[{opacity:.3,transform:'translateX('+direction*22+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:480});
    const wave=document.createElement('i');wave.className='terminal-zone-wave';wave.style.setProperty('--travel-direction',direction);
    mountVfx(wave,650);syncAmbientAudio();
}
function terminalTransmission(message) {
    clearTimeout(terminalToastTimer);const token=++terminalToastToken;
    const node=el('notification');if(!node)return;
    const all=String(message), animated=canPlayVfx();let index=0;
    node.setAttribute('aria-label',all);node.setAttribute('aria-live','off');
    if(el('transmissionAnnouncer'))el('transmissionAnnouncer').textContent=all;
    node.textContent=animated?'':all;node.classList.add('show');
    const error=/^ERROR:|^Need |^Complete .*first|not enough|failed|unavailable|requirements not met|cannot|recipe reset/i.test(all);
    if(typeof terminalRecordStatus==='function')terminalRecordStatus(all,error);
    playSfx(error?'failure':'beep');
    const step=()=>{
        if(token!==terminalToastToken)return;
        index=Math.min(all.length,index+4);node.textContent=all.slice(0,index);
        if(index<all.length && canPlayVfx()) terminalToastTimer=setTimeout(step,14);
        else {node.textContent=all;terminalToastTimer=setTimeout(()=>{if(token===terminalToastToken)node.classList.remove('show');},2000);}
    };
    if(animated)step();else terminalToastTimer=setTimeout(()=>node.classList.remove('show'),2000);
}
function openZoneHelp() {
    if(!gameStarted || window.LastCityCloud?.isSwitching?.() || ['terminalBootModal','introModal','accountModal','feedbackModal','loreModal','hatchModal','petMergeModal','renewalModal'].some(id=>el(id)?.open) || game.showOfflineModal)return false;
    if(typeof glyphAuto!=='undefined' && glyphAuto)stopGlyphAuto('Auto-roll paused for the field manual.');
    if(typeof autoHatchSession!=='undefined' && autoHatchSession)stopAutoHatch('Auto hatch paused for the field manual.');
    if(typeof renderTerminalManual==='function')renderTerminalManual('zones');
    else {const help=TERMINAL_HELP[currentStageView];el('zoneHelpTitle').textContent=help[0]+' · Field manual';
    el('zoneHelpContent').innerHTML=help.slice(1).map((text,i)=>'<section><h3>'+['Currencies','How this zone works','Your next run'][i]+'</h3><p>'+text+'</p></section>').join('');}
    el('zoneHelpModal').showModal();el('zoneHelpModal').scrollTop=0;el('zoneHelpClose')?.focus?.({preventScroll:true});return true;
}
function closeZoneHelp() {el('zoneHelpModal')?.close?.();el('zoneHelpButton')?.focus?.({preventScroll:true});}
function terminalProgress(id,value,label,indeterminate=false) {
    const node=el(id);if(!node)return;
    if(indeterminate)node.removeAttribute?.('value');else node.value=Math.min(100,Math.max(0,value));
    node.setAttribute('aria-label',label);node.title=label;node.hidden=false;
}
function refreshTerminalCloudProgress() {
    const node=el('cloudSaveStatus'),state=node?.dataset.state,message=node?.textContent || '';
    const pending=state==='syncing' || /^(Saving to cloud|Loading your cloud city)/.test(message);
    terminalProgress('cloudActionProgress',state==='saved'?100:0,pending?'Cloud transfer in progress':state==='error'?'Cloud unavailable · device save retained':state==='saved'?'Cloud sync complete':'Cloud sync status',pending);
    if(el('cloudActionProgress'))el('cloudActionProgress').hidden=!pending && !['saved','error','conflict'].includes(state);
    if(typeof terminalTransfer==='function')terminalTransfer('cloudTransferStream',pending,'CLOUD LINK / PACKETS');
}
function refreshTerminalUI() {
    if(el('terminalBootModal')?.open && (terminalBootKey!==getSaveKey() || window.LastCityCloud?.isSwitching?.()))finishTerminalBoot(false);
    const value=Number(game[currentGameMode==='glyphs'?'salvage':ZONES[currentStageView].currency]),stage=currentGameMode==='glyphs'?1:currentStageView;
    if(terminalWalletStage===stage && terminalWalletValue!==null && value!==terminalWalletValue){
        const spent=value<terminalWalletValue;
        if(spent)animateVfx(el('walletBalance'),[{color:'#ff8490',textShadow:'0 0 16px #ff849088'},{color:'inherit',textShadow:'none'}],{duration:420});
        else pulseVfx(el('walletBalance'),'#ffbd7244');
        if(typeof terminalPrintCounter==='function')terminalPrintCounter(el('walletBalance'));
    }
    terminalWalletStage=stage;terminalWalletValue=value;
    const a=game.adventure,p=a.progression,now=Date.now();
    const searchLength=searchDuration(),searchRemaining=Math.max(0,a.cooldownUntil-now);
    terminalProgress('searchActionProgress',100*(1-searchRemaining/searchLength),searchRemaining?'Search crew returning · '+Math.ceil(searchRemaining/1000)+'s':'Search ready');
    const job=p.production;
    terminalProgress('assemblyActionProgress',job?100*(now-job.startedAt)/Math.max(1,job.readyAt-job.startedAt):a.assembly.length/3*100,job?'Engine processing progress':'Recipe pieces selected');
    terminalProgress('hatchActionProgress',activeHatch?.phase==='rolling'?100*(now-(activeHatch.startedAt||now))/HATCH_ROLL_DURATION:activeHatch?100:0,activeHatch?.phase==='rolling'?'Hatch reveal in progress':activeHatch?'Hatch revealed':'No hatch in progress');
    terminalProgress('dispatchActionProgress',100*(1-Math.max(0,game.dispatchReadyAt-now)/Math.max(1,60000-game.cityTech.dropScanner*5000)), 'Supply-drop recharge');
    terminalProgress('channelActionProgress',100*(1-Math.max(0,(a.coreReadyAt||0)-now)/1000),'Reactor channel cooldown');
    terminalProgress('saveActionProgress',terminalProgressSavedAt?100:0,terminalProgressSavedAt?'Saved on this device':'Device save status');
    refreshTerminalCloudProgress();
    refreshTerminalTooltips();
    if(typeof refreshTerminalPersonality==='function')refreshTerminalPersonality();
}
const TERMINAL_ICON_PATHS={
    city:'M3 21V10h6v11m0-17h6v17m0-13h6v13M1 21h22M11 7h2m-2 4h2m-2 4h2M5 13h2m10-2h2m-2 4h2',
    gear:'M9 3h6l1 3 3 1 2 4-2 4-3 1-1 3H9l-1-3-3-1-2-4 2-4 3-1z M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    tool:'M14 3l7 7-4 4-3-3L5 21l-2-2 10-9-3-3z',
    flame:'M12 2c2 5 6 5 7 10 2 7-9 13-13 6-3-5 2-8 2-12 1 4 3 5 4-4z M12 13c-4 5-1 9 3 7',
    egg:'M12 2C6 2 3 12 4 17c2 7 14 7 16 0 1-5-2-15-8-15z M7 11l3 2 3-4 4 2',
    pet:'M7 14c-6 9 16 9 10 0-4-5-6-5-10 0z M4 8a2 3 0 1 0 4 0 2 3 0 1 0-4 0 M10 5a2 3 0 1 0 4 0 2 3 0 1 0-4 0 M16 8a2 3 0 1 0 4 0 2 3 0 1 0-4 0',
    relay:'M12 8v14m-5 0h10M9 13l3-5 3 5M7 5a7 7 0 0 0 0 10M17 5a7 7 0 0 1 0 10M4 2a11 11 0 0 0 0 16M20 2a11 11 0 0 1 0 16',
    leaf:'M20 3C7 1 1 10 5 17c8 8 17-2 15-14z M4 21L16 9',
    shield:'M12 2l9 4v7c-2 5-5 8-9 9-4-1-7-4-9-9V6z M7 12l3 3 7-7',
    star:'M12 2l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z',
    cloud:'M7 19h12c6-1 5-9 0-9C16 1 5 4 5 10c-6 0-5 9 2 9z',
    book:'M12 6C8 2 3 3 2 5v15c3-2 6-2 10 0 4-2 7-2 10 0V5c-1-2-6-3-10 1z M12 6v14',
    coin:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M12 6v12m3-10H9v4h6v4H9',
    clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 6v6l4 3',
    speaker:'M3 9h4l6-5v16l-6-5H3z M17 8c3 2 3 6 0 8M20 5c5 4 5 10 0 14',
    mute:'M3 9h4l6-5v16l-6-5H3z M17 9l5 6m0-6-5 6',
    mail:'M2 5h20v14H2z M2 5l10 8L22 5',
    magnet:'M5 3v11a7 7 0 0 0 14 0V3h-5v11a2 2 0 0 1-4 0V3z M5 7h5m4 0h5',
    battery:'M3 6h17v12H3z M20 9h2v6h-2M7 12h8m-4-3v6',
    robot:'M5 7h14l3 3v11H2V10z M12 7V3m-2 0h4M6 12h3v3H6zm9 0h3v3h-3zM8 18h8',
    drop:'M12 2C9 7 4 11 4 16c0 9 16 9 16 0 0-5-5-9-8-14z M7 16c0 3 2 4 4 4',
    camp:'M2 20L12 3l10 17z M8 20l4-7 4 7M6 22h12',
    save:'M3 3h15l3 3v15H3z M7 3v6h10V3M7 21v-8h10v8',
    spark:'M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z',
    bolt:'M14 2L4 14h7l-1 8 10-12h-7z',
    check:'M4 12l5 5L20 5',
    lock:'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4z M12 14v4',
    help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 8c0-4 7-3 6 0-1 2-3 1-3 5M12 17h.01'
};
function terminalIconMarkup(name) {return '<svg class="terminal-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+(TERMINAL_ICON_PATHS[name]||TERMINAL_ICON_PATHS.spark)+'"/></svg>';}
function iconizeTerminal(root) {
    if(!document.createTreeWalker || !root || root.closest?.('svg,script,style,textarea,[data-no-icons]'))return;
    const nodes=[];
    if(root.nodeType===3)nodes.push(root);
    else {const walker=document.createTreeWalker(root,4);let n;while((n=walker.nextNode()))nodes.push(n);}
    const symbols={city:'🌆🏙🏠🏘🏚🏗🏭',gear:'⚙🔩',tool:'🔧🔨🧤🛠',flame:'🔥',egg:'🥚',pet:'🐾🐭🐱🦊🦉',relay:'📡🚃',leaf:'🌳🌲🌿',shield:'🛡',star:'🏆🌟⭐',cloud:'☁',book:'📖📚',coin:'💰🪙💎',clock:'⏱⏳🕒',speaker:'🔊',mute:'🔇',magnet:'🧲',mail:'✉📩',robot:'🤖',battery:'🔋',drop:'💧',camp:'🏕⛺',save:'💾',bolt:'⚡🚀',check:'✅',lock:'🔒',spark:'✦✧📦🌅💡🎉❌'};
    for(const text of nodes){
        if(text.parentElement?.closest('svg,script,style,textarea,[data-no-icons]'))continue;
        const matches=[...text.textContent.matchAll(/[\p{Extended_Pictographic}✦✧✉](?:\uFE0F)?/gu)];if(!matches.length)continue;
        const fragment=document.createDocumentFragment();let offset=0;
        for(const match of matches){fragment.appendChild(document.createTextNode(text.textContent.slice(offset,match.index)));
            const name=Object.keys(symbols).find(key=>symbols[key].includes(match[0].replace('\uFE0F',''))) || 'spark';
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
            svg.setAttribute('class','terminal-icon icon-'+name);svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
            path.setAttribute('d',TERMINAL_ICON_PATHS[name]);svg.appendChild(path);fragment.appendChild(svg);offset=match.index+match[0].length;
        }
        fragment.appendChild(document.createTextNode(text.textContent.slice(offset)));text.replaceWith(fragment);
    }
}
function refreshTerminalTooltips() {
    if(!document.createTreeWalker)return;
    const descriptions={energyButton:'Gather Salvage. Momentum builds with repeated clicks; critical hits use your researched chance.',mobileGather:'Gather Salvage without returning to the main button.',milestoneAction:'Navigate to the next useful action. No resources are spent.',zoneHelpButton:'Open the current zone field manual: currencies, mechanics and goals.',dispatchButton:'Claim the shown supply payload. Recharges while playing.',rebirthButton:'Review what stays and resets before confirming renewal.',saveButton:'Write a device save now. Cloud status is reported separately.',settingsCloudSyncButton:'Sync with the signed-in account; guests can log in to enable cloud saves.',walletBalance:'Spendable currency for the current view. Glyphs always use Salvage.',walletRate:'Current passive resource income per second, including bonuses.',walletTokens:'Permanent-research currency. Kept across normal resets.',walletLuck:'Glyph draw odds multiplier. Does not change fixed prices.',statLifetimeSalvage:'All Salvage earned by this city, including previous runs.',statBestRate:'Highest passive Salvage rate reached by this city.',statHighestCombo:'Highest gathering momentum reached. Momentum fades between clicks.',statGlyphPower:'Permanent resource multiplier from all capped glyph copies.',statGlyphLuck:'Permanent multiplier improving glyph draw odds.',statGlyphRolls:'Total purchased glyph draws across all unlocked collections.',statPreservation:'Earned blueprints that protect upgrades or buildings on normal resets.'};
    const actions={search:'Search this site for Scrap and milestone keys. All sites share a cooldown.',component:'Select this engine piece in recipe order; selecting a wrong piece clears the assembly.',assemble:'Pay the listed Parts input cost and begin a timed engine order.',deliver:'Collect the completed order payout, including its input refund.',tower:'Build a relay tower once its pickup and Circuit requirements are met.',channel:'Generate Cores to power shields and cannon shots.',fire:'Spend the shown Cores for a cannon shot at the exposed Guardian.',shield:'Disable this shield after meeting its requirements.',beacon:'Permanently improve the City beacon. Beacon modules survive renewal.',unlock:'Open the next zone once the displayed quest and funding requirements are complete.'};
    const pets={hatch:'Pay once to collect one randomly drawn companion. Skipping the reveal does not reroll it.',equip:'Equip one owned copy. Up to three copies per zone contribute power.',unequip:'Remove one equipped copy; it stays in your inventory.',merge:'Choose duplicate copies to attempt a Gold conversion. Confirm the odds and losses before proceeding.',best:'Equip the strongest three owned copies in this zone.',boost:'Buy a timed resource booster for this zone; prices and odds are unchanged.'};
    const upgradeDefinitions={...TECH_UPGRADES,...REBIRTH_UPGRADES,...STAGE2_UPGRADES,...STAGE3_UPGRADES,...STAGE4_UPGRADES,...STAGE5_UPGRADES,...STAGE2_RESET_UPGRADES,...STAGE3_RESET_UPGRADES,...STAGE4_RESET_UPGRADES,...STAGE5_RESET_UPGRADES};
    for(const n of document.querySelectorAll('button,summary,.resource-card,.stat-lines > div,.pet-art,.wallet-item,[id^="stat"],#walletBalance,#walletRate,#walletTokens,#walletLuck')){
        const text=(n.getAttribute('aria-label')||n.textContent||'').replace(/\s+/g,' ').trim();
        const def=upgradeDefinitions[n.dataset.economyUpgrade] || INFRASTRUCTURE[currentStageView]?.[n.dataset.choice];
        const statLabel=n.matches('.stat-lines > div')?n.querySelector('span')?.textContent:n.id.startsWith('stat')?n.parentElement?.querySelector('span')?.textContent:null;
        const detail=descriptions[n.id] || (def?def.name+' — '+def.desc+'. Buy at the displayed price; the gain preview includes current bonuses.':null) || actions[n.dataset.action] || pets[n.dataset.petAction] || (statLabel?statLabel+'. Current value recorded for this city.':n.matches('.pet-art')?'Companion artwork. Each equipped copy adds its stated resource power.':text.slice(0,300));
        // A mode with no entry here would set title="undefined", so the
        // lookup falls back to the tab's own label.
        if(n.dataset.mode)n.title={city:'Play the current zone activity.',upgrades:'Browse Buildings, Tools and permanent Research.',glyphs:'Draw capped permanent glyphs and improve glyph research.',companions:'Hatch, equip and merge companion copies.',stories:'Read and replay earned chapters without losing progression.',stats:'Inspect lifetime records and earned badges.',build:'Lay out your city: drag buildings onto plots, assign jobs and manage power, food and security.',combat:'Defend the settlement. Deploy units down three lanes against incoming waves.',research:'Spend research points on a branching technology tree. Every unlock is permanent.'}[n.dataset.mode] || text || 'Open this section.';
        else if(n.dataset.stage)n.title=n.classList.contains('locked')?'Locked: '+ZONES[Math.max(1,Number(n.dataset.stage)-1)].quest:'Travel to '+ZONES[Number(n.dataset.stage)].name;
        else if(detail)n.title=(detail.length>115?detail.slice(0,110).replace(/\s+\S*$/,'')+'… See Manual.':detail)+(n.classList.contains('maxed')?' — Maxed.':n.disabled?' — Check requirements.':'');
    }
}
function initTerminalUI() {
    if(typeof initTerminalPersonality==='function')initTerminalPersonality();
    el('terminalBootSkip')?.addEventListener('click',()=>finishTerminalBoot());
    el('terminalBootModal')?.addEventListener('cancel',event=>{event.preventDefault();finishTerminalBoot();});
    el('zoneHelpButton')?.addEventListener('click',openZoneHelp);
    el('zoneHelpClose')?.addEventListener('click',closeZoneHelp);
    el('zoneHelpModal')?.addEventListener('cancel',event=>{event.preventDefault();closeZoneHelp();});
    document.addEventListener?.('visibilitychange',()=>{if(document.hidden)silenceGameAudio();else if(typeof gameStarted!=='undefined' && gameStarted && game.showOfflineModal)showOfflineModal();});
    window.addEventListener?.('pagehide',silenceGameAudio);
    if(document.createTreeWalker){
        const navIcons={city:'city',upgrades:'tool',glyphs:'spark',companions:'pet',stories:'book',stats:'relay'};
        for(const button of document.querySelectorAll('button[data-mode]')){const icon=button.querySelector('.nav-icon');if(icon)icon.innerHTML=terminalIconMarkup(navIcons[button.dataset.mode]);}
        for(const button of document.querySelectorAll('button[data-stage]')){const lock=document.createElement('span');lock.className='stage-lock-icon';lock.innerHTML=terminalIconMarkup('lock');lock.setAttribute('aria-hidden','true');button.prepend(lock);}
        iconizeTerminal(document.body);
        if(window.MutationObserver){const observer=new window.MutationObserver(records=>{for(const record of records){if(record.type==='characterData')iconizeTerminal(record.target);else record.addedNodes.forEach(iconizeTerminal);}refreshTerminalTooltips();refreshTerminalCloudProgress();});observer.observe(document.body,{subtree:true,childList:true,characterData:true});}
    }
    refreshTerminalTooltips();
}
