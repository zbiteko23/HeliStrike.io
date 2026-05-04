require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin:'*', methods:['GET','POST'] } });
app.use(cors()); app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder-key'
);

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const TICK=60, MAP_W=3200, MAP_H=2200;
const BS=14, RS=8; // bullet/rocket speed
const BDMG=20, RDMG=80, BOMBDMG=130;
const NPC_DMG=12, COLL=22, BUNK_R=38;

// ── HELI STATS (mirrors client catalog) ──────────────────────────────────────
const HELI_STATS = {
  standard: { speed:5,   turn:0.06,  hp:100, dmgMult:1.0,  special:null },
  fast:     { speed:9,   turn:0.10,  hp:65,  dmgMult:0.65, special:null },
  heavy:    { speed:3,   turn:0.04,  hp:180, dmgMult:2.0,  special:null },
  laser:    { speed:5.5, turn:0.07,  hp:90,  dmgMult:0.4,  special:'laser' },
  stealth:  { speed:6.5, turn:0.08,  hp:85,  dmgMult:1.2,  special:'stealth' },
  rocket:   { speed:4,   turn:0.055, hp:110, dmgMult:3.5,  special:'rocketOnly' },
  medic:    { speed:5,   turn:0.06,  hp:120, dmgMult:0.9,  special:'regen' },
  dual:     { speed:4.5, turn:0.057, hp:100, dmgMult:0.85, special:'dual' },
};

