require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder-key'
);

// ─── GAME CONSTANTS ────────────────────────────────────────────────────────────
const TICK_RATE = 60;
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 2000;
const BUNKER_COUNT = 12;
const MAX_NPC = 6;
const BULLET_SPEED = 14;
const ROCKET_SPEED = 8;
const PLAYER_SPEED = 5;
const PLAYER_HEALTH = 100;
const NPC_HEALTH = 50;
const BUNKER_HEALTH = 80;
const BULLET_DAMAGE = 20;
const ROCKET_DAMAGE = 80;
const NPC_DAMAGE = 15;
const COLLISION_RADIUS = 22;
const BUNKER_RADIUS = 36;

// ─── GAME STATE ────────────────────────────────────────────────────────────────
let players = {};
let bullets = [];
let rockets = [];
let npcs = [];
let bunkers = [];
let explosions = [];
let bulletIdCounter = 0;

function generateBunkers() {
  bunkers = [];
  const cols = 4, rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bunkers.push({
        id: `b_${r}_${c}`,
        x: 300 + c * 700 + Math.random() * 200 - 100,
        y: 300 + r * 600 + Math.random() * 150 - 75,
        health: BUNKER_HEALTH,
        maxHealth: BUNKER_HEALTH,
        destroyed: false,
        type: Math.random() < 0.5 ? 'large' : 'small'
      });
    }
  }
}

