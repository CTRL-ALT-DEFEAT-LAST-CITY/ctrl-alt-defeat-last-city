// Permanent capped collections; every station and research purchase uses Salvage.
const GLYPH_TIERS = [
    {name:"Common",weight:60,color:"#b4c6db"}, {name:"Uncommon",weight:26,color:"#8ee0b1"},
    {name:"Rare",weight:10,color:"#8dc9ff"}, {name:"Epic",weight:3.5,color:"#c4a5ff"}, {name:"Legendary",weight:.5,color:"#ffcf7c"}
];
const GLYPH_ZONES = {
    1:{name:"Ember",stage:1,cost:100,color:"#ffc778",unlock:"Build a Scavenger Camp",names:["Cinder","Spark","Ash","Flame","Kindle","Coal","Blaze","Pyre","Phoenix","Dawn"]},
    2:{name:"Verdant",stage:2,cost:2500,color:"#83dfac",unlock:"Restore the beacon and open the Depot",names:["Dew","Moss","Vine","Fern","Bloom","Grove","Canopy","Ancient","Heartwood","Renewal"]},
    3:{name:"Forge",stage:3,cost:25000,color:"#ffaf79",unlock:"Recover the keys and open the Foundry",names:["Bolt","Copper","Gear","Steam","Alloy","Furnace","Titanium","Crucible","Colossus","Lifeforge"]},
    4:{name:"Prism",stage:4,cost:120000,color:"#8fdcf7",unlock:"Deliver 18 engines and open the Relay",names:["Signal","Pixel","Pulse","Charge","Spectrum","Photon","Lattice","Quantum","Aurora","Nexus"]},
    5:{name:"Astral",stage:5,cost:750000,color:"#cbb0ff",unlock:"Collect energy and restore all Relay Towers",names:["Stardust","Moon","Comet","Orbit","Nebula","Nova","Eclipse","Celestial","Supernova","Cosmos"]},
    6:{name:"Legacy",stage:5,cost:5000000,color:"#f8d892",unlock:"Defeat the Citadel Guardian",names:["Memory","Echo","Archive","Promise","Heritage","Continuum","Eternity","Genesis","Infinity","Last Light"]}
};
const GLYPH_CAPS=[100,50,30,20,10,6,4,3,2,1];
const GLYPH_FAMILY_CAPS = {
    1: GLYPH_CAPS,
    2: [200,100,60,40,16,10,6,4,2,1],
    3: [400,200,120,80,24,14,8,5,3,1],
    4: [1000,500,300,180,40,24,12,8,4,2],
    5: [2500,1250,750,400,80,50,25,15,8,3],
    6: [8000,4000,2400,600,80,50,40,25,10,3]
};
const GLYPH_SYMBOLS=["◇","△","◈","⌁","✳","⟐","✵","✶","✺","✧"];
const GLYPH_UPGRADES={
    more:{name:"More Glyphs",max:24,cost:300,growth:1.48,description:"One extra glyph per batch. Up to 25 glyphs for one roll fee."},
    speed:{name:"Faster Rolls",max:9,cost:450,growth:1.8,description:"15% shorter roll intervals per level, for manual and automatic batches. Faster rolling spends Salvage faster."},
    luck:{name:"Glyph Luck",max:40,cost:180,growth:1.5,description:"×1.12 permanent Luck per level, helping every family find rarer glyphs."}
};
const glyphDefinitionCache = new Map();
let glyphAuto=null,glyphManualReadyAt=0,glyphMessage="Auto-roll is off. All collected buffs are permanent.",glyphUIReady=false;
function glyphDefinitions(family) {
    if (glyphDefinitionCache.has(family)) return glyphDefinitionCache.get(family);
    const def=GLYPH_ZONES[family],strength=[0,1,1.35,1.8,2.4,3.2,4.5][family],local=def.stage===1?2:def.stage;
    const definitions = def.names.map((name,index)=>{
        const buffs={},add=(key,maximum)=>{buffs[key]=1+(maximum-1)*strength;};
        if(index<2)add(1,2.5);
        if(index===2)add(local,3);
        if(index===3)add(local,2.5);
        if(index===4)add("luck",1.6);
        if(index===5)add(1,2);
        if(index===6)add(local,2);
        if(index===7)add("luck",1.5);
        if(index===8)add(1,3);
        if(index===9){add(1,1.5);add(local,1.5);add("luck",1.5);if(family>=3)add(def.stage-1,1.5);if(family===6)for(let stage=2;stage<=5;stage++)add(stage,1.5);}
        return {name,tier:Math.floor(index/2),cap:GLYPH_FAMILY_CAPS[family][index],symbol:GLYPH_SYMBOLS[index],buffs};
    });
    glyphDefinitionCache.set(family, definitions);
    return definitions;
}
function normalizeGlyphs(saved={}) {
    const number=(value,max=1e12)=>Number.isSafeInteger(value)&&value>=0?Math.min(value,max):0;
    const modern=saved?.version===3,zones={},research={more:0,speed:0,luck:0},legacyBuffs={...(modern?saved.legacyBuffs:{})};
    for(let family=1;family<=6;family++){
        const s=saved?.zones?.[family]||{},counts=glyphDefinitions(family).map((glyph,i)=>number(modern?s.counts?.[i]:i%2===0?s.counts?.[i/2]:0,glyph.cap));
        zones[family]={counts,rolls:number(s.rolls),rareMisses:number(s.rareMisses,11),epicMisses:number(s.epicMisses,39),
            lastTier:Number.isInteger(s.lastTier)&&s.lastTier>=0&&s.lastTier<5?s.lastTier:-1,
            lastGlyph:Number.isInteger(s.lastGlyph)&&s.lastGlyph>=0&&s.lastGlyph<10?s.lastGlyph:-1};
        if(!modern&&family<=5){
            // Preserve already-paid strongest-glyph/Resonance/mastery power as a floor.
            const best=[4,3,2,1,0].find(tier=>number(s.counts?.[tier])>0);
            if(best!==undefined){const mastery=Math.min(20,Math.floor(Math.log(1+number(s.essence)/20)/Math.log(1.5)));
                legacyBuffs[family]=1+[.08,.18,.32,.52,.8][best]*(1+number(s.resonance,10)*.03+mastery*.01);
                legacyBuffs.luck=(legacyBuffs.luck||1)+[.02,.06,.12,.22,.4][best];}
            research.more=Math.max(research.more,number(s.more,24));research.speed=Math.max(research.speed,number(s.speed,9));research.luck=Math.min(40,research.luck+number(s.luck,20));
        }
    }
    for(const key of Object.keys(GLYPH_UPGRADES))if(modern)research[key]=number(saved.research?.[key],GLYPH_UPGRADES[key].max);
    for(const key of Object.keys(legacyBuffs))if(!["1","2","3","4","5","luck"].includes(key)||!Number.isFinite(legacyBuffs[key])||legacyBuffs[key]<1)delete legacyBuffs[key];
    return {version:3,zones,research,legacyBuffs,selected:Number.isInteger(saved.selected)&&GLYPH_ZONES[saved.selected]?saved.selected:1,view:saved.view==='collection'?'collection':'roll',reserve:[0,2,5].includes(saved?.reserve)?saved.reserve:2};
}
function glyphUnlocked(family){const def=GLYPH_ZONES[family];if(!def)return false;if(family===6)return !!game.adventure.bossDefeated;
    return isZoneUnlocked(def.stage)&&(family!==1||game.buildings.scavenger>0||!!game.achievements.firstCamp||game.rebirths>0||game.stage2Unlocked);}
