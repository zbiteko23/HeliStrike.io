// ═══════════════════════════════════════════════════════════════════════════════
//  DESERT STRIKE — game.js
// ═══════════════════════════════════════════════════════════════════════════════

const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const miniCvs = document.getElementById('minimap');
const miniCtx = miniCvs.getContext('2d');

let W = canvas.width  = window.innerWidth;
let H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

const socket = io();
let myId = null, mapWidth = 3200, mapHeight = 2200;
let gameState = null, myPlayer = null, bunkerData = [];
let mouseX = W/2, mouseY = H/2, worldMouseX = 0, worldMouseY = 0;
let shootCooldown = 0, shootHold = false;
let laserCooldown = 0;

// Mission state (client side)
let gameMode       = 'practice'; // 'practice' | 'mission'
let missionIndex   = 0;
let livesLeft      = 3;
let rocketsLeft    = 10;
let bombsLeft      = 3;
const MAX_ROCKETS  = 10;
const MAX_BOMBS    = 3;
const MAX_LIVES    = 3;

// Persistent data
let savedCoins    = parseInt(localStorage.getItem('coins') || '0');
let unlockedMissions = JSON.parse(localStorage.getItem('unlocked') || '[0]');
let selectedHeli  = localStorage.getItem('heliType') || 'standard';

const keys = { w:false, a:false, s:false, d:false };
let shopOpen = false;
const notifications = [];

// ─── HELICOPTER CATALOG ───────────────────────────────────────────────────────
const HELI_CATALOG = [
  {
    type:'standard', name:'UH-64 Eagle', emoji:'🚁',
    desc:'Vyvážená helikoptéra. Dobrá volba pro začátečníky.',
    price:0, color:'#40d060',
    speed:5, turnRate:0.06, maxHp:100, bulletDmg:1.0,
    special:null,
    stats:{ speed:3, dmg:3, hp:3, special:'-' }
  },
  {
    type:'fast', name:'SR-71 Ghost', emoji:'⚡',
    desc:'Extrémně rychlá, obratná. Slabší brnění, méně poškození.',
    price:1200, color:'#40c0ff',
    speed:9, turnRate:0.1, maxHp:65, bulletDmg:0.65,
    special:null,
    stats:{ speed:5, dmg:2, hp:2, special:'-' }
  },
  {
    type:'heavy', name:'AH-200 Titan', emoji:'💪',
    desc:'Pancéřová helikoptéra. Silné střely, hodně HP, ale pomalá.',
    price:2000, color:'#e08030',
    speed:3, turnRate:0.04, maxHp:180, bulletDmg:2.0,
    special:null,
    stats:{ speed:1, dmg:5, hp:5, special:'-' }
  },
  {
    type:'laser', name:'X-9 Lazarus', emoji:'🔮',
    desc:'Střílí laserový paprsek. Instantní zásah, neomezená kadence. Žádné normální střely.',
    price:3500, color:'#00ff88',
    speed:5.5, turnRate:0.07, maxHp:90, bulletDmg:0.4,
    special:'laser',
    stats:{ speed:3, dmg:4, hp:3, special:'Laser' }
  },
  {
    type:'stealth', name:'F-22 Shadow', emoji:'👁',
    desc:'Neviditelná pro NPC na dálku > 200px. Průměrné statistiky.',
    price:2800, color:'#8855cc',
    speed:6.5, turnRate:0.08, maxHp:85, bulletDmg:1.2,
    special:'stealth',
    stats:{ speed:4, dmg:3, hp:3, special:'Stealth' }
  },
  {
    type:'rocket', name:'BM-9 Hydra', emoji:'🚀',
    desc:'Bez normálních střel — místo toho střílí rakety každým klikem. Obrovský damage, pomalé dobíjení.',
    price:4000, color:'#ff4444',
    speed:4, turnRate:0.055, maxHp:110, bulletDmg:3.5,
    special:'rocketOnly',
    stats:{ speed:2, dmg:6, hp:4, special:'Rakety' }
  },
  {
    type:'medic', name:'HH-60 Angel', emoji:'❤',
    desc:'Postupně se léčí (+1 HP/s). Průměrné statistiky.',
    price:1800, color:'#ff8888',
    speed:5, turnRate:0.06, maxHp:120, bulletDmg:0.9,
    special:'regen',
    stats:{ speed:3, dmg:3, hp:4, special:'Regenerace' }
  },
  {
    type:'dual', name:'AH-2 Viper', emoji:'🔥',
    desc:'Střílí 2 kulky najednou do dvojitého spread patternu.',
    price:2500, color:'#ff8800',
    speed:4.5, turnRate:0.057, maxHp:100, bulletDmg:0.85,
    special:'dual',
    stats:{ speed:2, dmg:5, hp:3, special:'Dvojitá střelba' }
  }
];

