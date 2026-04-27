require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder-key'
);

const TICK = 60, MAP_W = 3200, MAP_H = 2200;
const BULLET_SPEED = 14, ROCKET_SPEED = 8;
const PLAYER_HP = 100, BULLET_DMG = 20, ROCKET_DMG = 80, BOMB_DMG = 120;
const NPC_DMG = 12, COLL_R = 22, BUNKER_R = 38;

const MISSIONS = [
  { id:1, name:'Poušť v plamenech', description:'Znič 3 bunkry a eliminuj 5 nepřátel.', bunkersRequired:3, killsRequired:5, npcCount:6, npcHp:40, npcSpeed:1.8, boss:{ name:'Pouštní Jestřáb', hp:300, speed:2.0, bulletDmg:20, shootRate:70, size:1.5, color:'#c04020', reward:500 } },
  { id:2, name:'Operace Písečná Bouře', description:'Eliminuj 10 vrtulníků a znič 5 bunkrů.', bunkersRequired:5, killsRequired:10, npcCount:8, npcHp:50, npcSpeed:2.2, boss:{ name:'Generál Škorpión', hp:450, speed:2.4, bulletDmg:25, shootRate:55, size:1.8, color:'#802080', reward:800 } },
  { id:3, name:'Záchrana základny', description:'Znič 8 bunkrů a 15 nepřátel.', bunkersRequired:8, killsRequired:15, npcCount:10, npcHp:60, npcSpeed:2.5, boss:{ name:'Titanový Varan', hp:600, speed:1.8, bulletDmg:30, shootRate:45, size:2.0, color:'#205080', reward:1200 } },
  { id:4, name:'Útok na pevnost', description:'Prolomí pevnost. 12 bunkrů, 20 nepřátel.', bunkersRequired:12, killsRequired:20, npcCount:12, npcHp:75, npcSpeed:2.8, boss:{ name:'Krvavý Orel', hp:800, speed:2.8, bulletDmg:35, shootRate:40, size:2.2, color:'#802000', reward:1800 } },
  { id:5, name:'Finální Armageddon', description:'Poslední bitva. Zničit vše.', bunkersRequired:16, killsRequired:30, npcCount:15, npcHp:100, npcSpeed:3.2, boss:{ name:'VELITEL POUŠTĚ', hp:1200, speed:3.0, bulletDmg:40, shootRate:30, size:2.8, color:'#300000', reward:3000 } }
];

let players = {}, bullets = [], rockets = [], bombs = [], npcs = [], bunkers = [], explosions = [];
let boss = null, bulletId = 0;
let missionState = { missionIndex:0, phase:'active', bossSpawned:false };

function getMission() { return MISSIONS[missionState.missionIndex]; }
function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
function angleTo(a,b) { return Math.atan2(b.y-a.y, b.x-a.x); }
function addExplosion(x,y,size) { const ml=size==='huge'?70:size==='large'?45:size==='medium'?28:15; explosions.push({x,y,size,life:ml,maxLife:ml}); }
function giveReward(id, coins, score) { const p=players[id]; if(!p) return; p.coins=(p.coins||0)+coins; p.score=(p.score||0)+score; }

function initMission(index) {
  const m = MISSIONS[index];
  bullets=[]; rockets=[]; bombs=[]; explosions=[]; boss=null;
  missionState = { missionIndex:index, phase:'active', bossSpawned:false };
  bunkers=[];
  const count = m.bunkersRequired + 5;
  for(let i=0;i<count;i++) bunkers.push({ id:`b${i}`, x:300+Math.random()*(MAP_W-600), y:300+Math.random()*(MAP_H-600), hp:80, maxHp:80, destroyed:false, type:i%3===0?'large':'small' });
  npcs=[];
  for(let i=0;i<m.npcCount;i++) spawnNPC(m);
  io.emit('missionStart', { mission:m, missionIndex:index, bunkers });
}