function bestGlyphTier(family){const counts=game.glyphs.zones[family]?.counts||[];for(let i=9;i>=0;i--)if(counts[i]>0)return Math.floor(i/2);return -1;}
function glyphCollectionComplete(family){return glyphDefinitions(family).every((glyph,i)=>game.glyphs.zones[family].counts[i]>=glyph.cap);}
function glyphBuffValue(glyph,count,key){return 1+((glyph.buffs[key]||1)-1)*Math.min(glyph.cap,Math.max(0,count))/glyph.cap;}
function glyphCollectionMultiplier(key){let multiplier=1;for(let family=1;family<=6;family++)glyphDefinitions(family).forEach((glyph,i)=>{multiplier*=glyphBuffValue(glyph,game.glyphs.zones[family].counts[i],key);});
    return Math.min(1e100,Math.max(multiplier,game.glyphs.legacyBuffs[key]||1));}
function getGlyphLuck(){return Math.min(1e100,glyphCollectionMultiplier("luck")*Math.pow(1.12,game.glyphs.research.luck));}
function getGlyphMultiplier(stage){return glyphCollectionMultiplier(stage);}
function glyphCount(){return 1+game.glyphs.research.more;}
function formatGlyphMultiplier(value) { return value < 1000 ? value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : formatNumber(value); }
function glyphProgressMarkup(count, cap) {
    const percent = Math.floor(Math.min(1,count/cap)*100), status = count >= cap ? 'Collection capped' : percent + '% collected';
    return '<span class="purchase-progress"><span class="purchase-track" role="progressbar" aria-label="Glyph collection" aria-valuemin="0" aria-valuemax="' + cap + '" aria-valuenow="' + count + '" aria-valuetext="' + count + '/' + cap + ' collected" style="--purchase-progress:' + percent + '%"><span></span></span><span class="purchase-status">' + status + '</span></span>';
}
function glyphInterval(){return Math.max(1000,Math.round(5000*Math.pow(.85,game.glyphs.research.speed)));}
function glyphOdds(family){const s=game.glyphs.zones[family],definitions=glyphDefinitions(family),minimum=s.epicMisses>=39?3:s.rareMisses>=11?2:0;
    // Diminishing odds scaling keeps rare discoveries exciting at high Luck.
    const effectiveLuck=1+Math.log2(getGlyphLuck()),exponents=[0,.2,.45,.7,1];
    const raw=definitions.map((glyph,i)=>s.counts[i]>=glyph.cap?0:GLYPH_TIERS[glyph.tier].weight/2*Math.pow(effectiveLuck,exponents[glyph.tier]));
    const guaranteed=raw.map((weight,i)=>definitions[i].tier<minimum?0:weight),weights=guaranteed.some(weight=>weight>0)?guaranteed:raw,sum=weights.reduce((a,b)=>a+b,0);
    return weights.map(weight=>sum?weight/sum:0);}
