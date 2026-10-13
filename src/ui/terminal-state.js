// Local integrity journal / operator memory. Not authentication or cloud protocol.
let terminalStateInfo={key:'',status:'new',revision:null,elapsed:0,damage:false,backup:false,writeBlocked:false};
let terminalOperator={sessions:0,manualObserved:false}, terminalOperatorKey='',terminalOperatorStarted=false;
let terminalBackupElapsed=0,terminalPersistenceClock=0,terminalIntegrityAt=0,terminalAutoWriteAt=-Infinity;
let terminalSensorAt=0,terminalTrailAt=0,terminalCursorPosition=null;
function terminalDigest(text) {
    // FNV-1a + character parity: accidental-damage fingerprints, not secure hashes.
    let hash=2166136261,parity=0;
    for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);hash=Math.imul(hash^code,16777619);parity^=code;}
    return {checksum:'0x'+(hash>>>0).toString(16).toUpperCase().padStart(8,'0'),parity};
}
function terminalReadJSON(key) {try{return JSON.parse(localStorage.getItem(key) || 'null');}catch(_){return null;}}
function terminalValidState(raw) {
    const value=JSON.parse(raw);
    if(!value || typeof value!=='object' || Array.isArray(value))throw Error('State is not a city object');
    return value;
}
function terminalRevision(record) {return Number.isSafeInteger(record?.revision) && record.revision>=0?record.revision:null;}
function terminalResolveState(raw,fromDevice=true,readFailed=false) {
    const key=getSaveKey();
    terminalStateInfo={key,status:readFailed?'unavailable':raw?'recovered':'new',revision:null,elapsed:0,damage:false,backup:false,writeBlocked:readFailed};
    terminalOperatorKey=key;terminalOperatorStarted=false;
    const profile=terminalReadJSON(key+':terminal-operator');
    terminalOperator={sessions:Number.isSafeInteger(profile?.sessions)?Math.max(0,Math.min(1000000,profile.sessions)):0,manualObserved:profile?.manualObserved===true};
    terminalBackupElapsed=0;terminalPersistenceClock=Date.now();terminalIntegrityAt=Date.now()+37000;terminalSensorAt=Date.now()+29000;terminalCursorPosition=null;
    if(!raw)return raw;
    try {
        const loaded=terminalValidState(raw),record=terminalReadJSON(key+':terminal-integrity');
        terminalStateInfo.elapsed=Number.isFinite(loaded.lastSeen)?Math.max(0,Math.floor((Date.now()-loaded.lastSeen)/1000)):0;
        terminalStateInfo.revision=terminalRevision(record);
        // A valid external/legacy state is never discarded for stale sidecar metadata.
        // Matching stamps with a mismatch are reported, but do not overwrite progress.
        if(fromDevice && record?.version===1 && record.at===loaded.lastSeen && record.checksum!==terminalDigest(raw).checksum)terminalStateInfo.damage=true;
        return raw;
    }catch(_){
        terminalStateInfo.status='damaged';terminalStateInfo.damage=true;
        if(!fromDevice)return null; // Never substitute another local city for a cloud input.
        terminalStateInfo.writeBlocked=true;terminalStateInfo.damagedRaw=String(raw);
        try{localStorage.setItem(key+':terminal-damaged',String(raw));terminalStateInfo.writeBlocked=localStorage.getItem(key+':terminal-damaged')!==String(raw);}catch(_){}
        const backup=terminalReadJSON(key+':terminal-backup');
        try{
            if(backup?.version!==1 || typeof backup.payload!=='string' || terminalDigest(backup.payload).checksum!==backup.checksum)throw Error('Backup unverified');
            const loaded=terminalValidState(backup.payload);
            terminalStateInfo.backup=true;terminalStateInfo.status='backup';
            terminalStateInfo.elapsed=Number.isFinite(loaded.lastSeen)?Math.max(0,Math.floor((Date.now()-loaded.lastSeen)/1000)):0;
            return backup.payload;
        }catch(_){return null;}
    }
}
function terminalCanWriteState() {
    const info=terminalStateInfo,key=getSaveKey();
    if(info.key!==key || !info.writeBlocked)return true;
    try{
        // Preserve evidence before replacing a damaged primary. Never overwrite a
        // different state that another tab may have written in the meantime.
        if(localStorage.getItem(key)!==info.damagedRaw)return false;
        localStorage.setItem(key+':terminal-damaged',info.damagedRaw);
        if(localStorage.getItem(key+':terminal-damaged')!==info.damagedRaw)return false;
        info.writeBlocked=false;info.damagedRaw=null;return true;
    }catch(_){return false;}
}
function terminalStateWritten(raw,manual=false) {
    const key=getSaveKey();let digest;
    try{
        if(localStorage.getItem(key)!==raw)throw Error('Readback differs');
        digest=terminalDigest(raw);
    }catch(_){if(!manual)terminalLog('STATE WRITE UNVERIFIED. Check device storage.','error');return 'ERROR: STATE WRITE UNVERIFIED. Check device storage.';}
    const previous=terminalReadJSON(key+':terminal-integrity'),revision=Math.min(Number.MAX_SAFE_INTEGER,(terminalRevision(previous) || 0)+1);
    try{localStorage.setItem(key+':terminal-integrity',JSON.stringify({version:1,...digest,revision,at:JSON.parse(raw).lastSeen}));}catch(_){}
    const line='STATE WRITTEN. CHECKSUM '+digest.checksum+'.';
    if(!manual && Date.now()-terminalAutoWriteAt>=30000){terminalAutoWriteAt=Date.now();terminalLog(line);}
    return line;
}
function terminalCreateBackup(manual=false) {
    if(!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.())return false;
    const key=getSaveKey();
    try{
        const raw=localStorage.getItem(key);if(!raw)throw Error('No device save');terminalValidState(raw);
        const backup=JSON.stringify({version:1,payload:raw,checksum:terminalDigest(raw).checksum,createdAt:Date.now()});
        localStorage.setItem(key+':terminal-backup',backup);
        if(localStorage.getItem(key+':terminal-backup')!==backup)throw Error('Backup readback differs');
        if(key!==getSaveKey())return false;
        if(manual)showNotification('LOCAL BACKUP CREATED.');else terminalLog('LOCAL BACKUP CREATED.');
        return true;
    }catch(_){if(manual)showNotification('ERROR: Local backup unavailable. Existing save retained.');else terminalLog('LOCAL BACKUP FAILED. Existing save retained.','error');return false;}
}
function terminalClearCityJournal() {
    const key=getSaveKey();
    for(const suffix of [':terminal-integrity',':terminal-backup',':terminal-damaged',':terminal-operator'])try{localStorage.removeItem(key+suffix);}catch(_){}
    terminalStateInfo={key,status:'new',revision:null,elapsed:0,damage:false,backup:false,writeBlocked:false};
    terminalOperator={sessions:0,manualObserved:false};terminalOperatorStarted=false;terminalOperatorKey=key;
    terminalBackupElapsed=0;terminalPersistenceClock=Date.now();
}
function terminalWriteOperator() {
    try{localStorage.setItem(getSaveKey()+':terminal-operator',JSON.stringify(terminalOperator));}catch(_){}
}
function terminalBeginOperatorSession() {
    if(!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.() || terminalOperatorStarted || terminalOperatorKey!==getSaveKey())return;
    terminalOperatorStarted=true;terminalOperator.sessions=Math.min(1000000,terminalOperator.sessions+1);terminalWriteOperator();
    if(terminalStateInfo.elapsed>=3600)terminalLog('WELCOME BACK, OPERATOR. '+formatDuration(terminalStateInfo.elapsed)+' ELAPSED.');
    if(terminalOperator.sessions>=3)terminalLog('OPERATOR HOURS: '+(Math.max(0,Number(game.playTimeSeconds)||0)/3600).toFixed(1)+'.');
    if(terminalStateInfo.damage)terminalLog(terminalStateInfo.status==='recovered'?'CHECKSUM JOURNAL DIFFERS. CURRENT STATE RETAINED.':terminalStateInfo.backup?'DAMAGE REPORTED. VERIFIED LOCAL BACKUP RECOVERED.':'DAMAGE REPORTED. No verified backup was recovered.','error');
}
function terminalRegisterManualClick() {
    const count=game.totalClicks;
    if(!gameStarted || window.LastCityCloud?.isSwitching?.() || !Number.isSafeInteger(count) || count<=0)return;
    if(count%100===0)terminalLog('CLICK REGISTER: 0x'+count.toString(16).toUpperCase()+'.');
    if(count>=100 && !terminalOperator.manualObserved && terminalOperatorKey===getSaveKey()){
        terminalOperator.manualObserved=true;terminalWriteOperator();terminalLog('OPERATOR PREFERS MANUAL GATHERING.');
    }
}
function terminalBootLines(kind) {
    const zone=['ASHFALL','DEPOT','FOUNDRY','RELAY','CITADEL'][Math.max(0,currentStageView-1)] || 'ASHFALL';
    const info=terminalStateInfo.key===getSaveKey()?terminalStateInfo:{status:'new'};
    const lines=['> '+zone+' TERMINAL v2.189...'];
    if(kind==='renewal')lines.push('> RENEWAL COMMITTED. REBUILDING.');
    else if(info.damage && info.status==='recovered')lines.push('> CHECKSUM JOURNAL DIFFERS. CURRENT STATE RETAINED.');
    else if(info.damage)lines.push('> DAMAGE REPORTED. ATTEMPTING RECOVERY.',info.backup?'> VERIFIED LOCAL BACKUP RECOVERED.':'> NO VERIFIED BACKUP RECOVERED. REVIEW DATA INTEGRITY.');
    else if(info.status==='unavailable')lines.push('> DEVICE STATE UNAVAILABLE. STORAGE ACCESS FAILED.');
    else lines.push(info.status==='new'?'> NO PRIOR STATE FOUND. INITIALIZING.':'> STATE RECOVERED. REV '+(info.revision===null?'UNTRACKED':info.revision)+'.');
    if(info.elapsed>=3600)lines.push('> WELCOME BACK, OPERATOR. '+formatDuration(info.elapsed)+' ELAPSED.');
    const account=getSaveKey().split(':account:')[1];
    lines.push(account?'> RELAY LINK: ACCOUNT/'+terminalDigest(account).checksum.slice(2)+'.':'> RELAY LINK: DEVICE / GUEST.');
    if(terminalOperator.sessions<=1 && !terminalCursorEnabled)lines.push('> OPTIONAL: ENABLE BLOCK CURSOR FOR AUTHENTIC INTERFACE.');
    lines.push('> CONNECTING TO RELAY...','> SIGNAL ACQUIRED.');return lines.join('\n');
}
function terminalCheckIntegrity() {
    const key=getSaveKey();
    try{
        const raw=localStorage.getItem(key);if(!raw)return '[NO DEVICE STATE]';const saved=terminalValidState(raw);
        const record=terminalReadJSON(key+':terminal-integrity'),digest=terminalDigest(raw);
        if(!record || record.version!==1)return '[STATE PARSED / CHECKSUM UNTRACKED]';
        if(record.at!==saved.lastSeen)return '[STATE PARSED / JOURNAL UPDATE PENDING]';
        if(record.checksum!==digest.checksum || record.parity!==digest.parity)return '[CHECKSUM MISMATCH / REVIEW DEVICE STATE]';
        return terminalPresentationRandom()<.5?'[CHECKSUM OK]':'[PARITY CHECK PASSED]';
    }catch(_){return '[DEVICE CHECK UNAVAILABLE]';}
}
function terminalPersistenceTick() {
    const now=Date.now(),elapsed=Math.min(1500,Math.max(0,now-terminalPersistenceClock));terminalPersistenceClock=now;
    if(!gameStarted || document.hidden || window.LastCityCloud?.isSwitching?.() || el('terminalBootModal')?.open)return;
    terminalBeginOperatorSession();
    terminalBackupElapsed+=elapsed;
    if(terminalBackupElapsed>=120000){terminalBackupElapsed=0;terminalCreateBackup();}
    const modalOpen=!!document.querySelector('dialog[open]');
    if(now>=terminalIntegrityAt && !modalOpen){
        terminalIntegrityAt=now+37000+Math.floor(terminalPresentationRandom()*13000);
        const status=terminalCheckIntegrity(),node=el('terminalIntegritySignal');
        if(node && canPlayVfx()){if(node.dataset)node.dataset.result=/MISMATCH|UNAVAILABLE/.test(status)?'error':'ok';terminalTypeText(node,'> '+status,160);node.hidden=false;terminalTask(()=>{node.hidden=true;},2000);}
        terminalLog(status,/MISMATCH|UNAVAILABLE/.test(status)?'error':'info');
        if(terminalCursorEnabled && canPlayVfx())animateVfx(el('terminalCursor'),[{translate:'0 0',opacity:1},{translate:'1px -1px',opacity:.35,offset:.35},{translate:'-1px 0',opacity:1,offset:.7},{translate:'0 0',opacity:1}],{duration:180});
    }
    if(!canPlayVfx() || modalOpen)return;
    if(now>=terminalSensorAt){
        terminalSensorAt=now+29000+Math.floor(terminalPresentationRandom()*12000);
        const stage=currentGameMode==='glyphs'?1:currentStageView,rate=zoneRate(stage),sensor=el('terminalRateSensor');
        if(sensor && Number.isFinite(rate) && rate>0){
            // The authoritative counter is never changed by a cosmetic estimate.
            sensor.textContent='SENSOR ~'+formatNumber(rate*.998)+'/s';sensor.hidden=false;
            terminalTask(()=>{sensor.textContent='SENSOR ~'+formatNumber(rate*1.002)+'/s';},90);
            terminalTask(()=>{sensor.hidden=true;},250);
        }
    }
}
function terminalHashHint(node) {
    if(node?.id!=='walletBalance')return '';
    const stage=currentGameMode==='glyphs'?1:currentStageView,value=Number(game[ZONES[stage].currency]);
    return Number.isFinite(value) && value>=1e6?' [HASH: '+terminalDigest(String(value)).checksum+']':'';
}
function terminalCursorTrail(event,cursor,parent) {
    if(terminalCursorPosition && Date.now()-terminalTrailAt>=35){
        terminalTrailAt=Date.now();const trace=document.createElement('i');trace.className='terminal-cursor-trail';
        trace.style.left=terminalCursorPosition.x+'px';trace.style.top=terminalCursorPosition.y+'px';
        mountVfx(trace,120,parent===document.body?null:parent);
    }
    terminalCursorPosition={x:event.clientX,y:event.clientY};
}
function terminalRememberScreen() {
    const modal=document.querySelector('dialog[open]');
    const texts=modal?.id==='zoneHelpModal'?[el('zoneHelpTitle')?.textContent,...[...(el('zoneHelpContent')?.querySelectorAll('h3') || [])].slice(0,2).map(n=>n.textContent)]:currentGameMode==='upgrades'?[el('purchaseTitle')?.textContent,el('purchaseZone')?.textContent]:[el('worldZoneName')?.textContent,el('milestoneTitle')?.textContent];
    // Whitelist UI headings only. Never clone credentials, feedback, inputs or a save.
    terminalScreenEcho=texts.filter(Boolean).map(s=>String(s).slice(0,80)).slice(0,3).join('\n');
}
function terminalHoldJump() {
    if(!canPlayVfx())return;
    // Moving normal document flow with `top` avoids creating a containing block
    // for fixed navigation. Fixed HUD surfaces receive the same 2px compositor jump.
    animateVfx(document.body,[{top:'0px'},{top:'2px',offset:.3},{top:'-1px',offset:.6},{top:'0px'}],{duration:150});
    for(const node of document.querySelectorAll('.wallet-bar,.game-mode-tabs,#mobileGather,#terminalLogPanel,#zoneHelpButton,#crtOverlay,#notification,dialog[open]')){
        if(window.getComputedStyle?.(node)?.position==='fixed' || node.matches?.('dialog[open]'))animateVfx(node,[{translate:'0 0'},{translate:'0 2px',offset:.3},{translate:'0 -1px',offset:.6},{translate:'0 0'}],{duration:150});
    }
}