function spawnNPC() {
  const id = `npc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = Math.random() * MAP_WIDTH; y = 50; }
  else if (edge === 1) { x = Math.random() * MAP_WIDTH; y = MAP_HEIGHT - 50; }
  else if (edge === 2) { x = 50; y = Math.random() * MAP_HEIGHT; }
  else { x = MAP_WIDTH - 50; y = Math.random() * MAP_HEIGHT; }

  npcs.push({
    id, x, y,
    angle: Math.random() * Math.PI * 2,
    health: NPC_HEALTH,
    maxHealth: NPC_HEALTH,
    speed: 2 + Math.random() * 1.5,
    shootCooldown: 0,
    targetPlayerId: null,
    stateTimer: 0,
    state: 'patrol'
  });
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// ─── GAME LOOP ─────────────────────────────────────────────────────────────────
generateBunkers();
for (let i = 0; i < 3; i++) spawnNPC();

setInterval(() => {
  const dt = 1;
  const playerList = Object.values(players);

  // Spawn NPCs
  if (npcs.length < MAX_NPC && playerList.length > 0) {
    if (Math.random() < 0.005) spawnNPC();
  }

  // Update NPCs
  for (const npc of npcs) {
    npc.shootCooldown = Math.max(0, npc.shootCooldown - 1);
    npc.stateTimer = Math.max(0, npc.stateTimer - 1);

    // Find nearest player
    let nearest = null, nearestDist = Infinity;
    for (const p of playerList) {
      const d = dist(npc, p);
      if (d < nearestDist) { nearestDist = d; nearest = p; }
    }

    if (nearest && nearestDist < 600) {
      npc.state = 'chase';
      const a = angleTo(npc, nearest);
      npc.angle = a;
      npc.x += Math.cos(a) * npc.speed;
      npc.y += Math.sin(a) * npc.speed;

      // NPC shoot
      if (npc.shootCooldown === 0 && nearestDist < 400) {
        npc.shootCooldown = 80;
        bullets.push({
          id: `bullet_${bulletIdCounter++}`,
          x: npc.x, y: npc.y,
          vx: Math.cos(a) * BULLET_SPEED,
          vy: Math.sin(a) * BULLET_SPEED,
          owner: npc.id, isNPC: true, life: 60
        });
      }
    } else {
      // Patrol
      if (npc.stateTimer === 0) {
        npc.angle += (Math.random() - 0.5) * 0.8;
        npc.stateTimer = 60 + Math.floor(Math.random() * 60);
      }
      npc.x += Math.cos(npc.angle) * npc.speed * 0.6;
      npc.y += Math.sin(npc.angle) * npc.speed * 0.6;
    }

    // Wrap map
    npc.x = ((npc.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    npc.y = ((npc.y % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT;
  }

  // Update player bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy;
    b.life--;

    if (b.life <= 0 || b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
      bullets.splice(i, 1);
      continue;
    }

    if (!b.isNPC) {
      // Hit NPC
      for (let j = npcs.length - 1; j >= 0; j--) {
        if (dist(b, npcs[j]) < COLLISION_RADIUS) {
          npcs[j].health -= BULLET_DAMAGE;
          addExplosion(b.x, b.y, 'small');
          bullets.splice(i, 1);
          if (npcs[j].health <= 0) {
            addExplosion(npcs[j].x, npcs[j].y, 'medium');
            if (players[b.owner]) players[b.owner].score += 100;
            if (players[b.owner]) players[b.owner].kills++;
            npcs.splice(j, 1);
          }
          break;
        }
      }
    } else {
      // NPC bullet hits player
      for (const p of playerList) {
        if (p.id !== b.owner && dist(b, p) < COLLISION_RADIUS) {
          p.health -= NPC_DAMAGE;
          addExplosion(b.x, b.y, 'small');
          bullets.splice(i, 1);
          if (p.health <= 0) {
            p.health = 0;
            p.alive = false;
            setTimeout(() => { if (players[p.id]) { players[p.id].health = PLAYER_HEALTH; players[p.id].alive = true; } }, 3000);
          }
          break;
        }
      }
    }
  }

  // Update rockets
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    // Homing: adjust angle toward target
    if (r.targetX !== undefined) {
      const desired = Math.atan2(r.targetY - r.y, r.targetX - r.x);
      let diff = desired - r.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      r.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.06);
    }
    r.vx = Math.cos(r.angle) * ROCKET_SPEED;
    r.vy = Math.sin(r.angle) * ROCKET_SPEED;
    r.x += r.vx; r.y += r.vy;
    r.life--;

    if (r.life <= 0 || r.x < 0 || r.x > MAP_WIDTH || r.y < 0 || r.y > MAP_HEIGHT) {
      addExplosion(r.x, r.y, 'large');
      rockets.splice(i, 1);
      continue;
    }

    let hit = false;
    // Rocket hits bunker
    for (let j = bunkers.length - 1; j >= 0; j--) {
      const bunk = bunkers[j];
      if (!bunk.destroyed && dist(r, bunk) < BUNKER_RADIUS) {
        bunk.health -= ROCKET_DAMAGE;
        addExplosion(r.x, r.y, 'large');
        rockets.splice(i, 1);
        hit = true;
        if (bunk.health <= 0) {
          bunk.destroyed = true;
          addExplosion(bunk.x, bunk.y, 'huge');
          if (players[r.owner]) { players[r.owner].score += 300; players[r.owner].bunkersDestroyed++; }
        }
        break;
      }
    }
    if (hit) continue;

    // Rocket hits NPC
    for (let j = npcs.length - 1; j >= 0; j--) {
      if (dist(r, npcs[j]) < COLLISION_RADIUS * 1.5) {
        npcs[j].health -= ROCKET_DAMAGE;
        addExplosion(r.x, r.y, 'large');
        rockets.splice(i, 1);
        hit = true;
        if (npcs[j].health <= 0) {
          addExplosion(npcs[j].x, npcs[j].y, 'medium');
          if (players[r.owner]) { players[r.owner].score += 150; players[r.owner].kills++; }
          npcs.splice(j, 1);
        }
        break;
      }
    }
  }

  // Decay explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].life--;
    if (explosions[i].life <= 0) explosions.splice(i, 1);
  }

  // Emit state
  io.emit('gameState', {
    players: playerList.map(p => ({
      id: p.id, x: p.x, y: p.y, angle: p.angle,
      health: p.health, alive: p.alive, name: p.name,
      score: p.score, kills: p.kills, bunkersDestroyed: p.bunkersDestroyed
    })),
    bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y, isNPC: b.isNPC })),
    rockets: rockets.map(r => ({ id: r.id, x: r.x, y: r.y, angle: r.angle })),
    npcs: npcs.map(n => ({ id: n.id, x: n.x, y: n.y, angle: n.angle, health: n.health })),
    bunkers: bunkers.map(b => ({ id: b.id, x: b.x, y: b.y, health: b.health, destroyed: b.destroyed, type: b.type })),
    explosions: explosions.map(e => ({ x: e.x, y: e.y, size: e.size, life: e.life, maxLife: e.maxLife }))
  });

}, 1000 / TICK_RATE);

function addExplosion(x, y, size) {
  const maxLife = size === 'huge' ? 60 : size === 'large' ? 40 : size === 'medium' ? 25 : 15;
  explosions.push({ x, y, size, life: maxLife, maxLife });
}

// ─── SOCKET EVENTS ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: (data.name || 'Pilot').slice(0, 16),
      x: 400 + Math.random() * 400,
      y: 400 + Math.random() * 400,
      angle: 0,
      health: PLAYER_HEALTH,
      alive: true,
      score: 0,
      kills: 0,
      bunkersDestroyed: 0,
      vx: 0, vy: 0
    };
    socket.emit('init', {
      id: socket.id,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      bunkers
    });
  });

  socket.on('input', (input) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;

    const { w, a, s, d, angle } = input;

    // Tank turn: A/D rotate, W/S move in facing direction
    if (a) p.angle -= 0.06;
    if (d) p.angle += 0.06;

    const speed = PLAYER_SPEED;
    if (w) { p.x += Math.cos(p.angle) * speed; p.y += Math.sin(p.angle) * speed; }
    if (s) { p.x -= Math.cos(p.angle) * speed * 0.6; p.y -= Math.sin(p.angle) * speed * 0.6; }

    p.x = Math.max(20, Math.min(MAP_WIDTH - 20, p.x));
    p.y = Math.max(20, Math.min(MAP_HEIGHT - 20, p.y));
  });

  socket.on('shoot', () => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const tipX = p.x + Math.cos(p.angle) * 28;
    const tipY = p.y + Math.sin(p.angle) * 28;
    bullets.push({
      id: `bullet_${bulletIdCounter++}`,
      x: tipX, y: tipY,
      vx: Math.cos(p.angle) * BULLET_SPEED,
      vy: Math.sin(p.angle) * BULLET_SPEED,
      owner: socket.id, isNPC: false, life: 70
    });
  });

  socket.on('rocket', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const tipX = p.x + Math.cos(p.angle) * 28;
    const tipY = p.y + Math.sin(p.angle) * 28;
    const a = Math.atan2(data.worldY - p.y, data.worldX - p.x);
    rockets.push({
      id: `rocket_${bulletIdCounter++}`,
      x: tipX, y: tipY,
      angle: a, vx: Math.cos(a) * ROCKET_SPEED, vy: Math.sin(a) * ROCKET_SPEED,
      targetX: data.worldX, targetY: data.worldY,
      owner: socket.id, life: 180
    });
  });

  socket.on('disconnect', async () => {
    const p = players[socket.id];
    if (p && p.score > 0) {
      try {
        await supabase.from('scores').insert({
          player_name: p.name,
          score: p.score,
          kills: p.kills,
          bunkers_destroyed: p.bunkersDestroyed
        });
      } catch (e) { console.error('Supabase save failed:', e.message); }
    }
    delete players[socket.id];
    console.log('Player disconnected:', socket.id);
  });
});

// ─── LEADERBOARD API ───────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scores')
      .select('player_name, score, kills, bunkers_destroyed, created_at')
      .order('score', { ascending: false })
      .limit(10);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Heli-game server running on port ${PORT}`));