function glyphUpgradeCost(family,key){const def=GLYPH_UPGRADES[key];return def?Math.ceil(def.cost*Math.pow(def.growth,game.glyphs.research[key])):Infinity;}
function glyphMenuInteractionAllowed(){return gameStarted&&currentGameMode==="glyphs"&&game.glyphs.view==='roll'&&!document.hidden&&!window.LastCityCloud?.isSwitching?.()
    &&!el("introModal")?.open&&!el("accountModal")?.open&&!el("loreModal")?.open&&!el("hatchModal")?.open&&!el("petMergeModal")?.open&&!game.showOfflineModal&&!document.querySelector(".offline-modal");}
function glyphInteractionAllowed(family){return glyphMenuInteractionAllowed()&&game.glyphs.selected===family&&glyphUnlocked(family);}
function glyphResearchUnlocked(){return Object.keys(GLYPH_ZONES).some(family=>glyphUnlocked(Number(family)));}
function rollGlyph(family,automatic=false){
    if(!glyphInteractionAllowed(family))return false;
    if(glyphCollectionComplete(family)){stopGlyphAuto("Collection complete! Every buff is permanent. Choose another family.");return false;}
    const def=GLYPH_ZONES[family],cost=def.cost,reserve=automatic?game.glyphs.reserve*cost:0;
    if(!Number.isFinite(game.salvage)||game.salvage<cost+reserve){if(automatic)stopGlyphAuto("Auto-roll stopped to protect your Salvage reserve.");else{glyphMessage="Need "+formatNumber(cost)+" Salvage to roll.";renderGlyphs();}return false;}
    if(!automatic&&Date.now()<glyphManualReadyAt)return false;
    const s=game.glyphs.zones[family],definitions=glyphDefinitions(family);let highest=0,discoveries=0,draws=0,lastGlyph=0;
    game.salvage-=cost;
    for(let draw=0;draw<glyphCount()&&!glyphCollectionComplete(family);draw++){
        const odds=glyphOdds(family);let random=Math.random(),index=0;
        for(let i=odds.length-1;i>=0;i--)if(odds[i]>0){index=i;break;}
        for(let i=0;i<odds.length;i++){random-=odds[i];if(random<0&&odds[i]>0){index=i;break;}}
        const glyph=definitions[index];if(!s.counts[index])discoveries++;
        s.counts[index]++;draws++;lastGlyph=index;highest=Math.max(highest,glyph.tier);
        s.rareMisses=glyph.tier>=2?0:Math.min(11,s.rareMisses+1);s.epicMisses=glyph.tier>=3?0:Math.min(39,s.epicMisses+1);
    }
    s.rolls++;s.lastTier=highest;s.lastGlyph=lastGlyph;
    glyphManualReadyAt=Date.now()+glyphInterval();
    glyphMessage="+"+draws+" permanent glyph"+(draws===1?"":"s")+" · "+definitions[lastGlyph].name+(discoveries?" · "+discoveries+" new "+(discoveries===1?"discovery":"discoveries"):"")+(glyphCollectionComplete(family)?" · COLLECTION COMPLETE":" · all collected buffs active");
    if(glyphCollectionComplete(family)) { glyphAuto=null; celebrateEvent('achievement',def.name+' collection complete','Every glyph is at its cap. Your buffs stay active forever.','✧'); }
    updateGame();saveGame(false);playSfx(highest>=3?"critical":"build");const result=el("glyphResult");
    animateVfx(result,[{opacity:.5,transform:"scale(.96)"},{opacity:1,transform:"scale(1)"}],{duration:350});if(discoveries)pulseVfx(result,GLYPH_TIERS[highest].color);return highest;
}
function buyGlyphUpgrade(family,key){const def=GLYPH_UPGRADES[key];if(!def||!GLYPH_ZONES[family]||game.glyphs.selected!==family||!glyphMenuInteractionAllowed()||!glyphResearchUnlocked())return false;
    const s=game.glyphs.research,cost=glyphUpgradeCost(family,key);if(s[key]>=def.max||!Number.isFinite(game.salvage)||game.salvage<cost)return false;
    game.salvage-=cost;s[key]++;glyphMessage=def.name+" upgraded globally to level "+s[key]+". Kept through every renewal.";
    glyphManualReadyAt=Math.min(glyphManualReadyAt,Date.now()+glyphInterval());
    if(glyphAuto)glyphAuto.nextAt=Date.now()+glyphInterval();celebrateUpgrade();updateGame();saveGame(false);return true;}