// ── MISSION DEFINITIONS ──────────────────────────────────────────────────────
const MISSIONS = [
  { id:0, name:'Poušť v plamenech',  bunkReq:3,  killReq:5,  npcHp:40,  npcSpd:1.8, npcCnt:6,  boss:{name:'Pouštní Jestřáb', hp:300,  spd:2.0, shootRate:70, spread:3, size:1.5, color:'#c04020'}, reward:500  },
  { id:1, name:'Písečná Bouře',      bunkReq:5,  killReq:10, npcHp:50,  npcSpd:2.2, npcCnt:8,  boss:{name:'Generál Škorpión',hp:500,  spd:2.4, shootRate:55, spread:3, size:1.8, color:'#802080'}, reward:900  },
  { id:2, name:'Záchrana základny',  bunkReq:8,  killReq:15, npcHp:65,  npcSpd:2.6, npcCnt:10, boss:{name:'Titanový Varan',  hp:700,  spd:1.8, shootRate:45, spread:4, size:2.0, color:'#205080'}, reward:1400 },
  { id:3, name:'Útok na pevnost',    bunkReq:12, killReq:20, npcHp:80,  npcSpd:2.9, npcCnt:12, boss:{name:'Krvavý Orel',     hp:950,  spd:2.8, shootRate:38, spread:5, size:2.2, color:'#802000'}, reward:2200 },
  { id:4, name:'Finální Armageddon', bunkReq:16, killReq:30, npcHp:110, npcSpd:3.3, npcCnt:15, boss:{name:'VELITEL POUŠTĚ',  hp:1400, spd:3.0, shootRate:28, spread:6, size:2.8, color:'#300000'}, reward:4000 },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let players={}, bullets=[], rockets=[], bombs=[], npcs=[], bunkers=[], explosions=[];
let boss=null, bid=0;
let ms = { idx:0, phase:'active', bossSpawned:false }; // mission state

// ── HELPERS ──────────────────────────────────────────────────────────────────
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angTo=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
function boom(x,y,size){ const ml=size==='huge'?70:size==='large'?45:size==='medium'?28:15; explosions.push({x,y,size,life:ml,maxLife:ml}); }
function reward(id,coins,score){ const p=players[id]; if(!p)return; p.coins=(p.coins||0)+coins; p.score=(p.score||0)+score; }
function getMis(){ return MISSIONS[ms.idx]; }

// ── INIT MISSION ─────────────────────────────────────────────────────────────
function initMission(idx){
  const m=MISSIONS[idx];
  bullets=[];rockets=[];bombs=[];explosions=[];boss=null;
  ms={idx,phase:'active',bossSpawned:false};
  bunkers=[];
  for(let i=0;i<m.bunkReq+5;i++) bunkers.push({id:`b${i}`,x:300+Math.random()*(MAP_W-600),y:300+Math.random()*(MAP_H-600),hp:80,maxHp:80,destroyed:false,type:i%3===0?'large':'small'});
  npcs=[];
  for(let i=0;i<m.npcCnt;i++) spawnNPC(m);
  io.emit('missionStart',{mission:m,missionIndex:idx,bunkers});
}

function spawnNPC(m){ if(!m)m=getMis(); const e=Math.floor(Math.random()*4); let x=Math.random()*MAP_W,y=Math.random()*MAP_H; if(e===0)y=50;else if(e===1)y=MAP_H-50;else if(e===2)x=50;else x=MAP_W-50; npcs.push({id:`n${bid++}`,x,y,angle:Math.random()*Math.PI*2,hp:m.npcHp,maxHp:m.npcHp,speed:m.npcSpd,shootCd:0,stateT:0,alive:true}); }

function spawnBoss(){
  const b=getMis().boss;
  boss={x:MAP_W/2,y:200,angle:0,hp:b.hp,maxHp:b.hp,speed:b.spd,shootCd:0,name:b.name,color:b.color,size:b.size,bulletDmg:NPC_DMG*1.8,shootRate:b.shootRate,spread:b.spread,alive:true,enraged:false};
  ms.phase='bossPhase'; ms.bossSpawned=true;
  io.emit('bossSpawn',{bossName:b.name});
}

function checkProgress(){
  if(ms.phase!=='active'||ms.bossSpawned) return;
  const m=getMis();
  const tk=Object.values(players).reduce((s,p)=>s+(p.kills||0),0);
  const db=bunkers.filter(b=>b.destroyed).length;
  if(tk>=m.killReq&&db>=m.bunkReq){ io.emit('objectivesMet',{message:'✅ Cíle splněny! Boss přichází za 3s...'}); setTimeout(spawnBoss,3000); }
}

function checkBossDead(){
  if(!boss||boss.alive) return;
  const m=getMis(); ms.phase='missionComplete';
  Object.keys(players).forEach(id=>{ players[id].coins=(players[id].coins||0)+m.reward; players[id].score=(players[id].score||0)+m.reward; });
  io.emit('missionComplete',{missionIndex:ms.idx,reward:m.reward,hasNext:ms.idx<MISSIONS.length-1});
  if(ms.idx<MISSIONS.length-1) setTimeout(()=>initMission(ms.idx+1),12000);
  else setTimeout(()=>io.emit('gameWon',{}),2000);
}

// ── GAME LOOP ────────────────────────────────────────────────────────────────
initMission(0);

setInterval(()=>{
  const plist=Object.values(players);

  // ── NPC ──
  for(let i=npcs.length-1;i>=0;i--){
    const n=npcs[i]; if(!n.alive){npcs.splice(i,1);continue;}
    n.shootCd=Math.max(0,n.shootCd-1); n.stateT=Math.max(0,n.stateT-1);
    let near=null,nd=Infinity;
    for(const p of plist){
      // stealth: NPC ignores stealth players beyond 200px
      const hs=HELI_STATS[p.heliType]||HELI_STATS.standard;
      const d=dist(n,p);
      if(hs.special==='stealth'&&d>200) continue;
      if(d<nd){nd=d;near=p;}
    }
    if(near&&nd<650){
      const a=angTo(n,near); n.angle=a;
      n.x+=Math.cos(a)*n.speed; n.y+=Math.sin(a)*n.speed;
      if(n.shootCd===0&&nd<420){ n.shootCd=90; bullets.push({id:`b${bid++}`,x:n.x,y:n.y,vx:Math.cos(a)*BS,vy:Math.sin(a)*BS,owner:n.id,isNPC:true,dmg:NPC_DMG,life:65,isLaser:false}); }
    } else {
      if(n.stateT===0){n.angle+=(Math.random()-0.5)*0.9;n.stateT=70+Math.floor(Math.random()*60);}
      n.x+=Math.cos(n.angle)*n.speed*0.5; n.y+=Math.sin(n.angle)*n.speed*0.5;
    }
    n.x=Math.max(30,Math.min(MAP_W-30,n.x)); n.y=Math.max(30,Math.min(MAP_H-30,n.y));
  }
  if(ms.phase==='active'&&npcs.length<getMis().npcCnt&&Math.random()<0.005) spawnNPC();

  // ── REGEN ──
  for(const p of plist){
    if(!p.alive) continue;
    const hs=HELI_STATS[p.heliType]||HELI_STATS.standard;
    if(hs.special==='regen'){ p.hp=Math.min(hs.hp, (p.hp||0)+1/60); } // +1 HP/s
  }

  // ── BOSS ──
  if(boss&&boss.alive){
    boss.shootCd=Math.max(0,boss.shootCd-1);
    if(boss.hp<boss.maxHp*0.3&&!boss.enraged){boss.enraged=true;boss.speed*=1.5;boss.shootRate=Math.floor(boss.shootRate*0.5);io.emit('bossEnraged',{name:boss.name});}
    let tgt=null,td=Infinity;
    for(const p of plist){const d=dist(boss,p);if(d<td){td=d;tgt=p;}}
    if(tgt){
      const a=angTo(boss,tgt); boss.angle=a;
      boss.x+=Math.cos(a)*boss.speed; boss.y+=Math.sin(a)*boss.speed;
      boss.x=Math.max(60,Math.min(MAP_W-60,boss.x)); boss.y=Math.max(60,Math.min(MAP_H-60,boss.y));
      if(boss.shootCd===0){
        boss.shootCd=boss.shootRate;
        const sp=boss.enraged?boss.spread+2:boss.spread;
        for(let s=0;s<sp;s++){const sa=a+(s-Math.floor(sp/2))*0.22;bullets.push({id:`b${bid++}`,x:boss.x,y:boss.y,vx:Math.cos(sa)*BS*1.2,vy:Math.sin(sa)*BS*1.2,owner:'boss',isNPC:true,dmg:boss.bulletDmg,life:80,isLaser:false});}
      }
    }
  }

  // ── BULLETS ──
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.x<0||b.x>MAP_W||b.y<0||b.y>MAP_H){bullets.splice(i,1);continue;}
    if(!b.isNPC){
      // laser bullets have bigger hit radius
      const hr = b.isLaser ? COLL*1.5 : COLL;
      let hit=false;
      for(let j=npcs.length-1;j>=0;j--){ if(dist(b,npcs[j])<hr){npcs[j].hp-=(b.dmg||BDMG);boom(b.x,b.y,'small');bullets.splice(i,1);hit=true;if(npcs[j].hp<=0){boom(npcs[j].x,npcs[j].y,'medium');if(players[b.owner]){players[b.owner].kills++;reward(b.owner,30,100);}npcs.splice(j,1);checkProgress();}break;} }
      if(hit)continue;
      if(boss&&boss.alive&&dist(b,boss)<COLL*boss.size){boss.hp-=(b.dmg||BDMG);boom(b.x,b.y,'small');bullets.splice(i,1);if(boss.hp<=0){boss.alive=false;boom(boss.x,boss.y,'huge');checkBossDead();}continue;}
    } else {
      for(const p of plist){
        if(!p.alive)continue;
        if(dist(b,p)<COLL){
          p.hp-=(b.dmg||NPC_DMG); boom(b.x,b.y,'small'); bullets.splice(i,1);
          if(p.hp<=0){ p.hp=0; p.alive=false; io.to(p.id).emit('playerDied'); setTimeout(()=>{if(players[p.id]){players[p.id].hp=HELI_STATS[players[p.id].heliType]?.hp||100;players[p.id].alive=true;}},4000); }
          break;
        }
      }
    }
  }

  // ── ROCKETS ──
  for(let i=rockets.length-1;i>=0;i--){
    const r=rockets[i];
    if(r.targetX!==undefined){let df=Math.atan2(r.targetY-r.y,r.targetX-r.x)-r.angle;while(df>Math.PI)df-=2*Math.PI;while(df<-Math.PI)df+=2*Math.PI;r.angle+=Math.sign(df)*Math.min(Math.abs(df),0.07);}
    r.vx=Math.cos(r.angle)*RS;r.vy=Math.sin(r.angle)*RS;r.x+=r.vx;r.y+=r.vy;r.life--;
    if(r.life<=0||r.x<0||r.x>MAP_W||r.y<0||r.y>MAP_H){boom(r.x,r.y,'large');rockets.splice(i,1);continue;}
    let hit=false;
    for(let j=bunkers.length-1;j>=0;j--){const bk=bunkers[j];if(!bk.destroyed&&dist(r,bk)<BUNK_R){bk.hp-=RDMG;boom(r.x,r.y,'large');rockets.splice(i,1);hit=true;if(bk.hp<=0){bk.destroyed=true;boom(bk.x,bk.y,'huge');reward(r.owner,80,300);checkProgress();}break;}}
    if(hit)continue;
    for(let j=npcs.length-1;j>=0;j--){if(dist(r,npcs[j])<COLL*1.5){npcs[j].hp-=RDMG;boom(r.x,r.y,'large');rockets.splice(i,1);hit=true;if(npcs[j].hp<=0){boom(npcs[j].x,npcs[j].y,'medium');reward(r.owner,50,150);npcs.splice(j,1);checkProgress();}break;}}
    if(hit)continue;
    if(boss&&boss.alive&&dist(r,boss)<COLL*boss.size*1.5){boss.hp-=RDMG;boom(r.x,r.y,'large');rockets.splice(i,1);if(boss.hp<=0){boss.alive=false;boom(boss.x,boss.y,'huge');checkBossDead();}}
  }

  // ── BOMBS ──
  for(let i=bombs.length-1;i>=0;i--){
    const bm=bombs[i]; bm.vy+=0.22; bm.x+=bm.vx; bm.y+=bm.vy; bm.life--;
    if(bm.life<=0||bm.x<0||bm.x>MAP_W||bm.y<0||bm.y>MAP_H){
      boom(bm.x,bm.y,'large'); const sr=115;
      for(const bk of bunkers){if(!bk.destroyed&&dist(bm,bk)<sr){bk.hp-=BOMBDMG;if(bk.hp<=0){bk.destroyed=true;boom(bk.x,bk.y,'huge');reward(bm.owner,80,300);checkProgress();}}}
      for(let j=npcs.length-1;j>=0;j--){if(dist(bm,npcs[j])<sr){npcs[j].hp-=BOMBDMG;if(npcs[j].hp<=0){boom(npcs[j].x,npcs[j].y,'medium');reward(bm.owner,50,150);npcs.splice(j,1);checkProgress();}}}
      if(boss&&boss.alive&&dist(bm,boss)<sr){boss.hp-=BOMBDMG;if(boss.hp<=0){boss.alive=false;boom(boss.x,boss.y,'huge');checkBossDead();}}
      bombs.splice(i,1);
    }
  }

  for(let i=explosions.length-1;i>=0;i--){explosions[i].life--;if(explosions[i].life<=0)explosions.splice(i,1);}

  const m=getMis();
  const tk=Object.values(players).reduce((s,p)=>s+(p.kills||0),0);
  const db=bunkers.filter(b=>b.destroyed).length;

  io.emit('gameState',{
    players:Object.values(players).map(p=>({id:p.id,x:p.x,y:p.y,angle:p.angle,hp:Math.round(p.hp),alive:p.alive,name:p.name,score:p.score,kills:p.kills,coins:p.coins,heliType:p.heliType})),
    bullets:bullets.map(b=>({id:b.id,x:b.x,y:b.y,isNPC:b.isNPC,isLaser:b.isLaser})),
    rockets:rockets.map(r=>({id:r.id,x:r.x,y:r.y,angle:r.angle})),
    bombs:bombs.map(b=>({id:b.id,x:b.x,y:b.y})),
    npcs:npcs.map(n=>({id:n.id,x:n.x,y:n.y,angle:n.angle,hp:n.hp,maxHp:n.maxHp})),
    bunkers:bunkers.map(b=>({id:b.id,x:b.x,y:b.y,hp:b.hp,maxHp:b.maxHp,destroyed:b.destroyed,type:b.type})),
    explosions:explosions.map(e=>({x:e.x,y:e.y,size:e.size,life:e.life,maxLife:e.maxLife})),
    boss:boss?{x:boss.x,y:boss.y,angle:boss.angle,hp:Math.round(boss.hp),maxHp:boss.maxHp,name:boss.name,color:boss.color,size:boss.size,alive:boss.alive,enraged:boss.enraged}:null,
    mission:{index:ms.idx,phase:ms.phase,killsRequired:m.killReq,bunkersRequired:m.bunkReq,totalKills:tk,destroyedBunkers:db,name:m.name}
  });
}, 1000/TICK);