function spawnNPC(m) {
  if(!m) m=getMission();
  const edge=Math.floor(Math.random()*4);
  let x=Math.random()*MAP_W, y=Math.random()*MAP_H;
  if(edge===0) y=50; else if(edge===1) y=MAP_H-50; else if(edge===2) x=50; else x=MAP_W-50;
  npcs.push({ id:`npc_${bulletId++}`, x, y, angle:Math.random()*Math.PI*2, hp:m.npcHp, maxHp:m.npcHp, speed:m.npcSpeed, shootCd:0, stateTimer:0, alive:true });
}

function spawnBoss() {
  const b = getMission().boss;
  boss = { x:MAP_W/2, y:200, angle:0, hp:b.hp, maxHp:b.hp, speed:b.speed, shootCd:0, name:b.name, color:b.color, size:b.size, bulletDmg:b.bulletDmg, shootRate:b.shootRate, alive:true, enraged:false };
  missionState.phase='bossPhase'; missionState.bossSpawned=true;
  io.emit('bossSpawn', { bossName:b.name });
}

function checkMissionProgress() {
  if(missionState.phase!=='active' || missionState.bossSpawned) return;
  const m=getMission();
  const totalKills=Object.values(players).reduce((s,p)=>s+(p.kills||0),0);
  const destroyedBunkers=bunkers.filter(b=>b.destroyed).length;
  if(totalKills>=m.killsRequired && destroyedBunkers>=m.bunkersRequired) {
    io.emit('objectivesMet', { message:'Všechny cíle splněny! Boss přichází!' });
    setTimeout(()=>spawnBoss(), 3000);
  }
}

function checkBossDead() {
  if(!boss||boss.alive) return;
  const m=getMission();
  missionState.phase='missionComplete';
  Object.keys(players).forEach(id=>{ players[id].coins=(players[id].coins||0)+m.boss.reward; players[id].score=(players[id].score||0)+m.boss.reward; });
  io.emit('missionComplete', { missionIndex:missionState.missionIndex, reward:m.boss.reward, hasNext:missionState.missionIndex<MISSIONS.length-1 });
  if(missionState.missionIndex<MISSIONS.length-1) setTimeout(()=>initMission(missionState.missionIndex+1), 10000);
  else { missionState.phase='allDone'; io.emit('gameWon', {}); }
}

initMission(0);

