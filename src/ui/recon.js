// Read-only holographic survey. Glyph budget limits the picture, never ownership.
const RECON_SECTORS = [
    {key:'scavenger',name:'Camps',code:'01 / RECLAMATION',x:95,y:110,w:215,h:145,shape:'tent'},
    {key:'shelter',name:'Shelters',code:'02 / HABITATION',x:510,y:105,w:195,h:160,shape:'block'},
    {key:'workshop',name:'Workshops',code:'03 / FABRICATION',x:125,y:330,w:300,h:115,shape:'shed'},
    {key:'power',name:'Power Plants',code:'04 / POWER',x:525,y:335,w:160,h:110,shape:'stack'}
];
const RECON_CLASSES = [{name:'Outpost',at:0},{name:'Camp',at:10},{name:'District',at:100},{name:'City',at:1000},{name:'Metropolis',at:10000},{name:'Megacity',at:100000},{name:'Arcology',at:1000000}];
const RECON_CIVIC_PLOTS=[[355,155],[442,155],[355,245],[442,245],[346,193],[469,193],[346,219],[469,219],[380,103],[423,103],[381,261],[423,261]];
let reconRenderKey='',reconInitialized=false,reconQuietUntil=0,reconGlitchAt=0;
const reconPending=new Map();
let reconSweepTimer=null,reconAudioLoop=null,reconAudioArmed=false,reconAudioFailed=false;
let reconLastMode='',reconGhost=null,reconLastAck=null,reconNarrationClock=0,reconNarrationElapsed=0,reconNarrationDue=35000,reconNarrationIndex=0;
function reconCount(value) {return Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;}
function reconRaw(value) {return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);}
function reconClass(total) {return RECON_CLASSES.reduce((tier,item)=>total>=item.at?item:tier,RECON_CLASSES[0]);}
function reconMapSnapshot() {
    const counts=Object.fromEntries([...RECON_SECTORS.map(s=>s.key),'citycenter'].map(key=>[key,reconCount(game.buildings?.[key])]));
    const total=Object.values(counts).reduce((sum,count)=>sum+count,0);
    return {counts,total,tier:reconClass(total),beacon:Math.min(3,reconCount(game.adventure?.progression?.beaconModules)),population:reconCount(getPopulation())};
}
function reconDensity(count) {
    const strength=count?Math.min(1,Math.log10(count+1)/5):0;
    return {glyphs:count?Math.min(count,30,Math.ceil(1+7*Math.log10(count))):0,height:5+Math.min(28,Math.log10(count+1)*5),strength};
}
function reconPrism(x,y,w,d,h,kind='block') {
    const roof=kind==='tent'?`M${x} ${y-h/2}l${w/2} ${-h/2} ${w/2} ${h/2} -${w/2} ${d}Z`:`M${x} ${y-h}h${w}l-5 ${d}h-${w}Z`;
    let details='';
    if(kind==='stack')details=`<path class="recon-energy-core" d="M${x+w/2} ${y-h+4}v-17m-5 3h10m-4 5h8"/><ellipse class="recon-coil" cx="${x+w/2}" cy="${y-h/2}" rx="${w/2+3}" ry="3"/><ellipse class="recon-coil" cx="${x+w/2}" cy="${y-h/2+7}" rx="${w/2+3}" ry="3"/>`;
    else if(kind==='shed')details=`<path class="recon-window" d="M${x+3} ${y-h+4}h${w-10}"/><path class="recon-chimney" d="M${x+w-9} ${y-h+2}v-13h5v13m-7 -16l2 -3m4 0l2 -3"/>`;
    else if(kind==='block')for(let floor=1;floor<=Math.min(6,Math.floor(h/7));floor++)details+=`<path class="recon-floor" d="M${x-2} ${y-h+d+floor*6}h${w-6}"/>`;
    else details=`<path class="recon-tent-seam" d="M${x+w/2} ${y-h}v${h+d}m-3 -3h6"/>`;
    if((kind==='block' || kind==='stack') && h>=22)details+=`<path class="recon-refraction" d="M${x-4} ${y-h+3}L${x+w+2} ${y-h-1}"/>`;
    return `<g class="recon-building" data-recon-shape="${kind}"><path class="recon-side" d="M${x-5} ${y-h+d}h${w}v${h}h-${w}Z"/><path class="recon-side-dark" d="M${x+w} ${y-h}l-5 ${d}v${h}l5 -${d}Z"/><path class="recon-roof" d="${roof}"/>${details}</g>`;
}
function reconCellGeometry(sector,cell,index,height) {
    const {x,y,w,h,shape}=sector,scatter=shape==='tent',power=shape==='stack';
    const jitter=scatter?((cell.col*17+cell.row*11)%9)-4:0;
    return {x:x+(power?35:15)+cell.col*(w-(power?70:30))/6+jitter,y:y+30+cell.row*(h-40)/5+(scatter?((index*7)%9)-4:0),
        w:scatter?11+(index%4)*2:power?10:shape==='shed'?Math.min(40,(w-30)/6-5):18,
        d:shape==='shed'?14:scatter?8:11,h:scatter?6+(index%3)*2:shape==='shed'?7+(index%2)*3:power?Math.min(43,15+height):Math.min(46,10+height)};
}
function reconSectorPlacements(sector,count) {
    const {glyphs,height}=reconDensity(count);
    // Fixed cell order: existing placements do not move when density increases.
    const outward=sector.shape==='tent' || sector.shape==='stack';
    const cells=Array.from({length:30},(_,i)=>({col:i%6,row:Math.floor(i/6),order:outward?Math.pow(i%6-2.5,2)+Math.pow(Math.floor(i/6)-2,2):(i%6)*13%7+Math.floor(i/6)*3})).sort((a,b)=>a.order-b.order || a.row-b.row || a.col-b.col);
    return cells.slice(0,glyphs).map((cell,index)=>reconCellGeometry(sector,cell,index,height)).sort((a,b)=>a.y-b.y);
}
function recordReconRenewal(before) {
    if(!before || !gameStarted || window.LastCityCloud?.isSwitching?.())return;
    const after=reconMapSnapshot();
    reconGhost=Object.keys(before.counts).some(key=>before.counts[key]>after.counts[key])?{counts:{...before.counts},expires:Date.now()+30000}:null;
    reconRenderKey='';reconPending.clear();reconLastAck=null;
    if(el('reconPurchaseEcho'))el('reconPurchaseEcho').hidden=true;
    if(el('reconPlacement'))terminalTypeText(el('reconPlacement'),'> FOOTPRINT RENEWED. '+(reconGhost?'PREVIOUS PLOTS DECAYING.':'PRESERVED STRUCTURES VERIFIED.'),180);
    if(reconGhost)terminalLog('RECON / PREVIOUS FOOTPRINT RETAINED. MEMORY DECAY: 30 SECONDS.');
}
function reconGhostMarkup(snapshot) {
    if(!reconGhost || Date.now()>=reconGhost.expires)return '';
    let paths='';
    for(const sector of RECON_SECTORS){
        if(reconGhost.counts[sector.key]<=snapshot.counts[sector.key])continue;
        const current=new Set(reconSectorPlacements(sector,snapshot.counts[sector.key]).map(p=>p.x+','+p.y));
        for(const p of reconSectorPlacements(sector,reconGhost.counts[sector.key]))if(!current.has(p.x+','+p.y))paths+=`<path d="M${p.x-5} ${p.y+p.d}h${p.w}v6h-${p.w}Z"/>`;
    }
    for(let i=Math.min(RECON_CIVIC_PLOTS.length,snapshot.counts.citycenter);i<Math.min(RECON_CIVIC_PLOTS.length,reconGhost.counts.citycenter);i++){
        const [x,y]=RECON_CIVIC_PLOTS[i];paths+=`<path d="M${x-9} ${y+9}h33v12h-33Z"/>`;
    }
    return `<g class="recon-ghost-plots" aria-hidden="true" style="animation-delay:-${(30000-(reconGhost.expires-Date.now()))/1000}s">${paths}</g>`;
}
function reconInventoryTier(count) {return count>0?Math.floor(Math.log10(count))+1:0;}
function reconInventoryRow(type,name,code,count,beacon=false) {
    const tier=beacon?count:reconInventoryTier(count),start=beacon?0:tier?Math.pow(10,tier-1):0,next=beacon?3:Math.pow(10,tier || 1);
    const progress=beacon?count/3:Math.max(0,Math.min(1,(count-start)/(next-start)));
    const label=beacon?`${count} of 3 restored modules`:`${reconRaw(count)} owned; next tier at ${reconRaw(next)}`;
    return `<li data-recon-row="${type}" data-tier="${Math.min(6,tier)}"><button type="button" data-recon-nav="${type}" aria-label="Open ${name}; ${label}" title="Open ${name}; no resources spent."><span>${name}<small>${code}</small></span><strong>${beacon?count+' / 3':reconRaw(count)}</strong><progress max="100" value="${(progress*100).toFixed(1)}" aria-label="${label}"></progress><small class="recon-tier-target">${beacon?(count===3?'SIGNAL COMPLETE':'MODULES / '+count+'/3'):'NEXT / '+reconRaw(next)}</small></button></li>`;
}
function reconWorldColor() {return window.getComputedStyle?.(document.body)?.getPropertyValue?.('--world-color')?.trim() || '#b5e7ca';}
function reconInteractionAllowed() {return !!(currentStageView===1 && gameStarted && !document.hidden && !window.LastCityCloud?.isSwitching?.() && !document.querySelector('dialog[open],.offline-modal') && !el('playerSettings')?.open);}
function reconNarrate(snapshot) {
    const now=Date.now();
    if(!reconViewActive()){reconNarrationClock=0;return;}
    if(reconNarrationClock)reconNarrationElapsed+=Math.min(1500,Math.max(0,now-reconNarrationClock));
    reconNarrationClock=now;
    if(reconNarrationElapsed<reconNarrationDue)return;
    reconNarrationElapsed=0;reconNarrationDue=30000+Math.floor(terminalPresentationRandom()*30000);
    const lines=[`RECON SCAN: ${reconRaw(snapshot.total)} STRUCTURES REGISTERED.`,snapshot.counts.shelter?`HOUSING SHARE: ${Math.round(100*snapshot.counts.shelter/Math.max(1,snapshot.total))}% OF STRUCTURES.`:'WARNING: NO CREW SHELTERS DETECTED.',`BEACON: ${snapshot.beacon===3?'SIGNAL STABLE':'RESTORATION'} AT ${snapshot.beacon}/3.`,`RECON / ${reconRaw(snapshot.population)} RESIDENTS REGISTERED.`];
    terminalLog(lines[reconNarrationIndex++%lines.length]);
}
function reconResetHover() {for(const axis of ['x','z'])el('reconPlane')?.style?.setProperty('--recon-hover-'+axis,'0deg');}
function reconHover(event) {
    if(event.pointerType!=='mouse' || !reconMotionAllowed() || vfxAnimations.has(el('reconPlane')))return;
    const rect=el('reconProjection')?.getBoundingClientRect();if(!rect?.width || !rect.height)return;
    const x=Math.max(-1,Math.min(1,2*(event.clientX-rect.left)/rect.width-1)),y=Math.max(-1,Math.min(1,2*(event.clientY-rect.top)/rect.height-1));
    el('reconPlane').style?.setProperty('--recon-hover-x',(-y*2.5).toFixed(2)+'deg');el('reconPlane').style?.setProperty('--recon-hover-z',(x*2.5).toFixed(2)+'deg');
}
function reconNavigate(type) {
    if(!reconInteractionAllowed() || ![...RECON_SECTORS.map(s=>s.key),'citycenter','beacon'].includes(type))return;
    document.querySelector('.stage-tab[data-stage="1"]')?.click();
    if(type==='beacon'){switchGameMode('city');focusPlayerTarget('[data-action="beacon"]');}
    else openPurchase('buildings','#buy'+type[0].toUpperCase()+type.slice(1));
}
function reconEcho() {
    const node=el('reconPurchaseEcho');if(!node)return;
    node.hidden=!(reconLastAck && Date.now()-reconLastAck.at<5000 && el('reconMap')?.open && reconInteractionAllowed() && currentGameMode==='upgrades');
}
function reconSectorMarkup(sector,count) {
    const {strength}=reconDensity(count),{x,y,w,h}=sector;
    let shapes='';
    for(const geometry of reconSectorPlacements(sector,count)){
        shapes+=reconPrism(geometry.x,geometry.y,geometry.w,geometry.d,geometry.h,sector.shape);
    }
    return `<g data-recon-sector="${sector.key}" class="recon-sector${count?' occupied':''}" role="button" tabindex="0" aria-label="Open ${sector.name} in Ashfall Buildings" style="--recon-density:${strength.toFixed(3)}"><title>Open ${sector.name} in Buildings; no resources spent.</title><path class="recon-sector-bed" d="M${x} ${y}h${w}v${h}h-${w}Z"/><path class="recon-density-bed" opacity="${(.05+strength*.32).toFixed(3)}" d="M${x+5} ${y+8}h${w-10}v${h-16}h-${w-10}Z"/>${shapes}<text x="${x+5}" y="${y+h+17}" class="recon-sector-code">${sector.code}</text></g>`;
}
function reconNetworkMarkup(snapshot) {
    let lines='<g class="recon-signal-network" aria-hidden="true">';
    const ports=[[310,214],[510,186],[305,330],[585,335]];
    for(const [index,port] of ports.entries())for(let lane=0;lane<Math.max(1,snapshot.beacon);lane++){
        const bend=lane*5,active=snapshot.beacon>lane;
        lines+=`<path class="recon-signal-line${active?' active':''}" style="--signal-strength:${(.06+snapshot.beacon*.055).toFixed(3)};animation-delay:-${index+lane}s" d="M401 207L${401+bend} ${290-lane*6}H${port[0]+bend}V${port[1]}"/>`;
    }
    for(const [x,y] of RECON_CIVIC_PLOTS.slice(0,Math.min(RECON_CIVIC_PLOTS.length,snapshot.counts.citycenter)))lines+=`<path class="recon-civic-link" d="M${x+8} ${y+18}L401 207"/>`;
    return lines+'</g>';
}
function reconBeaconMarkup(snapshot) {
    const modules=[0,1,2].map(i=>{const y=184-i*10,active=snapshot.beacon>i;return `<path class="recon-module-link${active?' active':''}" style="animation-delay:-${i*.5}s" d="M394 ${y+2}H${380-i*5}V${152-i*3}H401"/><path class="recon-beacon-module${active?' active':''}" d="M394 ${y}h14v5h-14Z"/>`;}).join('');
    return `<g data-recon-sector="beacon" role="button" tabindex="0" aria-label="Open Beacon restoration" class="recon-beacon${snapshot.beacon?' occupied':''}"><title>Open Beacon restoration; no resources spent.</title><ellipse class="recon-plinth" cx="401" cy="207" rx="27" ry="16"/><ellipse class="recon-heartbeat-halo" cx="401" cy="144" rx="16" ry="11"/><path class="recon-mast" d="M401 210V145M389 172l12 -27 12 27m-20 18h16"/>${snapshot.beacon?'<path class="recon-module-link active" d="M401 145V210"/>':''}${modules}<circle class="recon-beacon-tip" cx="401" cy="144" r="4"/><text x="401" y="126" text-anchor="middle" class="recon-sector-code">BEACON / ${snapshot.beacon}/3</text></g>`;
}
function reconSurveyMarkup(snapshot) {
    const plane='M80 65H680L745 115V435L680 485H100L45 435V120Z';
    let markup=`<defs><pattern id="reconGrid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="currentColor" stroke-opacity=".11" stroke-width=".7"/></pattern><clipPath id="reconClip"><path d="${plane}"/></clipPath><linearGradient id="reconSweep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8f8d0" stop-opacity="0"/><stop offset=".85" stop-color="#b8f8d0" stop-opacity=".04"/><stop offset="1" stop-color="#b8f8d0" stop-opacity=".38"/></linearGradient></defs><path class="recon-plane-under" d="M45 435L100 485H680L745 435V450L680 500H100L45 450Z"/><path class="recon-outline" d="${plane}"/><path fill="url(#reconGrid)" d="${plane}"/><g clip-path="url(#reconClip)"><path class="recon-roads" d="M75 290H715M455 80V465M350 90V285M80 285V295H715M450 80H460V465"/>`;
    markup+='<defs><pattern id="reconDust" width="173" height="127" patternUnits="userSpaceOnUse"><circle cx="13" cy="31" r=".7"/><circle cx="88" cy="17" r="1.1"/><circle cx="136" cy="89" r=".6"/><circle cx="58" cy="104" r=".8"/></pattern></defs>';
    markup+=reconNetworkMarkup(snapshot);
    markup+=reconGhostMarkup(snapshot);
    for(const sector of RECON_SECTORS)markup+=reconSectorMarkup(sector,snapshot.counts[sector.key]);
    // Dedicated plinths add footprint, not height. Aggregate above the bounded
    // 12-plot survey budget; ownership and exact inventory remain unrestricted.
    markup+='<g data-recon-sector="citycenter" class="recon-civic-core" role="button" tabindex="0" aria-label="Open City Centers in Ashfall Buildings"><title>Open City Centers in Buildings; no resources spent.</title>';
    for(let i=0;i<RECON_CIVIC_PLOTS.length;i++){
        const [x,y]=RECON_CIVIC_PLOTS[i],active=snapshot.counts.citycenter>i;
        if(i>=4 && !active)continue;
        markup+=`<g data-recon-civic="${i}" class="recon-civic${active?' occupied':''}"><path class="recon-plinth" d="M${x-9} ${y+9}h33v12h-33Z"/>${active?reconPrism(x,y,i<4?20:13,10,i<4?26:18):''}</g>`;
    }
    markup+='</g>';
    const civic=snapshot.counts.citycenter>9999?snapshot.counts.citycenter.toExponential(1):reconRaw(snapshot.counts.citycenter);
    markup+=reconBeaconMarkup(snapshot)+`<text class="recon-sector-code" x="401" y="307" text-anchor="middle" data-recon-civic-code>CIVIC / ${civic}</text><g class="recon-surface-rings" aria-hidden="true"><circle cx="401" cy="210" r="52"/><circle cx="401" cy="210" r="95"/><circle cx="401" cy="210" r="147"/></g><rect class="recon-sweep" x="40" y="-95" width="710" height="90" fill="url(#reconSweep)"/><path class="recon-dust-haze" d="${plane}"/><path class="recon-bloom-wash" d="${plane}"/></g><path class="recon-edge-fringe fringe-red" d="${plane}" transform="translate(-1.3 0)"/><path class="recon-edge-fringe fringe-blue" d="${plane}" transform="translate(1.3 0)"/><path class="recon-edge-glint" d="M45 435L100 485H680L745 435M80 65H680"/>`;
    return markup;
}
function reconViewActive() {
    const panel=el('reconMap'),rect=(el('reconProjection') || panel)?.getBoundingClientRect?.();
    return !!(currentStageView===1 && panel?.open && !panel.hidden && gameStarted && !document.hidden && !window.LastCityCloud?.isSwitching?.() && !document.querySelector('dialog[open],.offline-modal') && !el('playerSettings')?.open && rect?.bottom>0 && rect.top<window.innerHeight);
}
function reconMotionAllowed() {return reconViewActive() && canPlayVfx() && Date.now()>=reconQuietUntil;}
function cancelReconAnimation() {
    const node=el('reconPlane'),record=vfxAnimations.get(node);
    if(record){clearTimeout(record.timer);record.animation.cancel();vfxAnimations.delete(node);}
}
function quietReconMap() {reconQuietUntil=Date.now()+900;cancelReconAnimation();reconResetHover();}
function clearReconReactions() {
    const terrain=el('reconTerrain'),inventory=el('reconInventory');
    for(const [node,record] of vfxAnimations)if(terrain?.contains?.(node) || inventory?.contains?.(node)){clearTimeout(record.timer);record.animation.cancel();vfxAnimations.delete(node);}
    if(typeof clearLayerVfx==='function')clearLayerVfx(terrain);
    if(typeof terminalPrints!=='undefined' && typeof terminalStopPrint==='function')for(const node of [...terminalPrints.keys()])if(terrain?.contains?.(node))terminalStopPrint(node);
    clearReconSweepTimer();
}
function clearReconMapPresentation(reset=false) {
    cancelReconAnimation();clearReconReactions();stopReconAudio();reconGlitchAt=0;reconResetHover();reconNarrationClock=0;
    if(el('reconMap'))el('reconMap').dataset.live='false';
    if(reset){reconGhost=null;reconLastAck=null;reconLastMode='';reconNarrationElapsed=0;reconNarrationIndex=0;reconNarrationDue=35000;reconPending.clear();reconAudioArmed=false;reconAudioFailed=false;reconRenderKey='';if(el('reconMap'))el('reconMap').open=false;if(el('reconPlacement'))el('reconPlacement').textContent='> SURVEY RESYNCED. Current city footprint only.';if(el('reconGhostStatus'))el('reconGhostStatus').hidden=true;const echo=el('reconPurchaseEcho');if(echo){echo.hidden=true;if(typeof terminalStopPrint==='function')terminalStopPrint(echo);const record=vfxAnimations.get(echo);if(record){clearTimeout(record.timer);record.animation.cancel();vfxAnimations.delete(echo);}}}
}
function renderReconMap() {
    const panel=el('reconMap');if(!panel)return;
    panel.hidden=currentStageView!==1 || !gameStarted || !['city','upgrades'].includes(currentGameMode) || !!window.LastCityCloud?.isSwitching?.();
    if(gameStarted && !window.LastCityCloud?.isSwitching?.()){
        const view=currentStageView+':'+currentGameMode;
        if(currentStageView===1 && currentGameMode==='city' && reconLastMode!==view)panel.open=true;
        reconLastMode=view;
        if(typeof ambientAudioArmed!=='undefined' && ambientAudioArmed)reconAudioArmed=true;
    }
    if(reconGhost && Date.now()>=reconGhost.expires){reconGhost=null;reconRenderKey='';}
    if(el('reconGhostStatus'))el('reconGhostStatus').hidden=!reconGhost;
    reconEcho();
    const snapshot=reconMapSnapshot(),summary=snapshot.tier.name.toUpperCase()+' / '+reconRaw(snapshot.total)+' STRUCTURES';
    if(el('reconSummary').textContent!==summary)el('reconSummary').textContent=summary;
    const active=reconViewActive(),live=active && canPlayVfx(),wasLive=panel.dataset.live==='true';panel.dataset.live=String(live);
    if(live && !wasLive && reconGhost)el('reconTerrain')?.querySelector?.('.recon-ghost-plots')?.style?.setProperty('animation-delay',-(30000-(reconGhost.expires-Date.now()))/1000+'s');
    syncReconAudio();
    if(!reconMotionAllowed()){cancelReconAnimation();reconResetHover();}
    if(!live)clearReconReactions();
    reconNarrate(snapshot);
    if(panel.hidden || !panel.open)return;
    const key=JSON.stringify(snapshot);
    if(key!==reconRenderKey){
        const focused=document.activeElement?.closest?.('[data-recon-sector],[data-recon-nav]'),focusType=focused?.dataset?.reconSector || focused?.dataset?.reconNav,focusInventory=!!focused?.dataset?.reconNav;
        clearReconReactions();
        reconRenderKey=key;
        el('reconTerrain').innerHTML=reconSurveyMarkup(snapshot);
        el('reconSvgDesc').textContent=`Ashfall ${snapshot.tier.name}. ${reconRaw(snapshot.total)} structures; ${reconRaw(snapshot.population)} residents. Camps west; Shelters east; Workshops southwest; Power southeast; Beacon and civic core central. Cluster glyphs summarize density, not individual inventory.`;
        el('reconTier').textContent=snapshot.tier.name;el('reconTotal').textContent=reconRaw(snapshot.total);el('reconPopulation').textContent=reconRaw(snapshot.population);
        const next=RECON_CLASSES.find(item=>item.at>snapshot.total),progress=el('reconProgress');
        el('reconProgressLabel').textContent=next?`Next survey class: ${next.name} / ${reconRaw(snapshot.total)} of ${reconRaw(next.at)} structures`:'Arcology / footprint continues expanding. No ownership limit.';
        progress.value=next?100*(snapshot.total-snapshot.tier.at)/(next.at-snapshot.tier.at):100;
        progress.setAttribute('aria-valuetext',next?reconRaw(snapshot.total)+' of '+reconRaw(next.at)+' structures':'Highest survey class; ownership continues');
        el('reconInventory').innerHTML=RECON_SECTORS.map(s=>reconInventoryRow(s.key,s.name,s.code,snapshot.counts[s.key])).join('')+reconInventoryRow('citycenter','City Centers','CIVIC CORE / DEDICATED PLINTHS',snapshot.counts.citycenter)+reconInventoryRow('beacon','Beacon modules','CENTRAL MAST',snapshot.beacon,true);
        if(focusType && focused?.isConnected===false)(focusInventory?el('reconInventory'):el('reconTerrain'))?.querySelector?.('['+(focusInventory?'data-recon-nav':'data-recon-sector')+'="'+focusType+'"]')?.focus?.({preventScroll:true});
    }
    const signal=live?'SIGNAL LOCK / LIVE':game.effectsEnabled===false?'STATIC SURVEY / FX OFF':'SIGNAL LOCK / STEADY';
    if(el('reconSignal').textContent!==signal)el('reconSignal').textContent=signal;
    flushReconPlacements();
    const now=Date.now();
    if(!reconGlitchAt)reconGlitchAt=now+65000;
    if(reconMotionAllowed() && now>=reconGlitchAt){
        reconResetHover();
        reconGlitchAt=now+55000+Math.floor(terminalPresentationRandom()*40000);
        animateVfx(el('reconPlane'),[{transform:'rotateX(42deg)'},{transform:'rotateX(43.4deg) translateY(1px)',offset:.3},{transform:'rotateX(41.6deg)',offset:.7},{transform:'rotateX(42deg)'}],{duration:170,easing:'steps(2)'});
    }
}
function reconDensityBand(count) {return count<=0?0:Math.max(1,Math.ceil(Math.log10(count)));}
function reconCue(type,placement=false) {if(game.soundEnabled && (placement?el('reconMap')?.open && !el('reconMap')?.hidden && reconInteractionAllowed():reconViewActive()) && typeof playSfx==='function'){playSfx(type);return true;}return false;}
function flushReconPlacements() {
    for(const [type,entry] of reconPending){
        if(Date.now()-entry.at>30000){reconPending.delete(type);continue;}
        if(!reconViewActive())continue;
        reconPending.delete(type);
        const terrain=el('reconTerrain'),sector=terrain?.querySelector?.('[data-recon-sector="'+type+'"]');
        if(!sector)continue;
        sector.dataset.confirmed='true'; // Static acknowledgement survives effects-off.
        const target=type==='citycenter'?sector.querySelector('[data-recon-civic="'+entry.plinth+'"] .recon-plinth'):sector.querySelector('.recon-sector-bed,.recon-plinth');
        if(canPlayVfx()){
            const color=reconWorldColor();
            animateVfx(target,[{fill:color,fillOpacity:entry.strong ? .32 : .2,stroke:color,strokeWidth:entry.strong?3:2,strokeDasharray:'none',opacity:entry.first?0:1},{fill:color,fillOpacity:entry.strong ? .4 : .27,stroke:color,opacity:1,offset:.25},{fillOpacity:.025,stroke:'#608a72',strokeWidth:1,opacity:1}],{duration:entry.strong?800:550});
            if(entry.first)animateVfx(sector,[{opacity:0},{opacity:1}],{duration:600});
            if(entry.strong)animateVfx(el('reconInventory')?.querySelector?.('[data-recon-row="'+type+'"]'),[{filter:'brightness(1.4)',boxShadow:'inset 2px 0 0 '+color},{filter:'brightness(1)',boxShadow:'inset 0px 0 0 transparent'}],{duration:650});
            if(entry.first){const code=type==='citycenter'?terrain.querySelector('[data-recon-civic-code]'):sector.querySelector('.recon-sector-code');if(code)terminalTypeText(code,code.textContent,320);}
            if(entry.strong && document.createElementNS && typeof mountVfx==='function'){
                const definition=RECON_SECTORS.find(s=>s.key===type),cx=definition?definition.x+definition.w/2:401,cy=definition?definition.y+definition.h/2:type==='beacon'?144:207;
                const ring=document.createElementNS('http://www.w3.org/2000/svg','circle');ring.setAttribute('class','recon-placement-wave');ring.setAttribute('style','stroke:'+color);ring.setAttribute('cx',cx);ring.setAttribute('cy',cy);ring.setAttribute('r',18);mountVfx(ring,850,terrain);
            }
            if(entry.bloom){animateVfx(terrain.querySelector('.recon-bloom-wash'),[{opacity:0},{opacity:.12,offset:.3},{opacity:0}],{duration:900});animateVfx(sector.querySelector('.recon-beacon-tip'),[{filter:'drop-shadow(0 0 0px #ceffe1)'},{filter:'drop-shadow(0 0 9px #ceffe1)',offset:.35},{filter:'drop-shadow(0 0 2px #ceffe1)'}],{duration:1300});}
        }
        if(!entry.heard)reconCue(entry.bloom?'reconBloom':entry.strong?'reconTier':'reconPlace');
    }
}
function clearReconSweepTimer() {if(reconSweepTimer!==null){clearTimeout(reconSweepTimer);if(typeof terminalTasks!=='undefined')terminalTasks.delete(reconSweepTimer);reconSweepTimer=null;}}
function scheduleReconSweep(node) {
    clearReconSweepTimer();
    if(!reconMotionAllowed() || typeof terminalTask!=='function')return;
    reconSweepTimer=terminalTask(()=>{reconSweepTimer=null;if(node.isConnected!==false && reconMotionAllowed())reconCue('reconSweep');},1760);
}
function stopReconAudio() {
    if(!reconAudioLoop)return;const previous=reconAudioLoop;reconAudioLoop=null;
    for(const node of previous.voices)try{node.stop();node.disconnect();}catch(_){}
    for(const node of previous.gains)try{node.disconnect();}catch(_){}
    try{previous.context.close()?.catch?.(()=>{});}catch(_){}
}
function syncReconAudio() {
    const Audio=window.AudioContext || window.webkitAudioContext;
    if(!reconAudioArmed || reconAudioFailed || !game.soundEnabled || game.ambientEnabled!==true || !reconViewActive() || !Audio){stopReconAudio();return;}
    if(reconAudioLoop)return;
    let context,voices=[],gains=[];
    try{
        context=new Audio();const volume=context.createGain();volume.gain.value=.004;volume.connect(context.destination);gains.push(volume);
        for(const frequency of [54,81]){const voice=context.createOscillator(),gain=context.createGain();voice.type='sine';voice.frequency.value=frequency;gain.gain.value=.18;voice.connect(gain).connect(volume);gains.push(gain);voices.push(voice);voice.start();}
        reconAudioLoop={context,voices,gains};
        context.resume()?.catch?.(()=>{if(reconAudioLoop?.context===context){reconAudioFailed=true;stopReconAudio();}});
    }catch(_){reconAudioFailed=true;if(reconAudioLoop?.context===context)stopReconAudio();else{for(const voice of voices)try{voice.stop();voice.disconnect();}catch(_){}for(const gain of gains)try{gain.disconnect();}catch(_){}try{context?.close()?.catch?.(()=>{});}catch(_){}}}
}
function armReconAudio() {reconAudioArmed=true;reconAudioFailed=false;syncReconAudio();}
function recordReconMapPlacement(before,type) {
    if(!before || !gameStarted || window.LastCityCloud?.isSwitching?.())return;
    const after=reconMapSnapshot(),count=type==='beacon'?after.beacon:after.counts[type],previous=type==='beacon'?before.beacon:before.counts[type];
    if(!Number.isFinite(count) || count<=previous)return;
    quietReconMap();
    const sector=RECON_SECTORS.find(s=>s.key===type),label=type==='beacon'?'Beacon':type==='citycenter'?'Civic core':sector?.name;
    if(!label)return;
    const strong=after.tier.at>before.tier.at || previous>0 && (reconInventoryTier(count)>reconInventoryTier(previous) || reconDensityBand(count)>reconDensityBand(previous));
    const bloom=type==='beacon' && previous<3 && count>=3;
    const significant=previous===0 || type==='beacon' || (type==='citycenter' && previous<RECON_CIVIC_PLOTS.length) || strong;
    if(significant)terminalLog(`RECON / ${label.toUpperCase()}: ${reconRaw(count)}${type==='beacon'?'/3 MODULES':' CONFIRMED'}.`);
    if(after.tier.at>before.tier.at)terminalLog(`RECON / SETTLEMENT RECLASSIFIED: ${after.tier.name.toUpperCase()}. ${reconRaw(after.total)} STRUCTURES.`,'ok');
    if(bloom)terminalLog('RECON / BEACON ONLINE. WE ARE STILL HERE.','ok');
    if(el('reconPlacement'))terminalTypeText(el('reconPlacement'),'> '+(bloom?'BEACON ONLINE. WE ARE STILL HERE.':after.tier.at>before.tier.at?'SETTLEMENT RECLASSIFIED: '+after.tier.name.toUpperCase()+'.':label.toUpperCase()+' / +'+reconRaw(count-previous)+' PLACED. '+reconRaw(count)+' CONFIRMED.'),180);
    const pending=reconPending.get(type);
    const heard=reconCue(bloom?'reconBloom':strong?'reconTier':'reconPlace',true);
    reconPending.set(type,{at:Date.now(),first:previous===0 || pending?.first===true,strong:strong || pending?.strong===true,bloom:bloom || pending?.bloom===true,heard:heard || pending?.heard===true,plinth:Math.min(RECON_CIVIC_PLOTS.length-1,count-1)});
    reconLastAck={at:Date.now()};
    const echo=el('reconPurchaseEcho');if(echo){echo.style?.setProperty('--recon-ack-color',reconWorldColor());terminalTypeText(echo,'> RECON / '+label.toUpperCase()+' +'+reconRaw(count-previous)+' / '+(strong?'TIER CONFIRMED.':reconRaw(count)+' CONFIRMED.'),160);reconEcho();if(canPlayVfx() && reconInteractionAllowed())animateVfx(echo,[{opacity:.35},{opacity:1}],{duration:350});}
    renderReconMap();
}
function initReconMap() {
    if(reconInitialized || !el('reconMap'))return;reconInitialized=true;
    el('reconMap').addEventListener('toggle',renderReconMap);
    for(const event of ['click','keydown'])el('reconMap').querySelector?.('summary')?.addEventListener(event,armReconAudio);
    for(const event of ['animationstart','animationiteration'])el('reconTerrain').addEventListener(event,event=>{if(event.animationName==='reconSweep')scheduleReconSweep(event.target);});
    el('reconManualButton').addEventListener('click',()=>{if(reconInteractionAllowed())openZoneHelp('zones',true,1);});
    el('reconBuildButton').addEventListener('click',()=>{if(!reconInteractionAllowed())return;document.querySelector('.stage-tab[data-stage="1"]')?.click();switchGameMode('upgrades');setPurchaseView('buildings');el('reconMap').scrollIntoView({behavior:canPlayVfx()?'smooth':'auto',block:'start'});});
    for(const id of ['reconTerrain','reconInventory'])for(const eventName of ['click','keydown'])el(id).addEventListener(eventName,event=>{
        if(eventName==='keydown' && !['Enter',' '].includes(event.key))return;
        // Inventory uses native buttons; let their keyboard-generated click handle it once.
        if(eventName==='keydown' && id==='reconInventory')return;
        const target=event.target?.closest?.('[data-recon-sector],[data-recon-nav]');if(!target)return;
        event.preventDefault();armReconAudio();reconNavigate(target.dataset.reconSector || target.dataset.reconNav);
    });
    el('reconProjection')?.addEventListener('pointermove',reconHover);el('reconProjection')?.addEventListener('pointerleave',reconResetHover);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearReconMapPresentation();else renderReconMap();});
    window.addEventListener('scroll',renderReconMap,{passive:true});
    window.addEventListener('pagehide',()=>clearReconMapPresentation());
    // Cancel the brief tilt immediately if a native dialog/settings opens mid-glitch.
    if(window.MutationObserver){const observer=new window.MutationObserver(()=>renderReconMap());for(const node of document.querySelectorAll('dialog,#playerSettings'))observer.observe(node,{attributes:true,attributeFilter:['open']});}
}
