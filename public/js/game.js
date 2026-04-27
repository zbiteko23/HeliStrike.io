// ─── SETUP ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

const socket = io();
let myId = null, mapWidth = 3200, mapHeight = 2200;
let gameState = null, myPlayer = null, bunkerData = [];
let mouseX = W/2, mouseY = H/2, worldMouseX = 0, worldMouseY = 0;
let shootCooldown = 0, rocketCount = 4;
const MAX_ROCKETS = 4;
let bombCooldown = 0;
let shootHold = false;
const keys = { w:false, a:false, s:false, d:false };

// ─── SHOP & MISSION STATE ────────────────────────────────────────────────────
let shopOpen = false;
let selectedHeli = localStorage.getItem('heliType') || 'standard';
let savedCoins = parseInt(localStorage.getItem('coins') || '0');
let currentMission = null, missionPhase = 'active';

const HELI_CATALOG = [
  { type:'standard', name:'Standardní', desc:'Vyvážená helikoptéra.', price:0, color:'#40d060', speed:'●●●○○', dmg:'●●●○○', hp:'●●●○○', maxHp:100 },
  { type:'fast',     name:'Raptor',     desc:'Rychlá, lehká, menší poškození.', price:400, color:'#40c0ff', speed:'●●●●●', dmg:'●●○○○', hp:'●●○○○', maxHp:70 },
  { type:'heavy',    name:'Titan',      desc:'Pomalá, silná, hodně HP.', price:700, color:'#e08030', speed:'●○○○○', dmg:'●●●●●', hp:'●●●●●', maxHp:150 }
];

// ─── DRAWING HELPERS ─────────────────────────────────────────────────────────
function drawHelicopter(ctx, x, y, angle, color, isPlayer, scale=1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(3,5,22,8,0,0,Math.PI*2); ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0,0,22,10,0,0,Math.PI*2); ctx.fill();

  ctx.fillStyle = isPlayer ? 'rgba(120,220,255,0.7)' : 'rgba(80,180,210,0.5)';
  ctx.beginPath(); ctx.ellipse(8,-2,8,6,-0.3,0,Math.PI*2); ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-14,-3); ctx.lineTo(-32,-1); ctx.lineTo(-32,3); ctx.lineTo(-14,4); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = isPlayer ? 'rgba(200,240,255,0.8)' : 'rgba(160,200,220,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-32,-7); ctx.lineTo(-32,9); ctx.stroke();

  const rot = (Date.now()/80) % (Math.PI*2);
  ctx.strokeStyle = isPlayer ? 'rgba(200,240,255,0.7)' : 'rgba(160,200,220,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(Math.cos(rot)*28,Math.sin(rot)*28); ctx.lineTo(Math.cos(rot+Math.PI)*28,Math.sin(rot+Math.PI)*28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Math.cos(rot+Math.PI/2)*28,Math.sin(rot+Math.PI/2)*28); ctx.lineTo(Math.cos(rot+1.5*Math.PI)*28,Math.sin(rot+1.5*Math.PI)*28); ctx.stroke();

  ctx.restore();
}