setInterval(() => {
  const playerList=Object.values(players);

  // NPC update
  for(let i=npcs.length-1;i>=0;i--) {
    const n=npcs[i];
    n.shootCd=Math.max(0,n.shootCd-1); n.stateTimer=Math.max(0,n.stateTimer-1);
    let nearest=null,nd=Infinity;
    for(const p of playerList) { const d=dist(n,p); if(d<nd){nd=d;nearest=p;} }
    if(nearest&&nd<650) {
      const a=angleTo(n,nearest); n.angle=a;
      n.x+=Math.cos(a)*n.speed; n.y+=Math.sin(a)*n.speed;
      if(n.shootCd===0&&nd<420) { n.shootCd=85; bullets.push({id:`b${bulletId++}`,x:n.x,y:n.y,vx:Math.cos(a)*BULLET_SPEED,vy:Math.sin(a)*BULLET_SPEED,owner:n.id,isNPC:true,dmg:NPC_DMG,life:65}); }
    } else {
      if(n.stateTimer===0){n.angle+=(Math.random()-0.5)*0.9;n.stateTimer=70+Math.floor(Math.random()*60);}
      n.x+=Math.cos(n.angle)*n.speed*0.5; n.y+=Math.sin(n.angle)*n.speed*0.5;
    }
    n.x=Math.max(30,Math.min(MAP_W-30,n.x)); n.y=Math.max(30,Math.min(MAP_H-30,n.y));
  }
  if(missionState.phase==='active'&&npcs.length<getMission().npcCount&&Math.random()<0.004) spawnNPC();

  // Boss update
  if(boss&&boss.alive) {
    boss.shootCd=Math.max(0,boss.shootCd-1);
    if(boss.hp<boss.maxHp*0.3&&!boss.enraged){boss.enraged=true;boss.speed*=1.5;boss.shootRate=Math.floor(boss.shootRate*0.5);io.emit('bossEnraged',{name:boss.name});}
    let target=null,td=Infinity;
    for(const p of playerList){const d=dist(boss,p);if(d<td){td=d;target=p;}}
    if(target){
      const a=angleTo(boss,target); boss.angle=a;
      boss.x+=Math.cos(a)*boss.speed; boss.y+=Math.sin(a)*boss.speed;
      boss.x=Math.max(60,Math.min(MAP_W-60,boss.x)); boss.y=Math.max(60,Math.min(MAP_H-60,boss.y));
      if(boss.shootCd===0){
        boss.shootCd=boss.shootRate;
        const spread=boss.enraged?5:3;
        for(let s=0;s<spread;s++){const sa=a+(s-Math.floor(spread/2))*0.22;bullets.push({id:`b${bulletId++}`,x:boss.x,y:boss.y,vx:Math.cos(sa)*BULLET_SPEED*1.2,vy:Math.sin(sa)*BULLET_SPEED*1.2,owner:'boss',isNPC:true,dmg:boss.bulletDmg,life:80});}
      }
    }
  }

  // Bullets
  for(let i=bullets.length-1;i>=0;i--) {
    const b=bullets[i]; b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.x<0||b.x>MAP_W||b.y<0||b.y>MAP_H){bullets.splice(i,1);continue;}
    if(!b.isNPC) {
      let hit=false;
      for(let j=npcs.length-1;j>=0;j--){if(dist(b,npcs[j])<COLL_R){npcs[j].hp-=(b.dmg||BULLET_DMG);addExplosion(b.x,b.y,'small');bullets.splice(i,1);hit=true;if(npcs[j].hp<=0){addExplosion(npcs[j].x,npcs[j].y,'medium');if(players[b.owner]){players[b.owner].kills++;giveReward(b.owner,30,100);}npcs.splice(j,1);checkMissionProgress();}break;}}
      if(hit) continue;
      if(boss&&boss.alive&&dist(b,boss)<COLL_R*boss.size){boss.hp-=(b.dmg||BULLET_DMG);addExplosion(b.x,b.y,'small');bullets.splice(i,1);if(boss.hp<=0){boss.alive=false;addExplosion(boss.x,boss.y,'huge');checkBossDead();}continue;}
    } else {
      for(const p of playerList){if(!p.alive)continue;if(dist(b,p)<COLL_R){p.hp-=(b.dmg||NPC_DMG);addExplosion(b.x,b.y,'small');bullets.splice(i,1);if(p.hp<=0){p.hp=0;p.alive=false;setTimeout(()=>{if(players[p.id]){players[p.id].hp=PLAYER_HP;players[p.id].alive=true;}},4000);}break;}}
    }
  }

  // Rockets
  for(let i=rockets.length-1;i>=0;i--) {
    const r=rockets[i];
    if(r.targetX!==undefined){let diff=Math.atan2(r.targetY-r.y,r.targetX-r.x)-r.angle;while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;r.angle+=Math.sign(diff)*Math.min(Math.abs(diff),0.07);}
    r.vx=Math.cos(r.angle)*ROCKET_SPEED;r.vy=Math.sin(r.angle)*ROCKET_SPEED;r.x+=r.vx;r.y+=r.vy;r.life--;
    if(r.life<=0||r.x<0||r.x>MAP_W||r.y<0||r.y>MAP_H){addExplosion(r.x,r.y,'large');rockets.splice(i,1);continue;}
    let hit=false;
    for(let j=bunkers.length-1;j>=0;j--){const bunk=bunkers[j];if(!bunk.destroyed&&dist(r,bunk)<BUNKER_R){bunk.hp-=ROCKET_DMG;addExplosion(r.x,r.y,'large');rockets.splice(i,1);hit=true;if(bunk.hp<=0){bunk.destroyed=true;addExplosion(bunk.x,bunk.y,'huge');giveReward(r.owner,80,300);checkMissionProgress();}break;}}
    if(hit) continue;
    for(let j=npcs.length-1;j>=0;j--){if(dist(r,npcs[j])<COLL_R*1.5){npcs[j].hp-=ROCKET_DMG;addExplosion(r.x,r.y,'large');rockets.splice(i,1);hit=true;if(npcs[j].hp<=0){addExplosion(npcs[j].x,npcs[j].y,'medium');giveReward(r.owner,50,150);npcs.splice(j,1);checkMissionProgress();}break;}}
    if(hit) continue;
    if(boss&&boss.alive&&dist(r,boss)<COLL_R*boss.size*1.5){boss.hp-=ROCKET_DMG;addExplosion(r.x,r.y,'large');rockets.splice(i,1);if(boss.hp<=0){boss.alive=false;addExplosion(boss.x,boss.y,'huge');checkBossDead();}}
  }

  // Bombs
  for(let i=bombs.length-1;i>=0;i--) {
    const bomb=bombs[i]; bomb.vy+=0.2; bomb.x+=bomb.vx; bomb.y+=bomb.vy; bomb.life--;
    if(bomb.life<=0||bomb.x<0||bomb.x>MAP_W||bomb.y<0||bomb.y>MAP_H){
      addExplosion(bomb.x,bomb.y,'large');
      const sr=110;
      for(const bunk of bunkers){if(!bunk.destroyed&&dist(bomb,bunk)<sr){bunk.hp-=BOMB_DMG;if(bunk.hp<=0){bunk.destroyed=true;addExplosion(bunk.x,bunk.y,'huge');giveReward(bomb.owner,80,300);checkMissionProgress();}}}
      for(let j=npcs.length-1;j>=0;j--){if(dist(bomb,npcs[j])<sr){npcs[j].hp-=BOMB_DMG;if(npcs[j].hp<=0){addExplosion(npcs[j].x,npcs[j].y,'medium');giveReward(bomb.owner,50,150);npcs.splice(j,1);checkMissionProgress();}}}
      if(boss&&boss.alive&&dist(bomb,boss)<sr){boss.hp-=BOMB_DMG;if(boss.hp<=0){boss.alive=false;addExplosion(boss.x,boss.y,'huge');checkBossDead();}}
      bombs.splice(i,1);
    }
  }

  for(let i=explosions.length-1;i>=0;i--){explosions[i].life--;if(explosions[i].life<=0)explosions.splice(i,1);}

  const m=getMission();
  const totalKills=Object.values(players).reduce((s,p)=>s+(p.kills||0),0);
  const destroyedBunkers=bunkers.filter(b=>b.destroyed).length;

  io.emit('gameState', {
    players:Object.values(players).map(p=>({id:p.id,x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,name:p.name,score:p.score,kills:p.kills,coins:p.coins,heliType:p.heliType})),
    bullets:bullets.map(b=>({id:b.id,x:b.x,y:b.y,isNPC:b.isNPC})),
    rockets:rockets.map(r=>({id:r.id,x:r.x,y:r.y,angle:r.angle})),
    bombs:bombs.map(b=>({id:b.id,x:b.x,y:b.y})),
    npcs:npcs.map(n=>({id:n.id,x:n.x,y:n.y,angle:n.angle,hp:n.hp,maxHp:n.maxHp})),
    bunkers:bunkers.map(b=>({id:b.id,x:b.x,y:b.y,hp:b.hp,maxHp:b.maxHp,destroyed:b.destroyed,type:b.type})),
    explosions:explosions.map(e=>({x:e.x,y:e.y,size:e.size,life:e.life,maxLife:e.maxLife})),
    boss:boss?{x:boss.x,y:boss.y,angle:boss.angle,hp:boss.hp,maxHp:boss.maxHp,name:boss.name,color:boss.color,size:boss.size,alive:boss.alive,enraged:boss.enraged}:null,
    mission:{index:missionState.missionIndex,phase:missionState.phase,killsRequired:m.killsRequired,bunkersRequired:m.bunkersRequired,totalKills,destroyedBunkers,name:m.name,description:m.description}
  });
}, 1000/TICK);

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    players[socket.id] = { id:socket.id, name:(data.name||'Pilot').slice(0,16), x:500+Math.random()*400, y:500+Math.random()*400, angle:0, hp:data.heliType==='heavy'?150:PLAYER_HP, alive:true, score:0, kills:0, coins:data.savedCoins||0, heliType:data.heliType||'standard' };
    socket.emit('init', { id:socket.id, mapWidth:MAP_W, mapHeight:MAP_H, bunkers, mission:getMission(), missionIndex:missionState.missionIndex });
  });

  socket.on('input', (input) => {
    const p=players[socket.id]; if(!p||!p.alive) return;
    const stats={standard:{speed:5,turnRate:0.06},fast:{speed:8.5,turnRate:0.09},heavy:{speed:3,turnRate:0.04}}[p.heliType]||{speed:5,turnRate:0.06};
    if(input.a) p.angle-=stats.turnRate;
    if(input.d) p.angle+=stats.turnRate;
    if(input.w){p.x+=Math.cos(p.angle)*stats.speed;p.y+=Math.sin(p.angle)*stats.speed;}
    if(input.s){p.x-=Math.cos(p.angle)*stats.speed*0.5;p.y-=Math.sin(p.angle)*stats.speed*0.5;}
    p.x=Math.max(20,Math.min(MAP_W-20,p.x)); p.y=Math.max(20,Math.min(MAP_H-20,p.y));
  });

  socket.on('shoot', () => {
    const p=players[socket.id]; if(!p||!p.alive) return;
    const dmg=p.heliType==='heavy'?BULLET_DMG*1.8:p.heliType==='fast'?BULLET_DMG*0.7:BULLET_DMG;
    bullets.push({id:`b${bulletId++}`,x:p.x+Math.cos(p.angle)*28,y:p.y+Math.sin(p.angle)*28,vx:Math.cos(p.angle)*BULLET_SPEED,vy:Math.sin(p.angle)*BULLET_SPEED,owner:socket.id,isNPC:false,dmg,life:70});
  });

  socket.on('rocket', (data) => {
    const p=players[socket.id]; if(!p||!p.alive) return;
    const a=Math.atan2(data.worldY-p.y,data.worldX-p.x);
    rockets.push({id:`r${bulletId++}`,x:p.x+Math.cos(p.angle)*28,y:p.y+Math.sin(p.angle)*28,angle:a,vx:Math.cos(a)*ROCKET_SPEED,vy:Math.sin(a)*ROCKET_SPEED,targetX:data.worldX,targetY:data.worldY,owner:socket.id,life:200});
  });

  socket.on('bomb', () => {
    const p=players[socket.id]; if(!p||!p.alive) return;
    bombs.push({id:`bomb${bulletId++}`,x:p.x,y:p.y,vx:Math.cos(p.angle)*2.5,vy:-1.5,owner:socket.id,life:140});
  });

  socket.on('buyHeli', (data) => {
    const p=players[socket.id]; if(!p) return;
    const prices={fast:400,heavy:700};
    const price=prices[data.type];
    if(!price||p.coins<price){socket.emit('purchaseFail',{message:'Nedostatek mincí!'});return;}
    p.coins-=price; p.heliType=data.type;
    if(data.type==='heavy'&&p.hp<150) p.hp=150;
    socket.emit('purchaseOk',{heliType:p.heliType,coins:p.coins});
  });

  socket.on('disconnect', async () => {
    const p=players[socket.id];
    if(p&&p.score>0){try{await supabase.from('scores').insert({player_name:p.name,score:p.score,kills:p.kills,bunkers_destroyed:0});}catch(e){}}
    delete players[socket.id];
  });
});

app.get('/api/leaderboard', async (req,res) => {
  try{const{data,error}=await supabase.from('scores').select('player_name,score,kills,bunkers_destroyed,created_at').order('score',{ascending:false}).limit(10);if(error)throw error;res.json(data);}catch{res.json([]);}
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Server na portu ${PORT}`));
