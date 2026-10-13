// Disposable terminal presentation. Transactions remain synchronous and authoritative.
const terminalPrints = new Map(), terminalTasks = new Map(), terminalEvents = [];
let terminalPresentationToken = 0, terminalCycleNode = null, terminalGhostNode = null, terminalActionSnapshot = null;
let terminalInputAt = 0, terminalIdleAt = 0, terminalHoldAt = 0, terminalPressAt = -Infinity;
let terminalCounterAt = -Infinity, terminalCursorEnabled = false, terminalTooltipTarget = null;
let terminalManualTopic = 'zones', terminalTransferState = '', terminalTooltipTimer = null, terminalGhostLabel = 'ASHFALL / TERMINAL';
let terminalManualZone=1,terminalManualReturnFocus=null,terminalTooltipHideTimer=null,terminalScreenEcho='ASHFALL / TERMINAL';
let terminalTooltipOrigin=null;
const TERMINAL_BALANCES = {salvage:'Salvage',scrap:'Scrap',parts:'Parts',circuits:'Circuits',cores:'Cores',shards:'Shards',scrapTokens:'Depot Tokens',partTokens:'Foundry Tokens',networkTokens:'Relay Tokens',ascensionTokens:'Citadel Tokens'};

function terminalTask(callback, delay,requiresMotion=true) {
    const token = terminalPresentationToken, key = typeof getSaveKey === 'function' ? getSaveKey() : '';
    const timer = setTimeout(() => {
        terminalTasks.delete(timer);
        if (token === terminalPresentationToken && !document.hidden && (!requiresMotion || canPlayVfx()) && (!key || key === getSaveKey()) && !window.LastCityCloud?.isSwitching?.()) callback();
    }, delay);
    terminalTasks.set(timer, callback); return timer;
}
function terminalStopPrint(node, settle = true) {
    const record = terminalPrints.get(node); if (!record) return;
    clearTimeout(record.timer); terminalPrints.delete(node);
    if (settle) node.textContent = record.text;
}
function terminalTypeText(node, text, duration = 160) {
    if (!node) return;
    terminalStopPrint(node, false);
    const all = String(text);
    if (!canPlayVfx() || duration === 0) { node.textContent = all; return; }
    // Bounded writers; no individual timers per character, no mutation of balances.
    if (terminalPrints.size >= 8) terminalStopPrint(terminalPrints.keys().next().value);
    const token = terminalPresentationToken, key = getSaveKey(), started = Date.now();
    const record = {text:all,timer:null}; terminalPrints.set(node,record);
    const step = () => {
        if (terminalPrints.get(node) !== record) return;
        if (token !== terminalPresentationToken || node.isConnected === false || !canPlayVfx() || key !== getSaveKey() || window.LastCityCloud?.isSwitching?.()) return terminalStopPrint(node);
        const fraction = Math.min(1,(Date.now()-started+24)/duration);
        node.textContent = all.slice(0,Math.ceil(all.length*fraction));
        if (fraction < 1) record.timer = setTimeout(step,24); else terminalStopPrint(node);
    }; step();
}
function clearTerminalPresentation(clearEvents = false) {
    if(typeof clearReconMapPresentation==='function')clearReconMapPresentation(clearEvents);
    terminalPresentationToken++;
    for (const timer of terminalTasks.keys()) clearTimeout(timer); terminalTasks.clear();
    for (const node of [...terminalPrints.keys()]) terminalStopPrint(node);
    for(const node of [terminalCycleNode,terminalGhostNode])if(node){clearTimeout(liveVfx.get(node));liveVfx.delete(node);node.remove();}
    terminalCycleNode = null; terminalGhostNode=null; terminalActionSnapshot = null;
    hideTerminalTooltip();
    document.querySelectorAll?.('[data-terminal-printing]').forEach(node => { delete node.dataset.terminalPrinting; delete node.dataset.terminalPrintText; });
    document.querySelectorAll?.('.terminal-modal-content').forEach(node => node.classList.remove('terminal-modal-content'));
    el('terminalCursor')?.setAttribute('hidden','');
    document.body.classList.remove('terminal-cursor-on','terminal-cursor-native');
    terminalInputAt = Date.now(); terminalIdleAt = terminalInputAt + 30000; terminalHoldAt = terminalInputAt + 45000;
    terminalTransferState = ''; terminalCounterAt = -Infinity;
    if(typeof terminalCursorPosition!=='undefined')terminalCursorPosition=null;
    for(const id of ['terminalIntegritySignal','terminalRateSensor'])if(el(id))el(id).hidden=true;
    if (clearEvents) { terminalEvents.length = 0; terminalScreenEcho='ASHFALL / TERMINAL';terminalManualReturnFocus=null;terminalTooltipOrigin=null;renderTerminalLog(); }
}
function terminalLog(message, state = 'info') {
    // Session-only, capped, plain text: no feedback contents, emails or account IDs.
    const text = String(message).replace(/[\r\n]+/g,' ').replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi,'[account]').replace(/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/gi,'[account]').slice(0,180);
    terminalEvents.push({text,state,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})});
    if (terminalEvents.length > 30) terminalEvents.shift(); renderTerminalLog();
}
function renderTerminalLog() {
    const list = el('terminalEventList'); if (!list) return;
    list.replaceChildren?.();
    for (const event of terminalEvents.slice(-12)) {
        const li = document.createElement('li'); li.className = 'terminal-log-'+event.state;
        li.textContent = event.time+' > '+(event.state==='ok'?'OK: ':event.state==='error'?'ERROR: ':'')+event.text;
        list.appendChild(li);
    }
    if (el('terminalLogCount')) el('terminalLogCount').textContent = String(terminalEvents.length).padStart(2,'0');
    list.scrollTop = list.scrollHeight;
}
function terminalRecordStatus(message, error) {
    terminalLog(String(message).replace(/^(?:ERROR|OK):\s*/i,''),error?'error':/^STATE WRITTEN|^LOCAL BACKUP/.test(message)?'info':'ok');
    const node = el('notification'); if (node) node.dataset.result = error?'error':'ok';
}
function terminalPowerCycle(panel = null, layer = null) {
    if (!canPlayVfx() || !gameStarted || window.LastCityCloud?.isSwitching?.()) return false;
    if(terminalCycleNode){clearTimeout(liveVfx.get(terminalCycleNode));liveVfx.delete(terminalCycleNode);terminalCycleNode.remove();}
    if(terminalGhostNode){clearTimeout(liveVfx.get(terminalGhostNode));liveVfx.delete(terminalGhostNode);terminalGhostNode.remove();}
    const ghost=document.createElement('span');ghost.className='terminal-burn-in';ghost.textContent=terminalScreenEcho || terminalGhostLabel;
    if(mountVfx(ghost,1650,layer))terminalGhostNode=ghost;
    terminalGhostLabel=(layer?.querySelector('h2')?.textContent || ZONES[currentStageView].name).slice(0,80);
    const cycle = document.createElement('div'); cycle.className = 'terminal-power-cycle';
    cycle.innerHTML = '<i class="terminal-power-line"></i><span>RELAY / RESYNC<span class="terminal-blink">_</span></span>';
    if (!mountVfx(cycle,580,layer)) return false;
    terminalCycleNode = cycle;
    // A visual 80ms response delay only; inputs and purchased rewards are never queued.
    if (panel) animateVfx(panel,[{filter:'brightness(1)',clipPath:'inset(0)'},{filter:'brightness(2)',clipPath:'inset(49.6% 0)',offset:.2},{filter:'brightness(0)',clipPath:'inset(50% 0)',offset:.3},{filter:'brightness(.65)',clipPath:'inset(0)',offset:.65},{filter:'brightness(1)',clipPath:'inset(0)'}],{duration:460,delay:80});
    return true;
}
function terminalModalOpened(modal) {
    if (!modal || !gameStarted || modal.id === 'introModal' || modal.id === 'terminalBootModal') return;
    terminalPowerCycle(null,modal);
    if (canPlayVfx()) {
        for(const text of [...modal.querySelectorAll('h2,h3,p')].slice(0,12)){
            text.classList.add('terminal-modal-content');
            terminalTask(()=>text.classList.remove('terminal-modal-content'),700);
        }
    }
}
function terminalPresentationRandom() {
    if (window.crypto?.getRandomValues) { const value = new Uint32Array(1); window.crypto.getRandomValues(value); return value[0]/4294967296; }
    // Never consume the gameplay RNG for cosmetics, including on older browsers.
    return ((Date.now()>>>0)%1000)/1000;
}
function terminalPrintGain(anchor,text) {
    if (!anchor || !canPlayVfx()) return;
    const rect = anchor.getBoundingClientRect(), node = document.createElement('span');
    node.className = 'terminal-gain-print'+(String(text).startsWith('CRITICAL!')?' critical-print':'');
    const x = Math.min(Math.max(12,rect.left+rect.width/2-80),Math.max(12,(window.innerWidth || 800)-192));
    node.style.left = x+'px'; node.style.top = Math.min(rect.top+8,(window.innerHeight || 800)-150)+'px';
    if (mountVfx(node,780)) terminalTypeText(node,'> '+text,120);
}
function terminalCapturePurchase(button) {
    if(typeof quietReconMap==='function')quietReconMap();
    terminalInputAt = Date.now(); terminalIdleAt = terminalInputAt+30000;
    terminalActionSnapshot = {key:getSaveKey(),at:Date.now(),label:(button.getAttribute('aria-label') || button.closest?.('.building-card')?.querySelector('h3')?.textContent || button.querySelector?.('h3,.upgrade-name,strong')?.textContent || button.textContent || 'Installation').replace(/\s+/g,' ').trim().slice(0,64),balances:{}};
    for (const key of Object.keys(TERMINAL_BALANCES)) terminalActionSnapshot.balances[key] = Number(game[key]) || 0;
}
function terminalPurchaseReceipt(anchor) {
    const captured = terminalActionSnapshot; terminalActionSnapshot = null;
    if (!captured || captured.key !== getSaveKey() || Date.now()-captured.at > 500) return;
    const costs = Object.entries(captured.balances).filter(([key,value])=>value>Number(game[key])).map(([key,value])=>formatNumber(value-Number(game[key]))+' '+TERMINAL_BALANCES[key]);
    if (!costs.length) return;
    terminalLog(captured.label+' / '+costs.join(' + '),'ok');
    if (!canPlayVfx()) return;
    const modal = anchor?.closest?.('dialog[open]') || document.querySelector('dialog[open]'), node = document.createElement('pre');
    node.className = 'terminal-receipt'; node.setAttribute('data-no-icons','');
    const action=anchor?.dataset?.petAction==='hatch'?'HATCH PAID':anchor?.dataset?.glyphAction==='roll'?'DRAW PAID':anchor?.dataset?.action==='assemble'?'ORDER STARTED':'INSTALLED';
    const text = 'LAST CITY / PURCHASE RECEIPT\n----------------------------\n'+captured.label+'\nPAID: '+costs.join(' + ')+'\n> OK. '+action+'.\n----------------------------';
    if (mountVfx(node,2400,modal)) terminalTask(()=>terminalTypeText(node,text,300),100);
}
function terminalPrintCounter(node) {
    if (!node || !canPlayVfx() || Date.now()-terminalCounterAt < 500) return;
    terminalCounterAt = Date.now();
    const text = node.textContent; node.dataset.terminalPrinting = 'true'; node.dataset.terminalPrintText = '';
    for (let index=1;index<=4;index++) terminalTask(()=>{
        // A newer authoritative value wins; do not print stale balances.
        if (node.textContent !== text || index===4) { delete node.dataset.terminalPrinting; delete node.dataset.terminalPrintText; }
        else node.dataset.terminalPrintText = text.slice(0,Math.ceil(text.length*index/3));
    },index*30);
}
function syncTerminalCursor() {
    document.body.classList.toggle('terminal-cursor-on',terminalCursorEnabled && canPlayVfx());
    if (el('terminalCursorButton')) { el('terminalCursorButton').textContent = terminalCursorEnabled?'Block cursor on':'Block cursor off'; el('terminalCursorButton').setAttribute('aria-pressed',String(terminalCursorEnabled)); }
    if (!canPlayVfx() || !terminalCursorEnabled) { if (el('terminalCursor')) el('terminalCursor').hidden = true; }
}
function terminalTooltip(target) {
    hideTerminalTooltip();
    const text = target?.title; if (!text || target.closest('input,textarea,select,#accountModal,#terminalTooltip,#terminalBootModal')) return;
    terminalTooltipTarget = target;
    terminalTooltipOrigin=target;
    terminalTooltipTimer=terminalTask(()=>{
        terminalTooltipTimer=null;
        if (terminalTooltipTarget !== target || target.isConnected === false) return;
        const modal = target.closest('dialog[open]'), tip = el('terminalTooltip'); if (!tip) return;
        (modal || document.body).appendChild(tip); tip.hidden = false;
        const rect = target.getBoundingClientRect();
        tip.style.left = Math.max(8,Math.min(rect.left,(window.innerWidth || 800)-280))+'px';
        tip.style.top = (rect.bottom+80<(window.innerHeight || 800)?rect.bottom+8:Math.max(8,rect.top-72))+'px';
        if(el('terminalTooltipManual')){el('terminalTooltipManual').dataset.chapter=terminalManualForTarget(target);el('terminalTooltipManual').dataset.zone=String(terminalManualZoneForTarget(target));}
        terminalTypeText(el('terminalTooltipText') || tip,'> '+text.slice(0,190),180);
    },350,false);
}
function hideTerminalTooltip() {
    if(terminalTooltipHideTimer!==null){clearTimeout(terminalTooltipHideTimer);terminalTasks.delete(terminalTooltipHideTimer);terminalTooltipHideTimer=null;}
    if(terminalTooltipTimer!==null){clearTimeout(terminalTooltipTimer);terminalTasks.delete(terminalTooltipTimer);terminalTooltipTimer=null;}
    terminalTooltipTarget = null; const tip = el('terminalTooltip');
    if (tip) { terminalStopPrint(el('terminalTooltipText') || tip,false); tip.hidden = true; }
}
function terminalManualForTarget(target) {
    if(target?.dataset?.manualTopic)return target.dataset.manualTopic;
    if(target?.closest?.('#zoneHelpModal,#terminalCommandForm'))return 'shortcuts';
    if(target?.closest?.('#glyphPanel') || /glyph|luck/i.test(target?.id || ''))return 'glyphs';
    if(target?.closest?.('#companionPanel,#hatchModal,#petMergeModal') || target?.dataset?.petAction)return 'companions';
    if(/renewal|rebirth|stageReset|preservation|resetButton/i.test(target?.id || '') || target?.closest?.('#renewalModal,#preservationPanel'))return 'renewals';
    if(/save|backup|cursor|sound|effects|ambient/i.test(target?.id || '') || target?.closest?.('#playerSettings'))return 'integrity';
    if(/wallet|resource|currency/i.test(target?.id || '') || target?.dataset?.economyUpgrade || target?.closest?.('.building-card'))return 'currencies';
    return 'zones';
}
function terminalManualZoneForTarget(target) {return Number(target?.closest?.('#reconMap')?.dataset.reconZone || target?.dataset?.stage) || currentStageView;}
function terminalTransfer(id,active,label,value=null) {
    const node=el(id); if(!node)return;
    node.hidden=!active;
    if (!active) { node.textContent=''; return; }
    // Cosmetic packets never pretend to be network bytes or completion percentages.
    const phase=Math.floor(Date.now()/300)%4;
    const packet=['[01 00 .. ..]','[01 00 11 ..]','[01 00 11 10]','[.. .. .. ..]'][phase];
    const text='> '+label+' '+(canPlayVfx()?packet:'[ACTIVE]')+(value===null?'':' / '+Math.max(0,Math.min(100,Math.floor(value)))+'%');
    if(node.textContent!==text)node.textContent=text;
}
function refreshTerminalPersonality() {
    if (el('terminalLogPanel')) el('terminalLogPanel').hidden = !gameStarted;
    syncTerminalCursor();
    if(typeof terminalPersistenceTick==='function')terminalPersistenceTick();
    if(window.LastCityCloud?.isSwitching?.()){if(terminalTasks.size || terminalPrints.size)clearTerminalPresentation();return;}
    const state=el('cloudSaveStatus')?.dataset.state,message=el('cloudSaveStatus')?.textContent || '';
    const cloud=state==='syncing' || /^(Saving to cloud|Loading your cloud city)/.test(message);
    terminalTransfer('cloudTransferStream',cloud,'CLOUD LINK / PACKETS');
    if (state && state!==terminalTransferState) { terminalTransferState=state; if(state==='saved')terminalLog('Cloud sync confirmed.','ok'); else if(state==='error')terminalLog('Cloud unavailable. Device save retained.','error'); }
    const job=game.adventure?.progression?.production;
    terminalTransfer('engineTransferStream',!!job,'ENGINE / PROCESSING',job?100*(Date.now()-job.startedAt)/Math.max(1,job.readyAt-job.startedAt):null);
    terminalTransfer('hatchTransferStream',activeHatch?.phase==='rolling','EGG / DECODING',activeHatch?.phase==='rolling'?100*(Date.now()-activeHatch.startedAt)/HATCH_ROLL_DURATION:null);
    if (!gameStarted || !canPlayVfx() || window.LastCityCloud?.isSwitching?.() || el('terminalBootModal')?.open) return;
    const now=Date.now();
    if(now>=terminalHoldAt){terminalHoldAt=now+45000;if(typeof terminalHoldJump==='function')terminalHoldJump();}
    if(document.querySelector('dialog[open]'))return;
    if(now>=terminalIdleAt && now-terminalInputAt>=30000){
        terminalIdleAt=now+18000;
        const lines=['SENSORS NOMINAL','WORKFORCE: '+getPopulation()+' SOULS','OUTPOST STATUS: '+(game.adventure.bossDefeated?'REACTOR RECLAIMED':'STABLE')];
        const text='> '+lines[Math.floor((now-terminalInputAt-30000)/18000)%lines.length];
        if(el('terminalIdleText'))terminalTypeText(el('terminalIdleText'),text,250);
        terminalLog(text.slice(2));
    }
}
const TERMINAL_MANUAL_TOPICS={currencies:'Currencies',zones:'Zones',companions:'Companions',glyphs:'Glyphs',renewals:'Renewals',shortcuts:'Command line',integrity:'Data integrity'};
function terminalManualMarkup(topic,zone=currentStageView) {
    const section=(title,text)=>'<section><h3>'+title+'</h3><p>'+text+'</p></section>';
    let markup='';
    if(topic==='currencies'){
        markup=section('Currencies','Local wallets are separate. Glyph stations always spend Salvage, even in later zones. Buildings, Tools, Eggs and local activities spend the displayed zone currency.');
        for(let stage=1;stage<=5;stage++)markup+=section(TERMINAL_HELP[stage][0],TERMINAL_HELP[stage][1]);
        markup+=section('Permanent research funds','Earn Shards from City renewals and contracts; earn the local Tokens from zone resets. Spend them in Upgrades → Research. Existing Shards and Tokens survive normal renewals.');
    }else if(topic==='zones'){
        markup='<nav class="manual-zone-links" aria-label="Zone chapters">'+[1,2,3,4,5].map(stage=>'<button data-manual-zone="'+stage+'" aria-pressed="'+(stage===zone)+'">'+String(stage).padStart(2,'0')+' / '+TERMINAL_HELP[stage][0]+'</button>').join('')+'</nav>';
        markup+=section(String(zone).padStart(2,'0')+' / '+TERMINAL_HELP[zone][0],'CURRENT CHAPTER / '+TERMINAL_HELP[zone][0]);
        markup+=section('How this zone works',TERMINAL_HELP[zone][2])+section('Currencies',TERMINAL_HELP[zone][1])+section('Your next run',TERMINAL_HELP[zone][3]);
        if(zone===1)markup+=section('Recon / Ashfall','Recon opens on Stage 1 Play and remains collapsible. It is available only in Ashfall, on Play and Upgrades; later stages have no Recon map. Camps remain west, Shelters east, Workshops southwest and Power southeast. Select a sector or its inventory row to open that building in Upgrades; select the Beacon to open restoration. Navigation spends nothing. Cluster density and height summarize ownership; exact counts and next-tier meters are underneath. City Centers add distinct central plinths up to the twelve-plot projection budget, then aggregate; purchases remain uncapped by the picture. Survey classes mark 10, 100, 1,000, 10,000, 100,000 and 1,000,000 structures. These are presentation milestones, not limits or rewards.');
        if(zone===1)markup+=section('The emitter remembers a build','Placements pulse their own sector; first placements unlock it and density milestones send a ring. Recent unseen reactions coalesce briefly, never into rewards. The Beacon has a heartbeat before restoration, module links as it repairs, and a single bloom when module three is installed. Sound controls its quiet cues; Sound and Ambient together enable the projector hum while the opened map is visible. Dialogs, mute, hidden views and account changes silence it. Effects off and reduced motion keep the survey and confirmations static.');
        if(zone===1)markup+=section('Previous footprint','After a City renewal, lost building plots remain faint for thirty seconds. Preserved structures stay live; rebuilding covers old plots. Ghosts are session-only memory, not ownership, income or a saved history. The event log occasionally reports actual current structure counts, housing share, residents and Beacon status while the projection is visible. Housing share is the fraction of structures that are Shelters, not an occupancy or capacity estimate.');
    }else if(topic==='companions')markup=section('Hatch','In Companions → Eggs, pay the displayed local currency once for a random companion. The reveal is cosmetic: Skip or Continue never rerolls the paid result. Auto hatch stops at its displayed limit or reserve.')+section('Equip','Use Inventory to equip owned copies. Up to three equipped copies per zone add their displayed resource power. Equip Best selects your strongest available copies. Auto Equip Best updates that lineup after hatching.')+section('Merge','Select duplicate copies to attempt a Gold conversion. The confirmation shows the exact chance and copy cost. A failed attempt consumes the selected copies; do not merge until you have read that preview.')+section('Keeping your companions','Owned and equipped companions survive normal renewals and zone resets. Reset all progress is different: it deletes the active city after confirmation.');
    else if(topic==='glyphs')markup=section('Permanent capped collections','Build a Camp to unlock Ember; progress through the zones for later families. Every collected copy increases its glyph’s buffs until the shown cap. Duplicates of a capped glyph give no extra power. Buffs and glyph research survive normal resets.')+section('Luck','Luck improves rare draw odds across families. It does not change prices, increase collection caps or guarantee a Legendary every roll. Inspect tier odds and collection buffs in the Glyphs tab.')+section('Research and rolling','More Glyphs adds draws to one paid batch. Faster Rolls reduces intervals and can spend Salvage faster. Manual and automatic draws respect their cooldowns and reserves. A full family stops rolling; auto-roll pauses for the manual and confirmation dialogs.');
    else if(topic==='renewals'){
        markup=section('Normal renewal ≠ delete save','Renewals exchange current-run progress for permanent resource multipliers and research funds. Preservation blueprints progressively keep old upgrades so rebuilding is less repetitive. Always read the live preview; its keep/reset list reflects your actual blueprints.');
        const preview=renewalSummary(currentStageView);
        for(const [title,values] of [['Current zone / kept',preview.keep],['Current zone / reset',preview.reset],['Current zone / next run gains',preview.gain]])markup+=section(title,values.join('<br>'));
        markup+=section('Foundry warning','Finish and Deliver a paid engine before resetting. An unfinished order and its input cost do not survive a Foundry reset.')+section('Reset all progress','Settings → Reset all progress deletes the active city after confirmation. It is not a renewal. Log out or switch accounts to return to the separate guest city instead.');
    }else if(topic==='integrity')markup=section('Checksums are real, not a security seal','STATE WRITTEN appears after a device write is read back and checked. The displayed FNV-1a checksum and parity detect accidental differences; they are not encryption, signatures or protection against edited saves. Legacy or external states without a matching journal are reported as untracked, not falsely certified.')+section('Local backups','One rolling backup per city/account is copied from the latest device save after two minutes of visible play, or with Settings → Local backup now. LOCAL BACKUP CREATED only appears after readback verification. Browser storage can fill or be blocked; failed backups do not replace your active save. Backups are device-local, not an extra cloud copy.')+section('Damage and recovery','Malformed local JSON is kept in a local damaged-state slot. Loading attempts the matching city’s checksum-verified backup; if none is valid, it initializes a city and reports that recovery was not completed. A valid city is never discarded just because an old checksum journal differs. Invalid cloud inputs never load another account’s backup.')+section('Operator memory','Session count and the manual-gathering observation are device-local and city/account scoped. Operator Hours use the game’s existing recorded play time. Return messages use the actual elapsed offline gap, not an extra income grant. Reset all progress also clears this city’s local journal and recovery slots.')+section('Sensor estimates','The brief SENSOR ~ readout is cosmetic ±0.2% instrument drift. The real wallet income rate, prices and rewards never change. Large wallet tooltips include a reproducible value fingerprint. Effects-off and reduced motion remove drift, trails, aging movement and flashes.')+section('Cursor controls','The blinking block cursor is optional: enable it during boot or in Settings. It uses the normal editing cursor in text fields, never intercepts input, and adds a short 100ms phosphor trail only for mouse movement. F1 or [MANUAL →] opens contextual help.');
    else markup=section('Command line','Open LOG at the bottom of the screen and enter one command. Commands only navigate or request an ordinary Save; they cannot buy, reset, run code or bypass a locked zone.')+section('Commands','help · manual [currencies|zones|companions|glyphs|renewals|shortcuts|integrity]<br>status · zone [1–5]<br>upgrades · glyphs · companions · stories · stats<br>save · clear (clears only this session’s event log)')+section('Keyboard','Tab / Shift+Tab move between controls; Enter or Space presses a focused button. Escape closes dialogs or skips boot. F1 opens the focused control’s manual chapter. Enter sends a command while the command input is focused. Search the manual for mechanics such as cooldown, Luck, merges or backups.');
    if(topic==='integrity')markup+=section('When storage is blocked','Automatic replacement pauses if a damaged state cannot be preserved or a prior state cannot be read. Free browser storage or reload the device state before saving. A city changed in another tab is not overwritten. Account switches pause writes until the correct city is loaded.');
    return markup;
}
function renderTerminalManual(topic='zones',zone=currentStageView) {
    if(!Object.hasOwn(TERMINAL_MANUAL_TOPICS,topic))return false;
    if(typeof terminalRememberScreen==='function')terminalRememberScreen();
    terminalManualTopic=topic;terminalManualZone=Number.isInteger(zone) && zone>=1 && zone<=5?zone:currentStageView;
    el('zoneHelpTitle').textContent='LAST CITY / FIELD MANUAL';
    const markup=terminalManualMarkup(topic,terminalManualZone);
    el('zoneHelpContent').innerHTML=markup;
    if(el('terminalManualQuery'))el('terminalManualQuery').value='';
    if(el('terminalManualSearchStatus'))el('terminalManualSearchStatus').textContent='';
    if(el('terminalManualContext'))el('terminalManualContext').textContent='> '+TERMINAL_MANUAL_TOPICS[topic].toUpperCase()+' / '+TERMINAL_HELP[topic==='zones'?terminalManualZone:currentStageView][0];
    document.querySelectorAll('[data-manual-topic]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.manualTopic===topic)));
    el('zoneHelpContent').scrollTop=0;
    el('zoneHelpModal').scrollTop=0;
    terminalModalOpened(el('zoneHelpModal'));return true;
}
function terminalSearchManual(raw) {
    const query=String(raw).trim().toLowerCase().slice(0,80),words=query.split(/\s+/).filter(Boolean);
    if(!words.length)return renderTerminalManual(terminalManualTopic,terminalManualZone);
    const entries=Object.entries(TERMINAL_MANUAL_TOPICS).filter(([topic])=>topic!=='zones').map(([topic,title])=>({topic,title,text:terminalManualMarkup(topic).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')}));
    for(let zone=1;zone<=5;zone++)entries.push({topic:'zones',zone,title:TERMINAL_HELP[zone][0],text:TERMINAL_HELP[zone].join(' ')});
    const score=entry=>words.reduce((sum,word)=>sum+(entry.title.toLowerCase().includes(word)?20:0)+Math.min(8,entry.text.toLowerCase().split(word).length-1),0);
    const found=entries.filter(entry=>words.every(word=>(entry.title+' '+entry.text).toLowerCase().includes(word))).sort((a,b)=>score(b)-score(a)).slice(0,12),mount=el('zoneHelpContent');
    mount.replaceChildren?.();
    for(const entry of found){
        const section=document.createElement('section'),button=document.createElement('button'),text=document.createElement('p');
        button.type='button';button.className='manual-search-result';button.dataset.manualTopic=entry.topic;if(entry.zone)button.dataset.manualZone=String(entry.zone);
        button.textContent='[MANUAL →] '+entry.title;
        const index=entry.text.toLowerCase().indexOf(words[0]);text.textContent=(index>30?'… ':'')+entry.text.slice(Math.max(0,index-30),Math.max(0,index-30)+180)+'…';
        section.appendChild(button);section.appendChild(text);mount.appendChild(section);
    }
    if(!found.length){const p=document.createElement('p');p.textContent='> NO MATCH. Try cooldown, Luck, merge, renewal or backup.';mount.appendChild(p);}
    if(el('terminalManualSearchStatus'))el('terminalManualSearchStatus').textContent=found.length+' matching chapter'+(found.length===1?'':'s')+'.';
    if(el('terminalManualContext'))el('terminalManualContext').textContent='> SEARCH ARCHIVE / ALL ZONES';
    return found.length;
}
function runTerminalCommand(raw) {
    if(!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.() || document.querySelector('dialog[open]'))return false;
    const [command,arg,...extra]=String(raw).trim().toLowerCase().split(/\s+/);let ok=false;
    if(command==='clear' && !arg){terminalEvents.length=0;renderTerminalLog();return true;}
    if((command==='help' || command==='manual') && !extra.length && (!arg || Object.hasOwn(TERMINAL_MANUAL_TOPICS,arg))){ok=openZoneHelp();if(ok)renderTerminalManual(arg || 'shortcuts');}
    else if(command==='status' && !arg){terminalLog(ZONES[currentStageView].name+' / '+formatNumber(game[ZONES[currentStageView].currency])+' '+ZONES[currentStageView].label+' / '+getPopulation()+' SOULS','ok');return true;}
    else if(command==='zone' && /^[1-5]$/.test(arg || '') && !extra.length){if(isZoneUnlocked(Number(arg))){document.querySelector('button[data-stage="'+arg+'"]')?.click();ok=true;}}
    else if(['upgrades','glyphs','companions','stories','stats'].includes(command) && !arg){switchGameMode(command);ok=true;}
    else if(command==='save' && !arg){el('saveButton')?.click();return true;}
    if(!ok)showNotification('ERROR: Unknown command or locked zone. Enter help.');
    else terminalLog('Command accepted: '+command+(arg?' '+arg:''),'ok');return ok;
}
function initTerminalPersonality() {
    if(!document.createTreeWalker)return; // Tiny offline test DOMs can exercise helpers independently.
    try{terminalCursorEnabled=localStorage.getItem('lastCityTerminalCursor')==='on';}catch(_){}
    clearTerminalPresentation();
    el('terminalCursorButton')?.addEventListener('click',()=>{terminalCursorEnabled=!terminalCursorEnabled;syncTerminalCursor();try{localStorage.setItem('lastCityTerminalCursor',terminalCursorEnabled?'on':'off');}catch(_){}});
    el('terminalBootCursor')?.addEventListener('click',()=>{terminalCursorEnabled=true;syncTerminalCursor();try{localStorage.setItem('lastCityTerminalCursor','on');}catch(_){}el('terminalBootCursor').hidden=true;});
    el('terminalBackupButton')?.addEventListener('click',()=>{if(typeof terminalCreateBackup==='function')terminalCreateBackup(true);});
    document.querySelectorAll('[data-manual-topic]').forEach(button=>button.addEventListener('click',()=>renderTerminalManual(button.dataset.manualTopic)));
    el('zoneHelpContent')?.addEventListener('click',event=>{
        const button=event.target.closest?.('button');if(!button)return;
        if(button.dataset.manualZone || button.dataset.manualTopic)renderTerminalManual(button.dataset.manualTopic || 'zones',Number(button.dataset.manualZone)||currentStageView);
    });
    el('terminalManualQuery')?.addEventListener('input',event=>terminalSearchManual(event.target.value));
    el('terminalManualSearch')?.addEventListener('submit',event=>{event.preventDefault();terminalSearchManual(el('terminalManualQuery').value);});
    el('terminalManualClear')?.addEventListener('click',()=>{renderTerminalManual(terminalManualTopic,terminalManualZone);el('terminalManualQuery').focus();});
    el('terminalTooltipManual')?.addEventListener('click',event=>{const origin=terminalTooltipOrigin;if(openZoneHelp(event.currentTarget.dataset.chapter || 'zones',true,Number(event.currentTarget.dataset.zone)||currentStageView))terminalManualReturnFocus=origin || terminalManualReturnFocus;});
    el('terminalCommandForm')?.addEventListener('submit',event=>{event.preventDefault();const input=el('terminalCommandInput');runTerminalCommand(input.value);input.value='';});
    el('terminalLogPanel')?.addEventListener('toggle',hideTerminalTooltip);
    document.addEventListener('click',event=>{
        hideTerminalTooltip();const button=event.target.closest?.('button');if(!button || button.disabled)return;
        terminalCapturePurchase(button);
        if(!canPlayVfx())return;
        // Throttle a 2.5% key-dim flash, rather than strobing on rapid gather input.
        if(Date.now()-terminalPressAt>=1000){terminalPressAt=Date.now();const flash=document.createElement('i');flash.className='terminal-key-flash';mountVfx(flash,70,button.closest('dialog[open]'));}
    },true);
    // Catch ordinary paid actions (egg, glyph roll, processing) that do not use
    // the upgrade animation helper. Never infer success from a click alone.
    document.addEventListener('click',event=>{const button=event.target.closest?.('button');if(button && !button.disabled && terminalActionSnapshot)terminalPurchaseReceipt(button);});
    const input=()=>{terminalInputAt=Date.now();terminalIdleAt=terminalInputAt+30000;if(el('terminalIdleText')){terminalStopPrint(el('terminalIdleText'),false);el('terminalIdleText').textContent='';}};
    document.addEventListener('keydown',input);document.addEventListener('pointerdown',input);
    document.addEventListener('pointermove',event=>{
        if(!terminalCursorEnabled || !canPlayVfx() || event.pointerType==='touch')return;
        const cursor=el('terminalCursor');if(!cursor)return;
        const native=!!event.target.closest('input,textarea,select,[contenteditable],#accountModal');
        document.body.classList.toggle('terminal-cursor-native',native);cursor.hidden=native;
        // Keep the cursor above native top-layer dialogs without intercepting input.
        const parent=event.target.closest('dialog[open]') || document.body;
        if(cursor.parentNode!==parent)parent.appendChild(cursor);
        if(!native && typeof terminalCursorTrail==='function')terminalCursorTrail(event,cursor,parent);
        else if(typeof terminalCursorPosition!=='undefined')terminalCursorPosition=null;
        cursor.style.left=event.clientX+'px';cursor.style.top=event.clientY+'px';
    });
    document.addEventListener('pointerout',event=>{
        if(!event.relatedTarget && el('terminalCursor'))el('terminalCursor').hidden=true;
        if(event.relatedTarget?.closest?.('#terminalTooltip') || terminalTooltipTarget?.contains?.(event.relatedTarget))return;
        if(terminalTooltipHideTimer!==null){clearTimeout(terminalTooltipHideTimer);terminalTasks.delete(terminalTooltipHideTimer);}
        terminalTooltipHideTimer=terminalTask(hideTerminalTooltip,180,false);
    });
    document.addEventListener('pointerover',event=>{
        if(event.target.closest?.('#terminalTooltip')){if(terminalTooltipHideTimer!==null){clearTimeout(terminalTooltipHideTimer);terminalTasks.delete(terminalTooltipHideTimer);terminalTooltipHideTimer=null;}return;}
        const target=event.target.closest?.('button,summary,[title]');if(target && target!==terminalTooltipTarget)terminalTooltip(target);
    });
    document.addEventListener('focusin',event=>{if(!event.target.closest?.('#terminalTooltip'))terminalTooltip(event.target);});
    document.addEventListener('focusout',event=>{if(!event.relatedTarget?.closest?.('#terminalTooltip'))hideTerminalTooltip();});
    document.addEventListener('keydown',event=>{if(event.key==='F1'){event.preventDefault();const target=event.target.closest?.('button,summary,[title]') || event.target;openZoneHelp(terminalManualForTarget(target),true,terminalManualZoneForTarget(target));}});
    document.addEventListener('scroll',hideTerminalTooltip,true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTerminalPresentation();});
    window.addEventListener('pagehide',()=>clearTerminalPresentation(true));
    syncTerminalCursor();
}