function drawBoss(x, y, angle, bossData) {
  if(!bossData || !bossData.alive) return;
  const s = bossData.size || 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Glow
  if(bossData.enraged) {
    ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 30;
  } else {
    ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 15;
  }

  // Extra armor plates
  ctx.fillStyle = bossData.enraged ? '#800000' : (bossData.color || '#800000');
  ctx.beginPath(); ctx.ellipse(0,0,30*s,14*s,0,0,Math.PI*2); ctx.fill();

  // Cockpit armored
  ctx.fillStyle = 'rgba(255,80,0,0.7)';
  ctx.beginPath(); ctx.ellipse(10*s,-3*s,10*s,8*s,-0.2,0,Math.PI*2); ctx.fill();

  // Tail
  ctx.fillStyle = bossData.color || '#800000';
  ctx.beginPath(); ctx.moveTo(-18*s,-4*s); ctx.lineTo(-42*s,-2*s); ctx.lineTo(-42*s,4*s); ctx.lineTo(-18*s,5*s); ctx.closePath(); ctx.fill();

  // Rotors (double)
  const rot=(Date.now()/60)%(Math.PI*2);
  ctx.strokeStyle='rgba(255,150,50,0.8)'; ctx.lineWidth=3.5;
  for(let r=0;r<2;r++){
    const a=rot+r*Math.PI/2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*38*s,Math.sin(a)*38*s); ctx.lineTo(Math.cos(a+Math.PI)*38*s,Math.sin(a+Math.PI)*38*s); ctx.stroke();
  }

  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawBunker(ctx, x, y, health, maxHealth, type, destroyed) {
  ctx.save(); ctx.translate(x, y);
  if(destroyed) {
    ctx.fillStyle='#5a4a2a';
    for(let i=0;i<5;i++) ctx.fillRect(-20+i*8+(i%2)*4,-8+(i%3)*5,6+i%3*2,5+i%2*3);
    ctx.restore(); return;
  }
  const size=type==='large'?38:26;
  ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(-size/2+4,-size/2+4,size,size);
  ctx.fillStyle='#7a6a3a'; ctx.fillRect(-size/2,-size/2,size,size);
  ctx.fillStyle='#5a4a20'; ctx.fillRect(-size/4,-size/4,size/2,size/2);
  ctx.strokeStyle='#4a3a18'; ctx.lineWidth=1.5; ctx.strokeRect(-size/2,-size/2,size,size);
  if(type==='large'){ctx.fillStyle='#8a7a3a';for(let i=0;i<4;i++){ctx.fillRect(-size/2+i*10-1,-size/2-4,8,5);ctx.fillRect(-size/2+i*10-1,size/2,8,5);}}
  const barW=size+10, pct=health/maxHealth;
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(-barW/2,-size/2-14,barW,6);
  ctx.fillStyle=pct>0.5?'#5fe85a':pct>0.25?'#f0c040':'#e85a5a'; ctx.fillRect(-barW/2,-size/2-14,barW*pct,6);
  ctx.restore();
}