// ── SOCKET ───────────────────────────────────────────────────────────────────
io.on('connection', socket=>{
  socket.on('join', data=>{
    const hs=HELI_STATS[data.heliType]||HELI_STATS.standard;
    players[socket.id]={
      id:socket.id, name:(data.name||'Pilot').slice(0,16),
      x:500+Math.random()*400, y:500+Math.random()*400,
      angle:0, hp:hs.hp, alive:true,
      score:0, kills:0, coins:data.savedCoins||0,
      heliType:data.heliType||'standard', mode:data.mode||'practice'
    };
    socket.emit('init',{id:socket.id,mapWidth:MAP_W,mapHeight:MAP_H,bunkers,mission:getMis(),missionIndex:ms.idx});
    // If joining mid-mission and boss is alive
    if(boss&&boss.alive) socket.emit('bossSpawn',{bossName:boss.name});
  });

  socket.on('input', input=>{
    const p=players[socket.id]; if(!p?.alive) return;
    const hs=HELI_STATS[p.heliType]||HELI_STATS.standard;
    if(input.a) p.angle-=hs.turn;
    if(input.d) p.angle+=hs.turn;
    if(input.w){p.x+=Math.cos(p.angle)*hs.speed;p.y+=Math.sin(p.angle)*hs.speed;}
    if(input.s){p.x-=Math.cos(p.angle)*hs.speed*0.5;p.y-=Math.sin(p.angle)*hs.speed*0.5;}
    p.x=Math.max(20,Math.min(MAP_W-20,p.x)); p.y=Math.max(20,Math.min(MAP_H-20,p.y));
  });

  socket.on('mouseAngle', angle=>{ const p=players[socket.id]; if(p) p.angle=angle; });

  socket.on('shoot', ()=>{
    const p=players[socket.id]; if(!p?.alive) return;
    const hs=HELI_STATS[p.heliType]||HELI_STATS.standard;
    const dmg=BDMG*hs.dmgMult;
    const ax=p.x+Math.cos(p.angle)*28, ay=p.y+Math.sin(p.angle)*28;

    if(hs.special==='rocketOnly'){
      // Hydra: every shoot = mini rocket toward mouse direction
      rockets.push({id:`r${bid++}`,x:ax,y:ay,angle:p.angle,vx:Math.cos(p.angle)*RS,vy:Math.sin(p.angle)*RS,targetX:undefined,targetY:undefined,owner:socket.id,life:160});
      return;
    }
    if(hs.special==='laser'){
      // Laser: long-range instant bullet
      bullets.push({id:`b${bid++}`,x:ax,y:ay,vx:Math.cos(p.angle)*22,vy:Math.sin(p.angle)*22,owner:socket.id,isNPC:false,dmg:dmg,life:55,isLaser:true});
      return;
    }
    if(hs.special==='dual'){
      // Dual: 2 bullets with slight spread
      for(let s=-1;s<=1;s+=2){
        const sa=p.angle+s*0.12;
        bullets.push({id:`b${bid++}`,x:ax,y:ay,vx:Math.cos(sa)*BS,vy:Math.sin(sa)*BS,owner:socket.id,isNPC:false,dmg:dmg,life:70,isLaser:false});
      }
      return;
    }
    // Default
    bullets.push({id:`b${bid++}`,x:ax,y:ay,vx:Math.cos(p.angle)*BS,vy:Math.sin(p.angle)*BS,owner:socket.id,isNPC:false,dmg,life:70,isLaser:false});
  });

  socket.on('rocket', data=>{
    const p=players[socket.id]; if(!p?.alive) return;
    const a=Math.atan2(data.worldY-p.y,data.worldX-p.x);
    rockets.push({id:`r${bid++}`,x:p.x+Math.cos(p.angle)*28,y:p.y+Math.sin(p.angle)*28,angle:a,vx:Math.cos(a)*RS,vy:Math.sin(a)*RS,targetX:data.worldX,targetY:data.worldY,owner:socket.id,life:220});
  });

  socket.on('bomb', ()=>{
    const p=players[socket.id]; if(!p?.alive) return;
    bombs.push({id:`bm${bid++}`,x:p.x,y:p.y,vx:Math.cos(p.angle)*2.5,vy:-1.8,owner:socket.id,life:140});
  });

  socket.on('buyHeli', data=>{
    const p=players[socket.id]; if(!p) return;
    const prices={fast:1200,heavy:2000,laser:3500,stealth:2800,rocket:4000,medic:1800,dual:2500};
    const price=prices[data.type];
    if(!price){
      // Free heli (standard) or already owned - just switch
      p.heliType=data.type;
      const hs=HELI_STATS[data.type]||HELI_STATS.standard;
      p.hp=Math.min(p.hp,hs.hp);
      socket.emit('purchaseOk',{heliType:p.heliType,coins:p.coins});
      return;
    }
    if(p.coins<price){socket.emit('purchaseFail',{message:'Nedostatek mincí!'});return;}
    p.coins-=price; p.heliType=data.type;
    const hs=HELI_STATS[data.type]||HELI_STATS.standard;
    p.hp=hs.hp; // full HP on new heli
    socket.emit('purchaseOk',{heliType:p.heliType,coins:p.coins});
  });

  socket.on('disconnect', async()=>{
    const p=players[socket.id];
    if(p?.score>0){try{await supabase.from('scores').insert({player_name:p.name,score:p.score,kills:p.kills,bunkers_destroyed:0});}catch(e){}}
    delete players[socket.id];
  });
});

app.get('/api/leaderboard', async(req,res)=>{
  try{const{data,error}=await supabase.from('scores').select('player_name,score,kills,created_at').order('score',{ascending:false}).limit(10);if(error)throw error;res.json(data);}catch{res.json([]);}
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🚁 Server na portu ${PORT}`));