function stopGlyphAuto(message="Auto-roll stopped. Every collected buff is safe."){glyphAuto=null;glyphMessage=message;renderGlyphs();}
function startGlyphAuto(family){if(glyphAuto||!glyphInteractionAllowed(family)||glyphCollectionComplete(family))return false;
    if(game.salvage<GLYPH_ZONES[family].cost*(1+game.glyphs.reserve)){glyphMessage="Need one roll fee plus your selected Salvage reserve.";renderGlyphs();return false;}
    glyphAuto={stage:family,zoneView:currentStageView,nextAt:Date.now()+glyphInterval()};glyphMessage="Auto-roll active. Collecting permanent buffs; leave this tab to stop spending.";renderGlyphs();return true;}
function checkGlyphAutoContext(){if(glyphAuto&&(!glyphInteractionAllowed(glyphAuto.stage)||glyphAuto.zoneView!==currentStageView))stopGlyphAuto("Auto-roll stopped: station, tab, visibility, or account changed.");}
function tickGlyphAuto(now=Date.now()){checkGlyphAutoContext();if(!glyphAuto){
    if(glyphManualReadyAt&&now>=glyphManualReadyAt){glyphManualReadyAt=0;renderGlyphs();}
    else if(currentGameMode==='glyphs'&&glyphManualReadyAt&&el('glyphCountdown')){
        const message='Roll ready in '+Math.ceil((glyphManualReadyAt-now)/1000)+'s';
        el('glyphCountdown').textContent=message;
        const button=el('glyphPanel')?.querySelector('[data-glyph-action="roll"]');
        if(button&&!glyphCollectionComplete(game.glyphs.selected))button.textContent=message;
    }
    return;
}
    if(now>=glyphAuto.nextAt){glyphAuto.nextAt=now+glyphInterval();rollGlyph(glyphAuto.stage,true);}
    if(glyphAuto&&el("glyphCountdown"))el("glyphCountdown").textContent="Next roll in "+Math.max(1,Math.ceil((glyphAuto.nextAt-now)/1000))+"s";}