function drawBullet(ctx,x,y,isNPC){
  ctx.save();
  ctx.fillStyle=isNPC?'#ff5555':'#ffee66';
  ctx.shadowColor=isNPC?'#ff0000':'#ffcc00'; ctx.shadowBlur=4;
  ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawRocket(ctx,x,y,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.fillStyle='rgba(255,150,50,0.4)'; ctx.beginPath(); ctx.moveTo(-5,-2); ctx.lineTo(-14,0); ctx.lineTo(-5,2); ctx.fill();
  ctx.fillStyle='#e0e0e0'; ctx.beginPath(); ctx.ellipse(0,0,8,3,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#e85a20'; ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(12,-2); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBomb(ctx,x,y){
  ctx.save();
  ctx.fillStyle='#333';
  ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ff8800'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawExplosion(ctx,e){
  const t=1-e.life/e.maxLife;
  const r=e.size==='huge'?85:e.size==='large'?48:e.size==='medium'?26:14;
  const alpha=(1-t)*0.9;
  ctx.save();
  ctx.globalAlpha=alpha*0.4; ctx.fillStyle='#ff8c00';
  ctx.beginPath(); ctx.arc(e.x,e.y,r*(0.5+t*1.2),0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=alpha; ctx.fillStyle=t<0.3?'#ffffff':t<0.6?'#ffee00':'#ff6600';
  ctx.beginPath(); ctx.arc(e.x,e.y,r*(1-t*0.8),0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ─── DESERT BACKGROUND ───────────────────────────────────────────────────────
const desertFeatures = [];
function generateDesertFeatures() {
  desertFeatures.length = 0;
  for(let i=0;i<120;i++) desertFeatures.push({type:'rock',x:Math.random()*mapWidth,y:Math.random()*mapHeight,size:4+Math.random()*12,angle:Math.random()*Math.PI});
  for(let i=0;i<40;i++) desertFeatures.push({type:'dune',x:Math.random()*mapWidth,y:Math.random()*mapHeight,w:60+Math.random()*140,h:20+Math.random()*40});
  for(let i=0;i<60;i++) desertFeatures.push({type:'scrub',x:Math.random()*mapWidth,y:Math.random()*mapHeight,size:5+Math.random()*8});
}

function drawDesertBackground(camX,camY){
  ctx.fillStyle='#c8a850'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#c09838';
  for(let i=0;i<200;i++){const x=((i*137)%mapWidth-camX)%W,y=((i*241)%mapHeight-camY)%H;if(x>0&&x<W&&y>0&&y<H)ctx.fillRect(x,y,2,1);}
  for(const f of desertFeatures){
    const sx=f.x-camX,sy=f.y-camY;
    if(sx<-200||sx>W+200||sy<-200||sy>H+200) continue;
    if(f.type==='dune'){ctx.fillStyle='rgba(180,140,50,0.35)';ctx.beginPath();ctx.ellipse(sx,sy,f.w,f.h,0,0,Math.PI*2);ctx.fill();}
    else if(f.type==='rock'){ctx.save();ctx.translate(sx,sy);ctx.rotate(f.angle);ctx.fillStyle='#8a7040';ctx.beginPath();ctx.ellipse(0,0,f.size,f.size*0.7,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else if(f.type==='scrub'){ctx.fillStyle='#6a8040';ctx.beginPath();ctx.arc(sx,sy,f.size,0,Math.PI*2);ctx.fill();}
  }
  ctx.strokeStyle='#8a6020'; ctx.lineWidth=4; ctx.strokeRect(-camX,-camY,mapWidth,mapHeight);
}

// ─── NOTIFICATION SYSTEM ─────────────────────────────────────────────────────
const notifications = [];
function addNotif(msg, color='#f0c040', duration=4000) {
  notifications.push({ msg, color, t:Date.now(), duration });
}
function drawNotifications() {
  const now=Date.now();
  let y=H*0.35;
  for(let i=notifications.length-1;i>=0;i--) {
    const n=notifications[i];
    const age=now-n.t, alpha=Math.min(1,(n.duration-age)/600);
    if(alpha<=0){notifications.splice(i,1);continue;}
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.font='bold 22px Courier New';
    ctx.textAlign='center';
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillText(n.msg, W/2+2, y+2);
    ctx.fillStyle=n.color;
    ctx.fillText(n.msg, W/2, y);
    ctx.restore();
    y+=32;
  }
}

// ─── MISSION HUD ─────────────────────────────────────────────────────────────
function drawMissionHUD() {
  if(!gameState||!gameState.mission) return;
  const m=gameState.mission;
  const x=W-230, y=90;

  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';
  roundRect(ctx, x, y, 220, 130, 8); ctx.fill();
  ctx.strokeStyle='#5a4a1a'; ctx.lineWidth=1; roundRect(ctx,x,y,220,130,8); ctx.stroke();

  ctx.fillStyle='#f0c040'; ctx.font='bold 13px Courier New'; ctx.textAlign='left';
  ctx.fillText(`MISE ${m.index+1}: ${m.name}`, x+10, y+20);
  ctx.fillStyle='#8a7a5a'; ctx.font='11px Courier New';
  ctx.fillText(m.description, x+10, y+36);

  if(m.phase==='bossPhase'||m.phase==='active') {
    ctx.fillStyle='#e8d49a'; ctx.font='12px Courier New';
    ctx.fillText(`Zabití: ${m.totalKills}/${m.killsRequired}`, x+10, y+56);
    ctx.fillText(`Bunkry: ${m.destroyedBunkers}/${m.bunkersRequired}`, x+10, y+72);

    // Progress bars
    drawProgressBar(ctx, x+10, y+80, 200, 8, m.totalKills/m.killsRequired, '#e85a5a');
    drawProgressBar(ctx, x+10, y+94, 200, 8, m.destroyedBunkers/m.bunkersRequired, '#f0c040');

    if(m.phase==='active') {
      const allDone=m.totalKills>=m.killsRequired&&m.destroyedBunkers>=m.bunkersRequired;
      ctx.fillStyle=allDone?'#5fe85a':'#8a7a5a'; ctx.font='11px Courier New';
      ctx.fillText(allDone?'✔ Boss přichází...':'Splň cíle!', x+10, y+116);
    }
  }
  if(m.phase==='bossPhase') {
    ctx.fillStyle='#ff5533'; ctx.font='bold 13px Courier New';
    ctx.fillText('⚠ BOSS AKTIVNÍ', x+10, y+112);
  }
  ctx.restore();
}

function drawProgressBar(ctx,x,y,w,h,pct,color){
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle=color; ctx.fillRect(x,y,w*Math.min(1,Math.max(0,pct)),h);
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

// ─── BOSS HP BAR ─────────────────────────────────────────────────────────────
function drawBossHPBar() {
  if(!gameState||!gameState.boss||!gameState.boss.alive) return;
  const boss=gameState.boss;
  const bw=500, bh=28, bx=(W-bw)/2, by=H-70;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.7)'; roundRect(ctx,bx-4,by-4,bw+8,bh+20,6); ctx.fill();
  ctx.fillStyle=boss.enraged?'#ff2200':'#cc4400';
  ctx.fillRect(bx,by,bw*(boss.hp/boss.maxHp),bh);
  ctx.strokeStyle=boss.enraged?'#ff5500':'#882200'; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#fff'; ctx.font=`bold 14px Courier New`; ctx.textAlign='center';
  ctx.fillText((boss.enraged?'🔥 ':'💀 ')+boss.name+`  ${boss.hp}/${boss.maxHp}`, W/2, by+20);
  ctx.restore();
}

// ─── SHOP UI ─────────────────────────────────────────────────────────────────
function drawShop() {
  if(!shopOpen) return;
  const sw=600, sh=440, sx=(W-sw)/2, sy=(H-sh)/2;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.85)'; roundRect(ctx,sx,sy,sw,sh,12); ctx.fill();
  ctx.strokeStyle='#f0c040'; ctx.lineWidth=2; roundRect(ctx,sx,sy,sw,sh,12); ctx.stroke();

  ctx.fillStyle='#f0c040'; ctx.font='bold 24px Courier New'; ctx.textAlign='center';
  ctx.fillText('🛒 OBCHOD S HELIKOPTÉRAMI', W/2, sy+38);

  const coins = myPlayer ? myPlayer.coins : savedCoins;
  ctx.fillStyle='#ffe060'; ctx.font='16px Courier New';
  ctx.fillText(`💰 Tvoje mince: ${coins}`, W/2, sy+62);

  ctx.fillStyle='#8a7a5a'; ctx.font='11px Courier New';
  ctx.fillText('B = zavřít obchod   |   klikni na helikoptéru pro nákup / výběr', W/2, sy+sh-16);

  HELI_CATALOG.forEach((heli, i) => {
    const col = i % 3;
    const hx = sx+20+col*192, hy = sy+90;
    const hw = 180, hh = 300;
    const owned = selectedHeli === heli.type || heli.price === 0;
    const canBuy = (myPlayer ? myPlayer.coins : savedCoins) >= heli.price;
    const active = myPlayer && myPlayer.heliType === heli.type;

    ctx.fillStyle = active ? 'rgba(64,208,96,0.18)' : owned ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx,hx,hy,hw,hh,8); ctx.fill();
    ctx.strokeStyle = active ? '#40d060' : owned ? '#f0c040' : '#5a4a1a'; ctx.lineWidth=1.5;
    roundRect(ctx,hx,hy,hw,hh,8); ctx.stroke();

    // Draw mini heli preview
    drawHelicopter(ctx, hx+hw/2, hy+70, 0, heli.color, false, 0.9);

    ctx.fillStyle=heli.color; ctx.font='bold 14px Courier New'; ctx.textAlign='center';
    ctx.fillText(heli.name, hx+hw/2, hy+120);
    ctx.fillStyle='#8a7a5a'; ctx.font='10px Courier New';
    ctx.fillText(heli.desc, hx+hw/2, hy+136);

    ctx.fillStyle='#e8d49a'; ctx.font='11px Courier New'; ctx.textAlign='left';
    ctx.fillText('Rychlost: '+heli.speed, hx+12, hy+158);
    ctx.fillText('Poškození:'+heli.dmg, hx+12, hy+174);
    ctx.fillText('HP:       '+heli.hp,  hx+12, hy+190);

    // HP bar visual
    const maxHp = heli.maxHp;
    drawProgressBar(ctx, hx+12, hy+200, hw-24, 6, maxHp/150, heli.color);

    if(heli.price===0){
      ctx.fillStyle='#5fe85a'; ctx.font='bold 12px Courier New'; ctx.textAlign='center';
      ctx.fillText(active?'✔ AKTIVNÍ':'Zdarma', hx+hw/2, hy+238);
    } else {
      ctx.fillStyle=canBuy?'#f0c040':'#e85a5a'; ctx.font='bold 14px Courier New'; ctx.textAlign='center';
      ctx.fillText(`💰 ${heli.price}`, hx+hw/2, hy+238);
      if(active){ctx.fillStyle='#5fe85a';ctx.font='bold 12px Courier New';ctx.fillText('✔ AKTIVNÍ', hx+hw/2, hy+256);}
      else if(!canBuy){ctx.fillStyle='#e85a5a';ctx.font='11px Courier New';ctx.fillText('Nedostatek mincí', hx+hw/2, hy+256);}
    }

    // Clickable area stored for mouse handling
    heli._rect = { x:hx, y:hy, w:hw, h:hh };
  });

  ctx.restore();
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
let camX=0, camY=0;
function updateCamera(){
  if(!myPlayer) return;
  camX+=(myPlayer.x-W/2-camX)*0.12;
  camY+=(myPlayer.y-H/2-camY)*0.12;
}

// ─── MINIMAP ─────────────────────────────────────────────────────────────────
function drawMinimap(){
  if(!gameState) return;
  const mw=miniCanvas.width, mh=miniCanvas.height;
  miniCtx.fillStyle='rgba(20,15,5,0.85)'; miniCtx.fillRect(0,0,mw,mh);
  const sx=mw/mapWidth, sy=mh/mapHeight;
  for(const b of (gameState.bunkers||[])){miniCtx.fillStyle=b.destroyed?'#3a3020':'#7a6a3a';miniCtx.fillRect(b.x*sx-2,b.y*sy-2,4,4);}
  miniCtx.fillStyle='#e85a5a';
  for(const n of (gameState.npcs||[])){miniCtx.beginPath();miniCtx.arc(n.x*sx,n.y*sy,2,0,Math.PI*2);miniCtx.fill();}
  if(gameState.boss&&gameState.boss.alive){miniCtx.fillStyle='#ff2200';miniCtx.beginPath();miniCtx.arc(gameState.boss.x*sx,gameState.boss.y*sy,4,0,Math.PI*2);miniCtx.fill();}
  miniCtx.fillStyle='#3090e0';
  for(const p of (gameState.players||[])){if(p.id===myId)continue;miniCtx.beginPath();miniCtx.arc(p.x*sx,p.y*sy,3,0,Math.PI*2);miniCtx.fill();}
  if(myPlayer){miniCtx.fillStyle='#40d060';miniCtx.beginPath();miniCtx.arc(myPlayer.x*sx,myPlayer.y*sy,3.5,0,Math.PI*2);miniCtx.fill();}
  miniCtx.strokeStyle='#5a4a1a';miniCtx.lineWidth=1;miniCtx.strokeRect(0,0,mw,mh);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD(p){
  const hp=Math.max(0,p.hp);
  const maxHp=HELI_CATALOG.find(h=>h.type===p.heliType)?.maxHp||100;
  document.getElementById('health-bar').style.width=(hp/maxHp*100)+'%';
  document.getElementById('health-bar').style.background=hp>maxHp*0.5?'#5fe85a':hp>maxHp*0.25?'#f0c040':'#e85a5a';
  document.getElementById('hp-value').textContent=hp;
  document.getElementById('hp-value').className='hud-value '+(hp>maxHp*0.5?'green':'red');
  document.getElementById('score-value').textContent=p.score;
  document.getElementById('kills-value').textContent=p.kills;
  document.getElementById('bunkers-value').textContent=p.bunkersDestroyed||0;

  // Coins display
  let coinsEl=document.getElementById('coins-value');
  if(coinsEl) coinsEl.textContent='💰 '+p.coins;

  // Rockets
  const ammoDiv=document.getElementById('ammo-indicator');
  if(ammoDiv){ammoDiv.innerHTML='';for(let i=0;i<rocketCount;i++){const d=document.createElement('div');d.className='ammo-icon ammo-rocket';ammoDiv.appendChild(d);}}

  // Bomb cooldown indicator
  let bombEl=document.getElementById('bomb-cd');
  if(bombEl) bombEl.textContent=bombCooldown>0?`B: ${Math.ceil(bombCooldown/60)}s`:'B: ✔';

  document.getElementById('respawn-msg').style.display=p.alive?'none':'flex';
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function render(){
  requestAnimationFrame(render);
  if(shopOpen){ drawShop(); return; }
  if(!gameState) return;

  updateCamera();
  worldMouseX=mouseX+camX; worldMouseY=mouseY+camY;
  if(bombCooldown>0) bombCooldown--;

  ctx.clearRect(0,0,W,H);
  drawDesertBackground(camX,camY);

  // Bunkers
  for(const b of (gameState.bunkers||[])) drawBunker(ctx,b.x-camX,b.y-camY,b.hp,b.maxHp||80,b.type||'large',b.destroyed);

  // Explosions
  for(const e of (gameState.explosions||[])) drawExplosion(ctx,{...e,x:e.x-camX,y:e.y-camY});

  // Bullets
  for(const b of (gameState.bullets||[])) drawBullet(ctx,b.x-camX,b.y-camY,b.isNPC);

  // Rockets
  for(const r of (gameState.rockets||[])) drawRocket(ctx,r.x-camX,r.y-camY,r.angle);

  // Bombs
  for(const b of (gameState.bombs||[])) drawBomb(ctx,b.x-camX,b.y-camY);

  // NPCs
  for(const n of (gameState.npcs||[])){
    const nx=n.x-camX, ny=n.y-camY;
    drawHelicopter(ctx,nx,ny,n.angle,'#c05030',false);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(nx-20,ny-36,40,5);
    ctx.fillStyle='#e85a5a'; ctx.fillRect(nx-20,ny-36,40*(n.hp/n.maxHp),5);
    ctx.fillStyle='#e8d49a'; ctx.font='10px Courier New'; ctx.textAlign='center';
    ctx.fillText('NEPŘÍTEL',nx,ny-40);
  }

  // Boss
  if(gameState.boss&&gameState.boss.alive){
    const b=gameState.boss;
    drawBoss(b.x-camX,b.y-camY,b.angle,b);
    ctx.fillStyle='#fff'; ctx.font='bold 12px Courier New'; ctx.textAlign='center';
    ctx.fillText(b.name,b.x-camX,b.y-camY-50*b.size);
  }

  // Other players
  for(const p of (gameState.players||[])){
    if(p.id===myId) continue;
    const heli=HELI_CATALOG.find(h=>h.type===p.heliType)||HELI_CATALOG[0];
    drawHelicopter(ctx,p.x-camX,p.y-camY,p.angle,heli.color,false);
    ctx.fillStyle='#90d0ff'; ctx.font='11px Courier New'; ctx.textAlign='center';
    ctx.fillText(p.name,p.x-camX,p.y-camY-40);
  }

  // My helicopter
  if(myPlayer&&myPlayer.alive){
    const heli=HELI_CATALOG.find(h=>h.type===myPlayer.heliType)||HELI_CATALOG[0];
    drawHelicopter(ctx,myPlayer.x-camX,myPlayer.y-camY,myPlayer.angle,heli.color,true);
  }

  // Bunker target ring
  const hovBunker=getHoveredBunker();
  if(hovBunker){
    const bx=hovBunker.x-camX, by=hovBunker.y-camY;
    ctx.strokeStyle='rgba(255,80,40,0.8)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(bx,by,46,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(255,80,40,0.4)';
    ctx.beginPath(); ctx.arc(bx,by,54,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  drawMinimap();
  drawMissionHUD();
  drawBossHPBar();
  drawNotifications();

  // Shop hint
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.fillRect(W/2-90,H-34,180,24);
  ctx.fillStyle='#8a7a5a'; ctx.font='11px Courier New'; ctx.textAlign='center';
  ctx.fillText('Tab = Obchod  |  B = Bomba', W/2, H-17);
  ctx.restore();

  if(myPlayer&&myPlayer.alive){
    socket.emit('mouseAngle',Math.atan2(worldMouseY-myPlayer.y,worldMouseX-myPlayer.x));
  }
  if(myPlayer) updateHUD(myPlayer);
}

function getHoveredBunker(){
  const list=gameState?(gameState.bunkers||[]):bunkerData;
  for(const b of list){if(b.destroyed)continue;if(Math.hypot(worldMouseX-b.x,worldMouseY-b.y)<50)return b;}
  return null;
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown',(e)=>{
  const k=e.key.toLowerCase();
  if(k==='w') keys.w=true;
  if(k==='a') keys.a=true;
  if(k==='s') keys.s=true;
  if(k==='d') keys.d=true;
  if(k===' ') e.preventDefault();

  // B = BOMBA
  if(k==='b'){
    if(shopOpen){shopOpen=false;return;}
    if(myPlayer&&myPlayer.alive&&bombCooldown<=0){
      socket.emit('bomb');
      bombCooldown=180; // 3 seconds
    }
  }

  // Tab = obchod
  if(e.key==='Tab'){e.preventDefault();shopOpen=!shopOpen;}
});
document.addEventListener('keyup',(e)=>{
  const k=e.key.toLowerCase();
  if(k==='w') keys.w=false;
  if(k==='a') keys.a=false;
  if(k==='s') keys.s=false;
  if(k==='d') keys.d=false;
});

canvas.addEventListener('mousemove',(e)=>{
  mouseX=e.clientX; mouseY=e.clientY;
  document.getElementById('crosshair').style.left=mouseX+'px';
  document.getElementById('crosshair').style.top=mouseY+'px';
  document.getElementById('crosshair-ring').style.left=mouseX+'px';
  document.getElementById('crosshair-ring').style.top=mouseY+'px';
  document.getElementById('crosshair-ring').style.borderColor=getHoveredBunker()?'rgba(255,80,40,0.8)':'rgba(255,80,80,0.5)';
});

canvas.addEventListener('mousedown',(e)=>{
  // Shop click
  if(shopOpen){
    HELI_CATALOG.forEach(heli=>{
      if(!heli._rect) return;
      const r=heli._rect;
      if(e.clientX>=r.x&&e.clientX<=r.x+r.w&&e.clientY>=r.y&&e.clientY<=r.y+r.h){
        if(heli.price===0){
          // Free = always selectable
          selectedHeli=heli.type;
          localStorage.setItem('heliType',heli.type);
          socket.emit('buyHeli',{type:heli.type});
          addNotif(`✔ Přepnuto na ${heli.name}!`,'#5fe85a');
        } else {
          socket.emit('buyHeli',{type:heli.type});
        }
      }
    });
    return;
  }
  if(!myPlayer||!myPlayer.alive) return;
  if(e.button===0) shootHold=true;
  if(e.button===2){
    if(rocketCount<=0) return;
    const hovBunker=getHoveredBunker();
    const tx=hovBunker?hovBunker.x:worldMouseX, ty=hovBunker?hovBunker.y:worldMouseY;
    socket.emit('rocket',{worldX:tx,worldY:ty});
    rocketCount=Math.max(0,rocketCount-1);
    setTimeout(()=>{rocketCount=Math.min(MAX_ROCKETS,rocketCount+1);},8000);
  }
});
canvas.addEventListener('mouseup',(e)=>{if(e.button===0)shootHold=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// ─── INPUT LOOP ───────────────────────────────────────────────────────────────
setInterval(()=>{
  if(!myPlayer||!myPlayer.alive||shopOpen) return;
  socket.emit('input',{w:keys.w,a:keys.a,s:keys.s,d:keys.d});
  if(shootHold){
    if(shootCooldown<=0){socket.emit('shoot');shootCooldown=8;}
  }
  if(shootCooldown>0) shootCooldown--;
},1000/60);

// ─── SOCKET EVENTS ───────────────────────────────────────────────────────────
socket.on('init',(data)=>{
  myId=data.id; mapWidth=data.mapWidth; mapHeight=data.mapHeight;
  bunkerData=data.bunkers||[];
  currentMission=data.mission;
  generateDesertFeatures();
});

socket.on('gameState',(state)=>{
  gameState=state;
  myPlayer=state.players.find(p=>p.id===myId)||null;
  if(myPlayer) { savedCoins=myPlayer.coins; localStorage.setItem('coins',savedCoins); }
});

socket.on('missionStart',(data)=>{
  bunkerData=data.bunkers||[];
  currentMission=data.mission;
  rocketCount=MAX_ROCKETS; bombCooldown=0;
  addNotif(`🎯 MISE ${data.missionIndex+1}: ${data.mission.name}`,'#f0c040',6000);
  generateDesertFeatures();
});

socket.on('objectivesMet',(data)=>{
  addNotif(data.message,'#ff8800',5000);
});

socket.on('bossSpawn',(data)=>{
  addNotif(`☠ BOSS: ${data.bossName}`,'#ff2200',6000);
});

socket.on('bossEnraged',(data)=>{
  addNotif(`🔥 ${data.name} je ROZZUŘEN!`,'#ff0000',4000);
});

socket.on('missionComplete',(data)=>{
  addNotif(`✅ MISE SPLNĚNA! +${data.reward} mincí`,'#5fe85a',7000);
  if(data.hasNext) addNotif('Příští mise začíná za 10s...','#f0c040',7000);
  else addNotif('🏆 VŠECHNY MISE DOKONČENY!','#ffe060',10000);
});

socket.on('gameWon',()=>{
  addNotif('🏆 GRATULUJEME! Jsi vítěz pouštní války!','#ffe060',15000);
});

socket.on('purchaseOk',(data)=>{
  selectedHeli=data.heliType;
  localStorage.setItem('heliType',data.heliType);
  const heli=HELI_CATALOG.find(h=>h.type===data.heliType);
  addNotif(`✔ Zakoupeno: ${heli?.name||data.heliType}!`,'#5fe85a',4000);
});

socket.on('purchaseFail',(data)=>{ addNotif(`✖ ${data.message}`,'#e85a5a',3000); });

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
async function fetchLeaderboard(){
  try{
    const res=await fetch('/api/leaderboard');
    const data=await res.json();
    const lbRows=document.getElementById('lb-rows');
    if(!data||!data.length){lbRows.innerHTML='<div style="color:#5a4a2a;font-size:11px">Zatím žádné záznamy</div>';return;}
    lbRows.innerHTML=data.map((row,i)=>`<div class="lb-row"><span class="lb-name">${i+1}. ${row.player_name}</span><span class="lb-score">${row.score}</span></div>`).join('');
  }catch(e){}
}
fetchLeaderboard();
setInterval(fetchLeaderboard,30000);

// ─── START SCREEN ─────────────────────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click',()=>{
  const name=document.getElementById('name-input').value.trim()||'Pilot';
  socket.emit('join',{name,heliType:selectedHeli,savedCoins});
  document.getElementById('overlay').style.display='none';
});
document.getElementById('name-input').addEventListener('keydown',(e)=>{if(e.key==='Enter')document.getElementById('start-btn').click();});

render();