// ─── MISSION DEFINITIONS ──────────────────────────────────────────────────────
const MISSIONS = [
  { id:0, name:'Poušť v plamenech',    desc:'Znič 3 bunkry a eliminuj 5 nepřátel.',       bunkReq:3,  killReq:5,  npcHp:40,  npcSpd:1.8, npcCnt:6,  boss:{name:'Pouštní Jestřáb', hp:300, spd:2.0, shootRate:70, spread:3, size:1.5, color:'#c04020'}, reward:500 },
  { id:1, name:'Písečná Bouře',         desc:'Eliminuj 10 vrtulníků a znič 5 bunkrů.',      bunkReq:5,  killReq:10, npcHp:50,  npcSpd:2.2, npcCnt:8,  boss:{name:'Generál Škorpión', hp:500, spd:2.4, shootRate:55, spread:3, size:1.8, color:'#802080'}, reward:900 },
  { id:2, name:'Záchrana základny',    desc:'8 bunkrů, 15 nepřátel.',                       bunkReq:8,  killReq:15, npcHp:65,  npcSpd:2.6, npcCnt:10, boss:{name:'Titanový Varan',   hp:700, spd:1.8, shootRate:45, spread:4, size:2.0, color:'#205080'}, reward:1400 },
  { id:3, name:'Útok na pevnost',      desc:'Prolomí pevnost. 12 bunkrů, 20 nepřátel.',     bunkReq:12, killReq:20, npcHp:80,  npcSpd:2.9, npcCnt:12, boss:{name:'Krvavý Orel',     hp:950, spd:2.8, shootRate:38, spread:5, size:2.2, color:'#802000'}, reward:2200 },
  { id:4, name:'Finální Armageddon',   desc:'Poslední bitva. Zničit vše. Přežít velitele.', bunkReq:16, killReq:30, npcHp:110, npcSpd:3.3, npcCnt:15, boss:{name:'VELITEL POUŠTĚ',  hp:1400, spd:3.0, shootRate:28, spread:6, size:2.8, color:'#300000'}, reward:4000 }
];

// ─── BUILD MISSION CARDS in HTML ──────────────────────────────────────────────
function buildMissionCards() {
  const panel = document.getElementById('missions-panel');
  panel.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const locked = !unlockedMissions.includes(i);
    const card = document.createElement('div');
    card.className = 'mission-card' + (locked ? ' locked' : '');
    card.innerHTML = `
      ${locked ? '<div class="mc-lock">🔒</div>' : ''}
      <div class="mc-num">0${i+1}</div>
      <div class="mc-name">${m.name}</div>
      <div class="mc-desc">${m.desc}</div>
      <div class="mc-lives">❤ Životy: 3 &nbsp;|&nbsp; 🚀 Rakety: 10 &nbsp;|&nbsp; 💣 Bomby: 3</div>
      <div class="mc-boss">Boss: ${m.boss.name}</div>
      <div class="mc-reward">💰 Odměna: ${m.reward} mincí</div>
      ${!locked ? `<button class="mc-start-btn" onclick="startMission(${i})">▶ SPUSTIT</button>` : '<div style="color:#4a3a1a;font-size:10px;margin-top:8px;">Dokonči předchozí misi</div>'}
    `;
    panel.appendChild(card);
  });
}

function showTab(tab) {
  document.getElementById('missions-panel').style.display = tab==='missions' ? 'flex' : 'none';
  document.getElementById('practice-panel').style.display = tab==='practice' ? 'block' : 'none';
  document.getElementById('tab-missions').classList.toggle('active', tab==='missions');
  document.getElementById('tab-practice').classList.toggle('active', tab==='practice');
}

function startMission(idx) {
  if (!unlockedMissions.includes(idx)) return;
  missionIndex = idx;
  gameMode = 'mission';
  livesLeft = MAX_LIVES;
  rocketsLeft = MAX_ROCKETS;
  bombsLeft = MAX_BOMBS;
  const name = document.getElementById('name-input').value.trim() || 'Pilot';
  document.getElementById('overlay').style.display = 'none';
  socket.emit('join', { name, heliType:selectedHeli, savedCoins, mode:'mission', missionIndex:idx });
  document.getElementById('mode-value').textContent = `MISE ${idx+1}`;
}

function startPractice() {
  gameMode = 'practice';
  livesLeft = 999;
  rocketsLeft = 999;
  bombsLeft = 999;
  const name = document.getElementById('name-input').value.trim() || 'Pilot';
  document.getElementById('overlay').style.display = 'none';
  socket.emit('join', { name, heliType:selectedHeli, savedCoins, mode:'practice', missionIndex:0 });
  document.getElementById('mode-value').textContent = 'TRÉNINK';
}

window.showTab = showTab;
window.startMission = startMission;
window.startPractice = startPractice;

// ─── DRAW HELPERS ─────────────────────────────────────────────────────────────
function drawHeli(cx, cy, angle, color, isPlayer, scale=1, special=null) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  if(special==='stealth' && !isPlayer) { ctx.globalAlpha=0.35; }
  if(special==='laser' && isPlayer) { ctx.shadowColor='#00ff88'; ctx.shadowBlur=18; }

  ctx.fillStyle='rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(3,5,22,8,0,0,Math.PI*2); ctx.fill();

  ctx.fillStyle=color;
  ctx.beginPath(); ctx.ellipse(0,0,22,10,0,0,Math.PI*2); ctx.fill();

  ctx.fillStyle=isPlayer?'rgba(120,220,255,0.75)':'rgba(80,180,210,0.5)';
  ctx.beginPath(); ctx.ellipse(8,-2,8,6,-0.3,0,Math.PI*2); ctx.fill();

  ctx.fillStyle=color;
  ctx.beginPath(); ctx.moveTo(-14,-3); ctx.lineTo(-32,-1); ctx.lineTo(-32,3); ctx.lineTo(-14,4); ctx.closePath(); ctx.fill();

  ctx.strokeStyle=isPlayer?'rgba(200,240,255,0.8)':'rgba(160,200,220,0.55)';
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-32,-7); ctx.lineTo(-32,9); ctx.stroke();

  const rot=(Date.now()/80)%(Math.PI*2);
  ctx.strokeStyle=isPlayer?'rgba(200,240,255,0.7)':'rgba(160,200,220,0.5)';
  ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(Math.cos(rot)*28,Math.sin(rot)*28); ctx.lineTo(Math.cos(rot+Math.PI)*28,Math.sin(rot+Math.PI)*28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Math.cos(rot+Math.PI/2)*28,Math.sin(rot+Math.PI/2)*28); ctx.lineTo(Math.cos(rot+1.5*Math.PI)*28,Math.sin(rot+1.5*Math.PI)*28); ctx.stroke();

  ctx.restore();
}