function glyphBuffMarkup(glyph,count){return Object.entries(glyph.buffs).map(([key,maximum])=>'<span>'+(key==="luck"?"Luck":ZONES[key].label)+' <strong>×'+formatGlyphMultiplier(glyphBuffValue(glyph,count,key))+'</strong><small> / ×'+formatGlyphMultiplier(maximum)+' at cap</small></span>').join("");}
function renderGlyphs(){
    const panel=el("glyphPanel");if(!panel||currentGameMode!=="glyphs")return;
    panel.dataset.glyphView=game.glyphs.view;
    const family=game.glyphs.selected,def=GLYPH_ZONES[family],s=game.glyphs.zones[family],research=game.glyphs.research;
    const unlocked=glyphUnlocked(family),complete=glyphCollectionComplete(family),definitions=glyphDefinitions(family),odds=glyphOdds(family),last=definitions[s.lastGlyph];
    const navigation='<nav class="glyph-family-tabs" aria-label="Glyph families">'+Object.entries(GLYPH_ZONES).map(([id,station])=>'<button data-glyph-family="'+id+'" aria-pressed="'+(Number(id)===family)+'" style="--family-color:'+station.color+'"><span>'+(glyphUnlocked(Number(id))?"✧":"🔒")+'</span><strong>'+station.name+'</strong><small>'+formatNumber(station.cost)+' Salvage / roll</small></button>').join("")+'</nav>';
    const totals='<div class="glyph-total-buffs" aria-label="Permanent glyph bonuses">'+[1,2,3,4,5,"luck"].map(key=>'<span>'+(key==="luck"?"Luck":ZONES[key].label)+'<strong>×'+formatGlyphMultiplier(key==="luck"?getGlyphLuck():getGlyphMultiplier(key))+'</strong></span>').join("")+'</div>';
    const heading='<div class="glyph-heading"><div><p class="eyebrow">CITY ARCHIVES · PERMANENT POWER</p><h2>Glyph Collections</h2><p>Collect → strengthen every layer → earn Salvage → improve your rolls. All buffs survive rebirth.</p></div><span class="glyph-permanent">✓ Always active · no equip slots</span></div>'+totals+navigation;
    const consoleMarkup=unlocked?'<article class="glyph-console"><div id="glyphResult" class="glyph-result" style="--glyph-color:'+def.color+'"><span class="glyph-sigil" aria-hidden="true">'+(last?.symbol||"✧")+'</span><small>'+(last?"LAST ROLL · "+GLYPH_TIERS[last.tier].name:"READY TO DISCOVER")+'</small><h3>'+def.name+' Archive</h3><p>'+s.counts.filter(count=>count>0).length+'/10 discovered · '+s.counts.reduce((a,b)=>a+b,0)+'/'+definitions.reduce((sum,glyph)=>sum+glyph.cap,0)+' collected</p></div>'
        +'<p id="glyphMessage" class="glyph-message" role="status" aria-live="polite">'+glyphMessage+'</p><div class="glyph-roll-controls"><button data-glyph-action="roll" '+(game.salvage<def.cost||complete||Date.now()<glyphManualReadyAt?"disabled":"")+'>'+(complete?"Collection complete":Date.now()<glyphManualReadyAt?"Roll ready in "+Math.ceil((glyphManualReadyAt-Date.now())/1000)+"s":"Roll "+glyphCount()+' glyph(s) · '+formatNumber(def.cost)+' Salvage')+'</button><button data-glyph-action="auto" aria-pressed="'+!!glyphAuto+'" '+(complete?"disabled":"")+'>'+(glyphAuto?"■ Stop auto-roll":"▶ Start auto-roll")+'</button></div>'
        +'<p id="glyphCountdown" class="glyph-countdown">'+(glyphAuto?"Next roll in "+Math.max(1,Math.ceil((glyphAuto.nextAt-Date.now())/1000))+"s":"One batch every "+(glyphInterval()/1000).toFixed(2)+"s when enabled")+'</p><fieldset class="glyph-reserve"><legend>Auto-roll Salvage reserve</legend>'+[0,2,5].map(value=>'<button data-glyph-reserve="'+value+'" aria-pressed="'+(value===game.glyphs.reserve)+'">'+(value?"Keep "+formatNumber(value*def.cost):"No reserve")+'</button>').join("")+'</fieldset><p class="glyph-help">Only rolls on this visible tab. Stops on low funds, completed collections, dialogs, navigation or save changes. No offline spending. Capped glyphs leave the pool, so every draw adds progress.</p></article>'
        :'<article class="glyph-locked"><span class="glyph-sigil">🔒</span><h3>'+def.name+' Archive</h3><p>'+def.unlock+' to unlock this family. The roll fee stays '+formatNumber(def.cost)+' Salvage.</p><button data-glyph-action="play">Continue your zone objective</button></article>';
    const board='<aside class="glyph-research"><p class="eyebrow">ONE BOARD · EVERY FAMILY</p><h3>Glyph upgrades</h3><p>All purchases use core Salvage and are permanent.</p>'+Object.entries(GLYPH_UPGRADES).map(([key,upgrade])=>{
        const cost=glyphUpgradeCost(family,key),maxed=research[key]>=upgrade.max;
        const benefit=maxed?"Fully upgraded":key==="more"?glyphCount()+" → "+(glyphCount()+1)+" glyphs / batch":key==="speed"?(glyphInterval()/1000).toFixed(2)+"s → "+(Math.max(1000,Math.round(5000*Math.pow(.85,research.speed+1)))/1000).toFixed(2)+"s / batch":"Luck ×"+formatGlyphMultiplier(getGlyphLuck())+" → ×"+formatGlyphMultiplier(getGlyphLuck()*1.12);
        return '<article class="glyph-upgrade"><div><h4>'+upgrade.name+'</h4><small>'+research[key]+'/'+upgrade.max+'</small></div><p>'+upgrade.description+'</p><div class="upgrade-effect">'+benefit+'</div><div id="glyphFunding-'+key+'">'+purchaseProgressMarkup(game.salvage,cost,maxed)+'</div><button data-glyph-upgrade="'+key+'" '+(!glyphResearchUnlocked()||maxed||game.salvage<cost?"disabled":"")+'>'+(maxed?"MAX":"Purchase · "+formatNumber(cost)+" Salvage")+'</button></article>';
    }).join("")+'</aside>';
    const collection='<section class="glyph-collection"><div><h3>'+def.name+' collection · permanent</h3><p>Every copy contributes until its cap. Buffs multiply across collections. Current bonuses and cap bonuses are shown separately.</p></div><div class="glyph-grid">'+definitions.map((glyph,i)=>'<article class="glyph-tier '+(s.counts[i]?"discovered":"undiscovered")+'" style="--glyph-color:'+GLYPH_TIERS[glyph.tier].color+'"><span class="glyph-mini" aria-hidden="true">'+glyph.symbol+'</span><small>'+GLYPH_TIERS[glyph.tier].name+'</small><h4>'+glyph.name+' Glyph</h4><div class="glyph-buffs">'+glyphBuffMarkup(glyph,s.counts[i])+'</div><strong>'+s.counts[i]+'/'+glyph.cap+(s.counts[i]>=glyph.cap?" · MAX":" collected")+'</strong>'+glyphProgressMarkup(s.counts[i],glyph.cap)+'<span>Next draw: '+(unlocked?(odds[i]*100).toFixed(2)+"%":"Station locked")+'</span></article>').join("")+'</div><p class="glyph-help">'+formatNumber(s.rolls)+' paid batches · Rare+ by 12 draws, Epic+ by 40 while those tiers have space. Odds include Luck, caps and guarantees.</p></section>';
    const signature=JSON.stringify([family,s,research,unlocked,Object.keys(GLYPH_ZONES).map(id=>glyphUnlocked(Number(id))),game.glyphs.reserve,getGlyphLuck(),!!glyphAuto,glyphMessage,game.glyphs.view,Date.now()<glyphManualReadyAt,[1,2,3,4,5].map(getGlyphMultiplier),Object.keys(GLYPH_UPGRADES).map(key=>game.salvage>=glyphUpgradeCost(family,key)),game.salvage>=def.cost]);
    if(panel.dataset.renderSignature!==signature){
        const active=document.activeElement,focusKey=panel.contains?.(active)?active?.dataset?.glyphUpgrade||active?.dataset?.glyphAction||(active?.dataset?.glyphViewAction?"view-"+active.dataset.glyphViewAction:"")||(active?.dataset?.glyphReserve!==undefined?"reserve-"+active.dataset.glyphReserve:active?.dataset?.glyphFamily?"family-"+active.dataset.glyphFamily:""):"";
        panel.innerHTML=heading+'<nav class="glyph-view-tabs" aria-label="Glyph section"><button data-glyph-view-action="roll" aria-pressed="'+(game.glyphs.view==='roll')+'">Roll &amp; upgrades</button><button data-glyph-view-action="collection" aria-pressed="'+(game.glyphs.view==='collection')+'">Collection index</button></nav><div class="glyph-layout">'+consoleMarkup+board+'</div>'+collection;panel.dataset.renderSignature=signature;
        if(focusKey){const selector=focusKey.startsWith("view-")?'[data-glyph-view-action="'+focusKey.slice(5)+'"]':focusKey.startsWith("family-")?'[data-glyph-family="'+focusKey.slice(7)+'"]':focusKey.startsWith("reserve-")?'[data-glyph-reserve="'+focusKey.slice(8)+'"]':GLYPH_UPGRADES[focusKey]?'[data-glyph-upgrade="'+focusKey+'"]':'[data-glyph-action="'+focusKey+'"]';panel.querySelector(selector)?.focus?.({preventScroll:true});}
    }
    for(const [key,upgrade]of Object.entries(GLYPH_UPGRADES)){const funding=el("glyphFunding-"+key),markup=purchaseProgressMarkup(game.salvage,glyphUpgradeCost(family,key),research[key]>=upgrade.max);if(funding&&funding.innerHTML!==markup)funding.innerHTML=markup;}
}
function initGlyphUI(){if(glyphUIReady)return;glyphUIReady=true;
    el("glyphPanel")?.addEventListener("click",event=>{const button=event.target.closest?.("button");if(!button||button.disabled||!gameStarted||window.LastCityCloud?.isSwitching?.())return;
        const family=game.glyphs.selected;
        if(button.dataset.glyphViewAction){
            const view=button.dataset.glyphViewAction;if(!['roll','collection'].includes(view)||game.glyphs.view===view)return;
            if(glyphAuto)stopGlyphAuto('Auto-roll stopped while reviewing your collection.');
            game.glyphs.view=view;renderGlyphs();saveGame(false);
            el('glyphPanel')?.querySelector(view==='collection'?'.glyph-collection':'.glyph-layout')?.scrollIntoView?.({behavior:canPlayVfx()?'smooth':'auto',block:'start'});
            animateVfx(el('glyphPanel')?.querySelector(view==='collection'?'.glyph-collection':'.glyph-layout'),[{opacity:.5,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});
        }
        else if(button.dataset.glyphFamily){const id=Number(button.dataset.glyphFamily);if(!GLYPH_ZONES[id] || game.glyphs.selected===id)return;if(glyphAuto)stopGlyphAuto("Auto-roll stopped when changing families.");game.glyphs.selected=id;glyphMessage="All collected buffs are permanently active.";renderGlyphs();animateVfx(el('glyphResult'),[{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220});saveGame(false);}
        else if(button.dataset.glyphAction==="play")switchGameMode("city");
        else if(button.dataset.glyphAction==="roll"){if(glyphAuto)stopGlyphAuto();rollGlyph(family);}
        else if(button.dataset.glyphAction==="auto")glyphAuto?stopGlyphAuto():startGlyphAuto(family);
        else if(button.dataset.glyphUpgrade)buyGlyphUpgrade(family,button.dataset.glyphUpgrade);
        else if(button.dataset.glyphReserve!==undefined&&glyphInteractionAllowed(family)){const value=Number(button.dataset.glyphReserve);if(![0,2,5].includes(value))return;game.glyphs.reserve=value;renderGlyphs();saveGame(false);}
    });
    document.addEventListener?.("visibilitychange",checkGlyphAutoContext);setInterval(tickGlyphAuto,250);
}