function drawBoss(bx, by, boss) {
  if(!boss||!boss.alive) return;
  const s=boss.size||1.5;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(boss.angle||0);
  ctx.shadowColor=boss.enraged?'#ff1100':'#ff6600';
  ctx.shadowBlur=boss.enraged?40:18;

  ctx.fillStyle=boss.enraged?'#8b0000':(boss.color||'#800000');
  ctx.beginPath(); ctx.ellipse(0,0,30*s,14*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,80,0,0.75)';
  ctx.beginPath(); ctx.ellipse(10*s,-3*s,10*s,8*s,-0.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=boss.color||'#800000';
  ctx.beginPath(); ctx.moveTo(-18*s,-4*s); ctx.lineTo(-44*s,-2*s); ctx.lineTo(-44*s,4*s); ctx.lineTo(-18*s,5*s); ctx.closePath(); ctx.fill();

  const rot=(Date.now()/55)%(Math.PI*2);
  ctx.strokeStyle=boss.enraged?'rgba(255,50,0,0.9)':'rgba(255,140,50,0.8)';
  ctx.lineWidth=3.5;
  for(let r=0;r<2;r++){const a=rot+r*Math.PI/2;ctx.beginPath();ctx.moveTo(Math.cos(a)*40*s,Math.sin(a)*40*s);ctx.lineTo(Math.cos(a+Math.PI)*40*s,Math.sin(a+Math.PI)*40*s);ctx.stroke();}

  ctx.restore(); ctx.shadowBlur=0;
}

function drawLaser(x1, y1, angle) {
  const len = 1200;
  const x2 = x1 + Math.cos(angle)*len, y2 = y1 + Math.sin(angle)*len;
  ctx.save();
  ctx.strokeStyle='rgba(0,255,120,0.9)';
  ctx.shadowColor='#00ff88'; ctx.shadowBlur=14;
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.6)';
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.restore();
}

function drawBunker(ctx,x,y,hp,maxHp,type,destroyed){
  ctx.save(); ctx.translate(x,y);
  if(destroyed){ctx.fillStyle='#5a4a2a';for(let i=0;i<5;i++)ctx.fillRect(-20+i*8+(i%2)*4,-8+(i%3)*5,6+i%3*2,5+i%2*3);ctx.restore();return;}
  const sz=type==='large'?38:26;
  ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(-sz/2+4,-sz/2+4,sz,sz);
  ctx.fillStyle='#7a6a3a'; ctx.fillRect(-sz/2,-sz/2,sz,sz);
  ctx.fillStyle='#5a4a20'; ctx.fillRect(-sz/4,-sz/4,sz/2,sz/2);
  ctx.strokeStyle='#4a3a18'; ctx.lineWidth=1.5; ctx.strokeRect(-sz/2,-sz/2,sz,sz);
  if(type==='large'){ctx.fillStyle='#8a7a3a';for(let i=0;i<4;i++){ctx.fillRect(-sz/2+i*10-1,-sz/2-4,8,5);ctx.fillRect(-sz/2+i*10-1,sz/2,8,5);}}
  const bw=sz+10,pct=hp/maxHp;
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(-bw/2,-sz/2-14,bw,6);
  ctx.fillStyle=pct>0.5?'#5fe85a':pct>0.25?'#f0c040':'#e85a5a'; ctx.fillRect(-bw/2,-sz/2-14,bw*pct,6);
  ctx.restore();
}

function drawBullet(x,y,isNPC,isLaser){
  ctx.save();
  if(isLaser){ctx.fillStyle='#00ff88';ctx.shadowColor='#00ff88';ctx.shadowBlur=8;}
  else{ctx.fillStyle=isNPC?'#ff5555':'#ffee66';ctx.shadowColor=isNPC?'#ff0000':'#ffcc00';ctx.shadowBlur=4;}
  ctx.beginPath(); ctx.arc(x,y,isLaser?4:3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawRocket(x,y,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.fillStyle='rgba(255,150,50,0.4)'; ctx.beginPath(); ctx.moveTo(-5,-2); ctx.lineTo(-16,0); ctx.lineTo(-5,2); ctx.fill();
  ctx.fillStyle='#ddd'; ctx.beginPath(); ctx.ellipse(0,0,9,3.5,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#e85a20'; ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(14,-2.5); ctx.lineTo(14,2.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBomb(x,y){
  ctx.save();
  ctx.shadowColor='#ff8800'; ctx.shadowBlur=6;
  ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ff8800'; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawExplosion(e){
  const t=1-e.life/e.maxLife, r=e.size==='huge'?90:e.size==='large'?50:e.size==='medium'?28:15;
  const alpha=(1-t)*0.9;
  ctx.save();
  ctx.globalAlpha=alpha*0.4; ctx.fillStyle='#ff8c00';
  ctx.beginPath(); ctx.arc(e.x,e.y,r*(0.5+t*1.2),0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=alpha; ctx.fillStyle=t<0.3?'#fff':t<0.6?'#ffee00':'#ff6600';
  ctx.beginPath(); ctx.arc(e.x,e.y,r*(1-t*0.8),0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ─── DESERT BACKGROUND ───────────────────────────────────────────────────────
const desertFeat = [];
function genDesert(){
  desertFeat.length=0;
  for(let i=0;i<130;i++) desertFeat.push({type:'rock',x:Math.random()*mapWidth,y:Math.random()*mapHeight,sz:4+Math.random()*12,a:Math.random()*Math.PI});
  for(let i=0;i<45;i++) desertFeat.push({type:'dune',x:Math.random()*mapWidth,y:Math.random()*mapHeight,w:60+Math.random()*150,h:18+Math.random()*40});
  for(let i=0;i<65;i++) desertFeat.push({type:'scrub',x:Math.random()*mapWidth,y:Math.random()*mapHeight,sz:4+Math.random()*9});
}

function drawDesert(camX,camY){
  ctx.fillStyle='#c8a850'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#b89030';
  for(let i=0;i<220;i++){const x=((i*137)%mapWidth-camX)%W,y=((i*241)%mapHeight-camY)%H;if(x>0&&x<W&&y>0&&y<H)ctx.fillRect(x,y,2,1);}
  for(const f of desertFeat){
    const sx=f.x-camX,sy=f.y-camY;
    if(sx<-200||sx>W+200||sy<-200||sy>H+200) continue;
    if(f.type==='dune'){ctx.fillStyle='rgba(180,140,50,0.35)';ctx.beginPath();ctx.ellipse(sx,sy,f.w,f.h,0,0,Math.PI*2);ctx.fill();}
    else if(f.type==='rock'){ctx.save();ctx.translate(sx,sy);ctx.rotate(f.a);ctx.fillStyle='#8a7040';ctx.beginPath();ctx.ellipse(0,0,f.sz,f.sz*0.7,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else{ctx.fillStyle='#6a8040';ctx.beginPath();ctx.arc(sx,sy,f.sz,0,Math.PI*2);ctx.fill();}
  }
  ctx.strokeStyle='#8a6020'; ctx.lineWidth=4; ctx.strokeRect(-camX,-camY,mapWidth,mapHeight);
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
function addNotif(msg,color='#f0c040',dur=4000){notifications.push({msg,color,t:Date.now(),dur});}
function drawNotifs(){
  const now=Date.now(); let y=H*0.34;
  for(let i=notifications.length-1;i>=0;i--){
    const n=notifications[i];
    const age=now-n.t, al=Math.min(1,(n.dur-age)/600);
    if(al<=0){notifications.splice(i,1);continue;}
    ctx.save(); ctx.globalAlpha=al;
    ctx.font='bold 22px Courier New'; ctx.textAlign='center';
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillText(n.msg,W/2+2,y+2);
    ctx.fillStyle=n.color; ctx.fillText(n.msg,W/2,y);
    ctx.restore(); y+=32;
  }
}

// ─── MISSION HUD ─────────────────────────────────────────────────────────────
function drawMissionHUD(){
  if(!gameState?.mission) return;
  const m=gameState.mission;
  const x=W-235, y=90;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';
  rr(x,y,222,140,8); ctx.fill();
  ctx.strokeStyle='#5a4a1a'; ctx.lineWidth=1; rr(x,y,222,140,8); ctx.stroke();
  ctx.fillStyle='#f0c040'; ctx.font='bold 12px Courier New'; ctx.textAlign='left';
  ctx.fillText(`${gameMode==='mission'?`MISE ${m.index+1}:`:'TRÉNINK:'} ${m.name}`,x+8,y+18);
  ctx.fillStyle='#8a7a5a'; ctx.font='10px Courier New';

  // objectives
  ctx.fillStyle='#e8d49a'; ctx.font='12px Courier New';
  ctx.fillText(`Zabití: ${m.totalKills}/${m.killsRequired}`,x+8,y+40);
  ctx.fillText(`Bunkry: ${m.destroyedBunkers}/${m.bunkersRequired}`,x+8,y+56);
  pbar(x+8,y+65,206,7,m.totalKills/m.killsRequired,'#e85a5a');
  pbar(x+8,y+76,206,7,m.destroyedBunkers/m.bunkersRequired,'#f0c040');

  if(m.phase==='bossPhase'){
    ctx.fillStyle='#ff5533'; ctx.font='bold 13px Courier New';
    ctx.fillText('⚠ BOSS AKTIVNÍ!',x+8,y+104);
  } else {
    const done=m.totalKills>=m.killsRequired&&m.destroyedBunkers>=m.bunkersRequired;
    ctx.fillStyle=done?'#5fe85a':'#6a5a3a'; ctx.font='11px Courier New';
    ctx.fillText(done?'✔ Boss přichází...':'Splň cíle mise!',x+8,y+104);
  }
  if(gameMode==='mission'){
    ctx.fillStyle='#ff8844'; ctx.font='11px Courier New';
    ctx.fillText(`❤ Životy: ${livesLeft}/${MAX_LIVES}`,x+8,y+122);
  }
  ctx.restore();
}

function drawBossBar(){
  if(!gameState?.boss?.alive) return;
  const boss=gameState.boss;
  const bw=480, bh=26, bx=(W-bw)/2, by=H-68;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.75)'; rr(bx-6,by-6,bw+12,bh+20,7); ctx.fill();
  const pct=boss.hp/boss.maxHp;
  ctx.fillStyle=boss.enraged?`rgba(255,${Math.floor(30+pct*60)},0,1)`:'#cc4400';
  ctx.fillRect(bx,by,bw*pct,bh);
  ctx.strokeStyle=boss.enraged?'#ff3300':'#882200'; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#fff'; ctx.font='bold 13px Courier New'; ctx.textAlign='center';
  ctx.fillText((boss.enraged?'🔥 ':'☠ ')+boss.name+`  ${boss.hp}/${boss.maxHp}`, W/2, by+19);
  ctx.restore();
}

function pbar(x,y,w,h,pct,color){ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(x,y,w,h);ctx.fillStyle=color;ctx.fillRect(x,y,w*Math.min(1,Math.max(0,pct)),h);}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

// ─── SHOP ────────────────────────────────────────────────────────────────────
function drawShop(){
  const sw=Math.min(W-40,1000), sh=Math.min(H-40,600);
  const sx=(W-sw)/2, sy=(H-sh)/2;
  ctx.save();
  ctx.fillStyle='rgba(5,4,1,0.96)'; rr(sx,sy,sw,sh,14); ctx.fill();
  ctx.strokeStyle='#f0c040'; ctx.lineWidth=2; rr(sx,sy,sw,sh,14); ctx.stroke();

  ctx.fillStyle='#f0c040'; ctx.font='bold 22px Courier New'; ctx.textAlign='center';
  ctx.fillText('🛒 OBCHOD S HELIKOPTÉRAMI', W/2, sy+36);
  const coins=myPlayer?myPlayer.coins:savedCoins;
  ctx.fillStyle='#ffe060'; ctx.font='15px Courier New';
  ctx.fillText(`💰 Tvoje mince: ${coins}`, W/2, sy+58);
  ctx.fillStyle='#5a4a2a'; ctx.font='11px Courier New';
  ctx.fillText('Tab = zavřít  |  Klikni na helikoptéru pro nákup / výběr', W/2, sy+sh-14);

  const cols=4, rows=2;
  const cw=(sw-40)/cols, ch=(sh-110)/rows;

  HELI_CATALOG.forEach((h,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const hx=sx+20+col*cw, hy=sy+75+row*ch;
    const hw=cw-10, hh=ch-10;
    const owned=h.price===0||(localStorage.getItem('owned_'+h.type)==='1');
    const active=myPlayer?myPlayer.heliType===h.type:selectedHeli===h.type;
    const canBuy=coins>=h.price;

    ctx.fillStyle=active?'rgba(64,208,96,0.15)':owned?'rgba(240,192,64,0.07)':'rgba(255,255,255,0.04)';
    rr(hx,hy,hw,hh,8); ctx.fill();
    ctx.strokeStyle=active?'#40d060':owned?'#f0c040':'#3a2a0a'; ctx.lineWidth=1.5;
    rr(hx,hy,hw,hh,8); ctx.stroke();

    // Mini heli
    drawHeli(hx+hw/2, hy+38, 0, h.color, false, 0.75, h.special);

    ctx.fillStyle=h.color; ctx.font=`bold 12px Courier New`; ctx.textAlign='center';
    ctx.fillText(`${h.emoji} ${h.name}`, hx+hw/2, hy+72);
    ctx.fillStyle='#7a6a4a'; ctx.font='9px Courier New';
    // Wrap desc
    const words=h.desc.split(' ');
    let line='', ly=hy+84;
    for(const w of words){
      const test=line+w+' ';
      if(ctx.measureText(test).width>hw-12&&line){ctx.fillText(line.trim(),hx+hw/2,ly);line=w+' ';ly+=12;}
      else line=test;
    }
    if(line) ctx.fillText(line.trim(),hx+hw/2,ly);

    // Stats
    ctx.fillStyle='#8a7a5a'; ctx.font='10px Courier New'; ctx.textAlign='left';
    const sty=hy+hh-56;
    ctx.fillText(`Spd:${h.stats.speed>0?'●'.repeat(h.stats.speed)+'○'.repeat(5-h.stats.speed):'?'}`,hx+8,sty);
    ctx.fillText(`Dmg:${h.stats.dmg>0?'●'.repeat(h.stats.dmg)+'○'.repeat(6-h.stats.dmg):'?'}`,hx+8,sty+13);
    ctx.fillText(`HP: ${h.stats.hp>0?'●'.repeat(h.stats.hp)+'○'.repeat(5-h.stats.hp):'?'}`,hx+8,sty+26);
    if(h.stats.special!=='-'){ctx.fillStyle='#00ff88';ctx.fillText(`★ ${h.stats.special}`,hx+8,sty+39);}

    ctx.textAlign='center';
    if(h.price===0||owned){
      ctx.fillStyle=active?'#5fe85a':'#f0c040';
      ctx.font='bold 11px Courier New';
      ctx.fillText(active?'✔ AKTIVNÍ':'▶ POUŽÍT',hx+hw/2,hy+hh-10);
    } else {
      ctx.fillStyle=canBuy?'#f0c040':'#e85a5a';
      ctx.font='bold 12px Courier New';
      ctx.fillText(`💰 ${h.price}`,hx+hw/2,hy+hh-10);
    }

    h._rect={x:hx,y:hy,w:hw,h:hh};
  });

  ctx.restore();
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
let camX=0, camY=0;
function updateCam(){
  if(!myPlayer) return;
  camX+=(myPlayer.x-W/2-camX)*0.12;
  camY+=(myPlayer.y-H/2-camY)*0.12;
}

// ─── MINIMAP ─────────────────────────────────────────────────────────────────
function drawMinimap(){
  if(!gameState) return;
  const mw=miniCvs.width, mh=miniCvs.height;
  miniCtx.fillStyle='rgba(15,10,3,0.88)'; miniCtx.fillRect(0,0,mw,mh);
  const sx=mw/mapWidth, sy=mh/mapHeight;
  for(const b of (gameState.bunkers||[])){miniCtx.fillStyle=b.destroyed?'#2a2010':'#7a6a3a';miniCtx.fillRect(b.x*sx-2,b.y*sy-2,4,4);}
  miniCtx.fillStyle='#e85a5a';
  for(const n of (gameState.npcs||[])){miniCtx.beginPath();miniCtx.arc(n.x*sx,n.y*sy,2,0,Math.PI*2);miniCtx.fill();}
  if(gameState.boss?.alive){miniCtx.fillStyle='#ff1100';miniCtx.beginPath();miniCtx.arc(gameState.boss.x*sx,gameState.boss.y*sy,5,0,Math.PI*2);miniCtx.fill();}
  miniCtx.fillStyle='#3090e0';
  for(const p of (gameState.players||[])){if(p.id===myId)continue;miniCtx.beginPath();miniCtx.arc(p.x*sx,p.y*sy,3,0,Math.PI*2);miniCtx.fill();}
  if(myPlayer){miniCtx.fillStyle='#40d060';miniCtx.beginPath();miniCtx.arc(myPlayer.x*sx,myPlayer.y*sy,3.5,0,Math.PI*2);miniCtx.fill();}
  miniCtx.strokeStyle='#5a4a1a';miniCtx.lineWidth=1;miniCtx.strokeRect(0,0,mw,mh);
}

// ─── HUD UPDATE ───────────────────────────────────────────────────────────────
function updateHUD(p){
  const heli=HELI_CATALOG.find(h=>h.type===p.heliType)||HELI_CATALOG[0];
  const hp=Math.max(0,p.hp), maxHp=heli.maxHp;
  document.getElementById('health-bar').style.width=(hp/maxHp*100)+'%';
  document.getElementById('health-bar').style.background=hp>maxHp*.5?'#5fe85a':hp>maxHp*.25?'#f0c040':'#e85a5a';
  document.getElementById('hp-value').textContent=hp;
  document.getElementById('hp-value').className='hud-value '+(hp>maxHp*.5?'green':'red');
  document.getElementById('score-value').textContent=p.score;
  document.getElementById('kills-value').textContent=p.kills;
  document.getElementById('coins-value').textContent='💰 '+p.coins;

  // Lives
  const lw=document.getElementById('lives-wrap');
  lw.innerHTML='';
  if(gameMode==='mission'){
    for(let i=0;i<MAX_LIVES;i++){const d=document.createElement('div');d.className='life-icon'+(i>=livesLeft?' empty':'');lw.appendChild(d);}
  } else {
    lw.innerHTML='<span style="color:#5fe85a;font-size:13px">∞</span>';
  }

  // Rockets
  const ai=document.getElementById('ammo-indicator');
  ai.innerHTML='';
  const showR=gameMode==='mission'?MAX_ROCKETS:Math.min(rocketsLeft,10);
  const filledR=gameMode==='mission'?Math.min(rocketsLeft,MAX_ROCKETS):Math.min(rocketsLeft,10);
  for(let i=0;i<showR;i++){const d=document.createElement('div');d.className='ammo-rocket'+(i>=filledR?' empty':'');ai.appendChild(d);}

  // Bombs
  const bi=document.getElementById('bomb-indicator');
  bi.innerHTML='';
  const showB=gameMode==='mission'?MAX_BOMBS:3;
  const filledB=gameMode==='mission'?Math.min(bombsLeft,MAX_BOMBS):Math.min(bombsLeft,3);
  for(let i=0;i<showB;i++){const d=document.createElement('div');d.className='bomb-dot'+(i>=filledB?' empty':'');bi.appendChild(d);}

  document.getElementById('respawn-msg').style.display=p.alive?'none':'flex';

  // Laser crosshair
  const isLaser=p.heliType==='laser';
  document.getElementById('crosshair').className=isLaser?'laser':'';
  document.getElementById('crosshair-ring').className=isLaser?'laser':'';
}

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────
let laserActive=false, laserAngle=0;

function render(){
  requestAnimationFrame(render);
  if(shopOpen){ctx.clearRect(0,0,W,H);ctx.fillStyle='rgba(5,4,1,0.92)';ctx.fillRect(0,0,W,H);drawShop();return;}
  if(!gameState) return;

  updateCam();
  worldMouseX=mouseX+camX; worldMouseY=mouseY+camY;

  ctx.clearRect(0,0,W,H);
  drawDesert(camX,camY);

  // Bunkers
  for(const b of (gameState.bunkers||[])) drawBunker(ctx,b.x-camX,b.y-camY,b.hp,b.maxHp,b.type,b.destroyed);

  // Explosions
  for(const e of (gameState.explosions||[])) drawExplosion({...e,x:e.x-camX,y:e.y-camY});

  // Bullets
  for(const b of (gameState.bullets||[])) drawBullet(b.x-camX,b.y-camY,b.isNPC,b.isLaser);

  // Rockets
  for(const r of (gameState.rockets||[])) drawRocket(r.x-camX,r.y-camY,r.angle);

  // Bombs
  for(const b of (gameState.bombs||[])) drawBomb(b.x-camX,b.y-camY);

  // Laser beam (client-side visual when holding LMB with laser heli)
  if(myPlayer&&myPlayer.alive&&myPlayer.heliType==='laser'&&shootHold){
    const a=Math.atan2(worldMouseY-myPlayer.y,worldMouseX-myPlayer.x);
    drawLaser(myPlayer.x-camX,myPlayer.y-camY,a);
  }

  // NPCs
  for(const n of (gameState.npcs||[])){
    const nx=n.x-camX, ny=n.y-camY;
    drawHeli(nx,ny,n.angle,'#c05030',false);
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(nx-20,ny-36,40,5);
    ctx.fillStyle='#e85a5a';ctx.fillRect(nx-20,ny-36,40*(n.hp/n.maxHp),5);
    ctx.fillStyle='#e8d49a';ctx.font='10px Courier New';ctx.textAlign='center';
    ctx.fillText('NEPŘÍTEL',nx,ny-40);
  }

  // Boss
  if(gameState.boss?.alive){
    const b=gameState.boss;
    drawBoss(b.x-camX,b.y-camY,b);
    ctx.fillStyle=b.enraged?'#ff2200':'#ffaa00';ctx.font=`bold ${Math.round(12*b.size)}px Courier New`;ctx.textAlign='center';
    ctx.fillText(b.name,b.x-camX,b.y-camY-52*(b.size||1.5));
  }

  // Other players
  for(const p of (gameState.players||[])){
    if(p.id===myId) continue;
    const heli=HELI_CATALOG.find(h=>h.type===p.heliType)||HELI_CATALOG[0];
    drawHeli(p.x-camX,p.y-camY,p.angle,heli.color,false,1,heli.special);
    ctx.fillStyle='#90d0ff';ctx.font='11px Courier New';ctx.textAlign='center';
    ctx.fillText(p.name,p.x-camX,p.y-camY-40);
  }

  // My heli
  if(myPlayer?.alive){
    const heli=HELI_CATALOG.find(h=>h.type===myPlayer.heliType)||HELI_CATALOG[0];
    drawHeli(myPlayer.x-camX,myPlayer.y-camY,myPlayer.angle,heli.color,true,1,heli.special);
  }

  // Bunker hover ring
  const hb=getHovBunker();
  if(hb){
    ctx.strokeStyle='rgba(255,80,40,0.8)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(hb.x-camX,hb.y-camY,46,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(255,80,40,0.4)';
    ctx.beginPath();ctx.arc(hb.x-camX,hb.y-camY,55,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
  }

  drawMinimap();
  drawMissionHUD();
  drawBossBar();
  drawNotifs();

  // Bottom hint bar
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(W/2-140,H-30,280,22);
  ctx.fillStyle='#5a4a2a';ctx.font='10px Courier New';ctx.textAlign='center';
  ctx.fillText('LMB=střelba  RMB=raketa  B=bomba  Tab=Obchod',W/2,H-14);
  ctx.restore();

  if(myPlayer?.alive) socket.emit('mouseAngle',Math.atan2(worldMouseY-myPlayer.y,worldMouseX-myPlayer.x));
  if(myPlayer) updateHUD(myPlayer);
}

function getHovBunker(){
  const list=gameState?(gameState.bunkers||[]):bunkerData;
  for(const b of list){if(b.destroyed)continue;if(Math.hypot(worldMouseX-b.x,worldMouseY-b.y)<52)return b;}
  return null;
}

// ─── MISSION OVER OVERLAY ────────────────────────────────────────────────────
function showMissionOverlay(title, titleColor, desc, buttons){
  const ov=document.getElementById('mission-overlay');
  const box=document.getElementById('mission-overlay-box');
  document.getElementById('mo-title').textContent=title;
  document.getElementById('mo-title').style.color=titleColor;
  document.getElementById('mo-desc').innerHTML=desc;
  const btns=document.getElementById('mo-buttons');
  btns.innerHTML='';
  buttons.forEach(b=>{
    const el=document.createElement('button');
    el.className='mo-btn '+(b.cls||'');
    el.textContent=b.label;
    el.onclick=b.fn;
    btns.appendChild(el);
  });
  ov.style.display='flex';
}

function hideMissionOverlay(){ document.getElementById('mission-overlay').style.display='none'; }

// ─── INPUT ────────────────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='w')keys.w=true; if(k==='a')keys.a=true; if(k==='s')keys.s=true; if(k==='d')keys.d=true;
  if(k===' ')e.preventDefault();

  if(k==='b'){
    if(shopOpen){shopOpen=false;return;}
    if(!myPlayer?.alive) return;
    if(gameMode==='mission'&&bombsLeft<=0){addNotif('💣 Žádné bomby!','#e85a5a',2000);return;}
    socket.emit('bomb');
    if(gameMode==='mission') bombsLeft=Math.max(0,bombsLeft-1);
  }
  if(e.key==='Tab'){e.preventDefault();shopOpen=!shopOpen;}
});
document.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();
  if(k==='w')keys.w=false;if(k==='a')keys.a=false;if(k==='s')keys.s=false;if(k==='d')keys.d=false;
});

canvas.addEventListener('mousemove',e=>{
  mouseX=e.clientX;mouseY=e.clientY;
  document.getElementById('crosshair').style.left=mouseX+'px';
  document.getElementById('crosshair').style.top=mouseY+'px';
  document.getElementById('crosshair-ring').style.left=mouseX+'px';
  document.getElementById('crosshair-ring').style.top=mouseY+'px';
  document.getElementById('crosshair-ring').style.borderColor=getHovBunker()?'rgba(255,80,40,0.8)':'rgba(255,80,80,0.5)';
});

canvas.addEventListener('mousedown',e=>{
  if(shopOpen){
    HELI_CATALOG.forEach(h=>{
      if(!h._rect) return;
      const r=h._rect;
      if(e.clientX>=r.x&&e.clientX<=r.x+r.w&&e.clientY>=r.y&&e.clientY<=r.y+r.h){
        if(h.price===0||localStorage.getItem('owned_'+h.type)==='1'){
          selectedHeli=h.type; localStorage.setItem('heliType',h.type);
          socket.emit('buyHeli',{type:h.type});
          addNotif(`✔ Přepnuto na ${h.name}`,'#5fe85a');
        } else {
          socket.emit('buyHeli',{type:h.type});
        }
      }
    });
    return;
  }
  if(!myPlayer?.alive) return;
  if(e.button===0) shootHold=true;
  if(e.button===2){
    if(gameMode==='mission'&&rocketsLeft<=0){addNotif('🚀 Žádné rakety!','#e85a5a',2000);return;}
    const hb=getHovBunker();
    const tx=hb?hb.x:worldMouseX, ty=hb?hb.y:worldMouseY;
    socket.emit('rocket',{worldX:tx,worldY:ty});
    if(gameMode==='mission') rocketsLeft=Math.max(0,rocketsLeft-1);
  }
});
canvas.addEventListener('mouseup',e=>{if(e.button===0)shootHold=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

setInterval(()=>{
  if(!myPlayer?.alive||shopOpen) return;
  socket.emit('input',{w:keys.w,a:keys.a,s:keys.s,d:keys.d});
  if(shootHold){
    if(shootCooldown<=0){
      socket.emit('shoot');
      // Laser fires every frame, others every 8 ticks
      shootCooldown=myPlayer?.heliType==='laser'?2:8;
    }
  }
  if(shootCooldown>0) shootCooldown--;
},1000/60);

// ─── SOCKET EVENTS ───────────────────────────────────────────────────────────
socket.on('init',data=>{
  myId=data.id; mapWidth=data.mapWidth; mapHeight=data.mapHeight;
  bunkerData=data.bunkers||[]; genDesert();
});

socket.on('gameState',state=>{
  gameState=state;
  myPlayer=state.players.find(p=>p.id===myId)||null;
  if(myPlayer){savedCoins=myPlayer.coins;localStorage.setItem('coins',savedCoins);}
});

socket.on('missionStart',data=>{
  bunkerData=data.bunkers||[]; genDesert();
  if(gameMode==='mission'){livesLeft=MAX_LIVES;rocketsLeft=MAX_ROCKETS;bombsLeft=MAX_BOMBS;}
  addNotif(`🎯 MISE ${data.missionIndex+1}: ${data.mission.name}`,'#f0c040',6000);
});

socket.on('objectivesMet',data=>{addNotif(data.message,'#ff8800',5000);});

socket.on('bossSpawn',data=>{addNotif(`☠ BOSS: ${data.bossName}`,'#ff2200',6000);});

socket.on('bossEnraged',data=>{addNotif(`🔥 ${data.name} je ROZZUŘEN!`,'#ff0000',4000);});

socket.on('missionComplete',data=>{
  if(gameMode==='mission'){
    // Unlock next mission
    if(data.hasNext&&!unlockedMissions.includes(data.missionIndex+1)){
      unlockedMissions.push(data.missionIndex+1);
      localStorage.setItem('unlocked',JSON.stringify(unlockedMissions));
    }
    showMissionOverlay(
      '✅ MISE SPLNĚNA!','#5fe85a',
      `Gratulujeme!<br>Odměna: <b style="color:#ffe060">+${data.reward} mincí</b><br><br>${data.hasNext?'Příští mise se brzy spustí...':'Všechny mise dokončeny!'}`,
      [
        {label:'Zpět do menu', cls:'', fn:()=>{hideMissionOverlay();document.getElementById('overlay').style.display='flex';buildMissionCards();}},
        ...(data.hasNext?[{label:'Hrát dál', cls:'green', fn:()=>hideMissionOverlay()}]:[])
      ]
    );
  } else {
    addNotif(`✅ VLNA SPLNĚNA! +${data.reward} mincí`,'#5fe85a',5000);
  }
});

socket.on('playerDied',()=>{
  if(gameMode==='mission'){
    livesLeft=Math.max(0,livesLeft-1);
    if(livesLeft<=0){
      showMissionOverlay(
        '💀 MISE SELHALA','#e85a5a',
        `Tvoje helikoptéra byla zničena a došly životy.<br><br>Mise <b>${missionIndex+1}</b> selhala.`,
        [
          {label:'Zkusit znovu',cls:'red',fn:()=>{hideMissionOverlay();startMission(missionIndex);}},
          {label:'Zpět do menu',cls:'',fn:()=>{hideMissionOverlay();document.getElementById('overlay').style.display='flex';buildMissionCards();}}
        ]
      );
    } else {
      addNotif(`💀 Zničena! Životy: ${livesLeft}/${MAX_LIVES}`,'#e85a5a',3000);
    }
  }
});

socket.on('purchaseOk',data=>{
  selectedHeli=data.heliType;
  localStorage.setItem('heliType',data.heliType);
  localStorage.setItem('owned_'+data.heliType,'1');
  const h=HELI_CATALOG.find(x=>x.type===data.heliType);
  addNotif(`✔ Zakoupeno: ${h?.emoji} ${h?.name}`,'#5fe85a',4000);
});

socket.on('purchaseFail',data=>{addNotif(`✖ ${data.message}`,'#e85a5a',3000);});

socket.on('gameWon',()=>{
  showMissionOverlay(
    '🏆 VÍTĚZ!','#ffe060',
    'Gratulujeme! Dokončil jsi všech 5 misí!<br>Jsi pravý Velitel pouště.',
    [{label:'Zpět do menu',cls:'',fn:()=>{hideMissionOverlay();document.getElementById('overlay').style.display='flex';buildMissionCards();}}]
  );
});

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
async function fetchLB(){
  try{
    const data=await(await fetch('/api/leaderboard')).json();
    const el=document.getElementById('lb-rows');
    if(!data?.length){el.innerHTML='<div style="color:#5a4a2a;font-size:10px">Zatím žádné záznamy</div>';return;}
    el.innerHTML=data.map((r,i)=>`<div class="lb-row"><span class="lb-name">${i+1}. ${r.player_name}</span><span class="lb-score">${r.score}</span></div>`).join('');
  }catch(e){}
}
fetchLB(); setInterval(fetchLB,30000);

// ─── INIT ────────────────────────────────────────────────────────────────────
buildMissionCards();
showTab('missions');
render();
