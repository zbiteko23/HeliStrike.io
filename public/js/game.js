// ─── SETUP ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

const socket = io();
let myId = null;
let mapWidth = 3000, mapHeight = 2000;
let gameState = null;
let myPlayer = null;
let bunkerData = [];
let mouseX = W / 2, mouseY = H / 2;
let worldMouseX = 0, worldMouseY = 0;
let shootCooldown = 0;
let rocketCooldown = 0;
const MAX_ROCKETS = 4;
let rocketCount = MAX_ROCKETS;
const killFeedMsgs = [];

// Input state
const keys = { w: false, a: false, s: false, d: false };

// ─── ASSETS (procedural drawing) ─────────────────────────────────────────────
// Draw a helicopter (procedural)
function drawHelicopter(ctx, x, y, angle, color, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(3, 5, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cockpit bubble
  ctx.fillStyle = isPlayer ? 'rgba(120,220,255,0.7)' : 'rgba(80,180,210,0.5)';
  ctx.beginPath();
  ctx.ellipse(8, -2, 8, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Tail boom
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-14, -3);
  ctx.lineTo(-32, -1);
  ctx.lineTo(-32, 3);
  ctx.lineTo(-14, 4);
  ctx.closePath();
  ctx.fill();

  // Tail rotor
  ctx.strokeStyle = isPlayer ? 'rgba(200,240,255,0.8)' : 'rgba(160,200,220,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-32, -7);
  ctx.lineTo(-32, 9);
  ctx.stroke();

  // Main rotor (spinning)
  const rot = (Date.now() / 80) % (Math.PI * 2);
  ctx.strokeStyle = isPlayer ? 'rgba(200,240,255,0.7)' : 'rgba(160,200,220,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(Math.cos(rot) * 28, Math.sin(rot) * 28);
  ctx.lineTo(Math.cos(rot + Math.PI) * 28, Math.sin(rot + Math.PI) * 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.cos(rot + Math.PI / 2) * 28, Math.sin(rot + Math.PI / 2) * 28);
  ctx.lineTo(Math.cos(rot + 1.5 * Math.PI) * 28, Math.sin(rot + 1.5 * Math.PI) * 28);
  ctx.stroke();

  ctx.restore();
}

function drawBunker(ctx, x, y, health, maxHealth, type, destroyed) {
  ctx.save();
  ctx.translate(x, y);

  if (destroyed) {
    // Destroyed bunker rubble
    ctx.fillStyle = '#5a4a2a';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-20 + i * 8 + (i % 2) * 4, -8 + (i % 3) * 5, 6 + i % 3 * 2, 5 + i % 2 * 3);
    }
    ctx.restore();
    return;
  }

  const size = type === 'large' ? 38 : 26;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-size / 2 + 4, -size / 2 + 4, size, size);

  // Main body
  ctx.fillStyle = '#7a6a3a';
  ctx.fillRect(-size / 2, -size / 2, size, size);

  // Darker center
  ctx.fillStyle = '#5a4a20';
  ctx.fillRect(-size / 4, -size / 4, size / 2, size / 2);

  // Reinforcement lines
  ctx.strokeStyle = '#4a3a18';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-size / 2, -size / 2, size, size);

  if (type === 'large') {
    // Sandbag details
    ctx.fillStyle = '#8a7a3a';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-size / 2 + i * 10 - 1, -size / 2 - 4, 8, 5);
      ctx.fillRect(-size / 2 + i * 10 - 1, size / 2, 8, 5);
    }
  }

  // Health bar above bunker
  const barW = size + 10;
  const healthPct = health / maxHealth;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-barW / 2, -size / 2 - 14, barW, 6);
  ctx.fillStyle = healthPct > 0.5 ? '#5fe85a' : healthPct > 0.25 ? '#f0c040' : '#e85a5a';
  ctx.fillRect(-barW / 2, -size / 2 - 14, barW * healthPct, 6);

  ctx.restore();
}

function drawBullet(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#ffee66';
  ctx.shadowColor = '#ffcc00';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNPCBullet(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#ff6666';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRocket(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Trail
  ctx.fillStyle = 'rgba(255,150,50,0.4)';
  ctx.beginPath();
  ctx.moveTo(-5, -2);
  ctx.lineTo(-14, 0);
  ctx.lineTo(-5, 2);
  ctx.fill();
  // Body
  ctx.fillStyle = '#e0e0e0';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e85a20';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(12, -2);
  ctx.lineTo(12, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawExplosion(ctx, e) {
  const t = 1 - e.life / e.maxLife;
  const r = e.size === 'huge' ? 80 : e.size === 'large' ? 45 : e.size === 'medium' ? 25 : 14;
  const alpha = (1 - t) * 0.9;
  ctx.save();
  // Outer blast
  ctx.globalAlpha = alpha * 0.4;
  ctx.fillStyle = '#ff8c00';
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * (0.5 + t * 1.2), 0, Math.PI * 2);
  ctx.fill();
  // Core
  ctx.globalAlpha = alpha;
  ctx.fillStyle = t < 0.3 ? '#ffffff' : t < 0.6 ? '#ffee00' : '#ff6600';
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * (1 - t * 0.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── DESERT BACKGROUND ────────────────────────────────────────────────────────
const desertFeatures = [];
function generateDesertFeatures() {
  // Rocks
  for (let i = 0; i < 120; i++) {
    desertFeatures.push({
      type: 'rock', x: Math.random() * mapWidth, y: Math.random() * mapHeight,
      size: 4 + Math.random() * 12, angle: Math.random() * Math.PI
    });
  }
  // Dunes (big soft humps)
  for (let i = 0; i < 40; i++) {
    desertFeatures.push({
      type: 'dune', x: Math.random() * mapWidth, y: Math.random() * mapHeight,
      w: 60 + Math.random() * 140, h: 20 + Math.random() * 40
    });
  }
  // Desert scrub
  for (let i = 0; i < 60; i++) {
    desertFeatures.push({
      type: 'scrub', x: Math.random() * mapWidth, y: Math.random() * mapHeight,
      size: 5 + Math.random() * 8
    });
  }
}

function drawDesertBackground(ctx, camX, camY) {
  // Base sand
  ctx.fillStyle = '#c8a850';
  ctx.fillRect(0, 0, W, H);

  // Sand grain texture
  ctx.fillStyle = '#c09838';
  for (let i = 0; i < 200; i++) {
    const x = ((i * 137) % mapWidth - camX) % W;
    const y = ((i * 241) % mapHeight - camY) % H;
    if (x > 0 && x < W && y > 0 && y < H) {
      ctx.fillRect(x, y, 2, 1);
    }
  }

  // Desert features
  for (const f of desertFeatures) {
    const sx = f.x - camX, sy = f.y - camY;
    if (sx < -200 || sx > W + 200 || sy < -200 || sy > H + 200) continue;

    if (f.type === 'dune') {
      ctx.fillStyle = 'rgba(180,140,50,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.w, f.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(210,175,80,0.2)';
      ctx.beginPath();
      ctx.ellipse(sx - 10, sy - 5, f.w * 0.6, f.h * 0.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.type === 'rock') {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(f.angle);
      ctx.fillStyle = '#8a7040';
      ctx.beginPath();
      ctx.ellipse(0, 0, f.size, f.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a08050';
      ctx.beginPath();
      ctx.ellipse(-f.size * 0.2, -f.size * 0.2, f.size * 0.4, f.size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (f.type === 'scrub') {
      ctx.fillStyle = '#6a8040';
      ctx.beginPath();
      ctx.arc(sx, sy, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a7030';
      ctx.beginPath();
      ctx.arc(sx + f.size * 0.5, sy - f.size * 0.3, f.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Map border
  ctx.strokeStyle = '#8a6020';
  ctx.lineWidth = 4;
  ctx.strokeRect(-camX, -camY, mapWidth, mapHeight);
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
let camX = 0, camY = 0;

function updateCamera() {
  if (!myPlayer) return;
  const targetX = myPlayer.x - W / 2;
  const targetY = myPlayer.y - H / 2;
  camX += (targetX - camX) * 0.12;
  camY += (targetY - camY) * 0.12;
}

// ─── RENDER LOOP ──────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);
  if (!gameState) return;

  updateCamera();

  // World mouse position
  worldMouseX = mouseX + camX;
  worldMouseY = mouseY + camY;

  ctx.clearRect(0, 0, W, H);
  drawDesertBackground(ctx, camX, camY);

  // Bunkers
  const bunkersToRender = gameState.bunkers.length ? gameState.bunkers : bunkerData;
  for (const b of bunkersToRender) {
    drawBunker(ctx, b.x - camX, b.y - camY, b.health, b.maxHealth || 80, b.type || 'large', b.destroyed);
  }

  // Explosions (under everything else is fine too)
  for (const e of (gameState.explosions || [])) {
    drawExplosion(ctx, { ...e, x: e.x - camX, y: e.y - camY });
  }

  // Bullets
  for (const b of gameState.bullets) {
    if (b.isNPC) drawNPCBullet(ctx, b.x - camX, b.y - camY);
    else drawBullet(ctx, b.x - camX, b.y - camY);
  }

  // Rockets
  for (const r of gameState.rockets) {
    drawRocket(ctx, r.x - camX, r.y - camY, r.angle);
  }

  // NPCs
  for (const n of gameState.npcs) {
    const nx = n.x - camX, ny = n.y - camY;
    drawHelicopter(ctx, nx, ny, n.angle, '#c05030', false);
    // NPC health bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(nx - 20, ny - 36, 40, 5);
    ctx.fillStyle = '#e85a5a';
    ctx.fillRect(nx - 20, ny - 36, 40 * (n.health / 50), 5);
    ctx.fillStyle = '#e8d49a';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('ENEMY', nx, ny - 40);
  }

  // Other players
  for (const p of gameState.players) {
    if (p.id === myId) continue;
    drawHelicopter(ctx, p.x - camX, p.y - camY, p.angle, '#3090e0', false);
    ctx.fillStyle = '#90d0ff';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x - camX, p.y - camY - 40);
  }

  // My helicopter
  if (myPlayer && myPlayer.alive) {
    drawHelicopter(ctx, myPlayer.x - camX, myPlayer.y - camY, myPlayer.angle, '#40d060', true);
  }

  // Target indicator when hovering bunker
  const hovBunker = getHoveredBunker();
  if (hovBunker) {
    const bx = hovBunker.x - camX, by = hovBunker.y - camY;
    ctx.strokeStyle = 'rgba(255,80,40,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,80,40,0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(bx, by, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw minimap
  drawMinimap();

  // Auto-aim toward mouse (rotate helikopter)
  if (myPlayer && myPlayer.alive) {
    const dx = worldMouseX - myPlayer.x;
    const dy = worldMouseY - myPlayer.y;
    socket.emit('mouseAngle', Math.atan2(dy, dx));
  }

  // HUD update
  if (myPlayer) {
    updateHUD(myPlayer);
  }
}

function drawMinimap() {
  const mw = miniCanvas.width, mh = miniCanvas.height;
  miniCtx.fillStyle = 'rgba(20,15,5,0.85)';
  miniCtx.fillRect(0, 0, mw, mh);

  const scaleX = mw / mapWidth, scaleY = mh / mapHeight;

  // Bunkers
  for (const b of (gameState.bunkers.length ? gameState.bunkers : bunkerData)) {
    miniCtx.fillStyle = b.destroyed ? '#3a3020' : '#7a6a3a';
    miniCtx.fillRect(b.x * scaleX - 2, b.y * scaleY - 2, 4, 4);
  }

  // NPCs
  miniCtx.fillStyle = '#e85a5a';
  for (const n of gameState.npcs) {
    miniCtx.beginPath();
    miniCtx.arc(n.x * scaleX, n.y * scaleY, 2, 0, Math.PI * 2);
    miniCtx.fill();
  }

  // Other players
  miniCtx.fillStyle = '#3090e0';
  for (const p of gameState.players) {
    if (p.id === myId) continue;
    miniCtx.beginPath();
    miniCtx.arc(p.x * scaleX, p.y * scaleY, 3, 0, Math.PI * 2);
    miniCtx.fill();
  }

  // My player
  if (myPlayer) {
    miniCtx.fillStyle = '#40d060';
    miniCtx.beginPath();
    miniCtx.arc(myPlayer.x * scaleX, myPlayer.y * scaleY, 3.5, 0, Math.PI * 2);
    miniCtx.fill();
    // View area
    miniCtx.strokeStyle = 'rgba(64,208,96,0.3)';
    miniCtx.lineWidth = 0.5;
    miniCtx.strokeRect(camX * scaleX, camY * scaleY, W * scaleX, H * scaleY);
  }

  // Border
  miniCtx.strokeStyle = '#5a4a1a';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(0, 0, mw, mh);
}

function getHoveredBunker() {
  const bList = gameState ? (gameState.bunkers.length ? gameState.bunkers : bunkerData) : bunkerData;
  for (const b of bList) {
    if (b.destroyed) continue;
    const dx = worldMouseX - b.x, dy = worldMouseY - b.y;
    if (Math.sqrt(dx * dx + dy * dy) < 50) return b;
  }
  return null;
}

function updateHUD(p) {
  const hp = Math.max(0, p.health);
  document.getElementById('health-bar').style.width = hp + '%';
  document.getElementById('health-bar').style.background = hp > 50 ? '#5fe85a' : hp > 25 ? '#f0c040' : '#e85a5a';
  document.getElementById('hp-value').textContent = hp;
  document.getElementById('hp-value').className = 'hud-value ' + (hp > 50 ? 'green' : 'red');
  document.getElementById('score-value').textContent = p.score;
  document.getElementById('kills-value').textContent = p.kills;
  document.getElementById('bunkers-value').textContent = p.bunkersDestroyed;

  // Ammo indicator
  const ammoDiv = document.getElementById('ammo-indicator');
  ammoDiv.innerHTML = '';
  for (let i = 0; i < rocketCount; i++) {
    const d = document.createElement('div');
    d.className = 'ammo-icon ammo-rocket';
    ammoDiv.appendChild(d);
  }

  // Respawn message
  document.getElementById('respawn-msg').style.display = p.alive ? 'none' : 'flex';
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = true;
  if (k === 'a') keys.a = true;
  if (k === 's') keys.s = true;
  if (k === 'd') keys.d = true;
  if (k === ' ') e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = false;
  if (k === 'a') keys.a = false;
  if (k === 's') keys.s = false;
  if (k === 'd') keys.d = false;
});

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  document.getElementById('crosshair').style.left = mouseX + 'px';
  document.getElementById('crosshair').style.top = mouseY + 'px';
  document.getElementById('crosshair-ring').style.left = mouseX + 'px';
  document.getElementById('crosshair-ring').style.top = mouseY + 'px';
  document.getElementById('crosshair-ring').style.borderColor = getHoveredBunker() ? 'rgba(255,80,40,0.8)' : 'rgba(255,80,80,0.5)';
});

canvas.addEventListener('mousedown', (e) => {
  if (!myPlayer || !myPlayer.alive) return;
  if (e.button === 0) {
    // Left click = shoot
    socket.emit('shoot');
  } else if (e.button === 2) {
    // Right click = rocket at cursor (world position)
    if (rocketCount <= 0) return;
    const hovBunker = getHoveredBunker();
    if (hovBunker) {
      socket.emit('rocket', { worldX: hovBunker.x, worldY: hovBunker.y });
      rocketCount = Math.max(0, rocketCount - 1);
      // Reload rocket after 8 seconds
      setTimeout(() => { rocketCount = Math.min(MAX_ROCKETS, rocketCount + 1); }, 8000);
    } else {
      // Fire rocket at world cursor pos
      socket.emit('rocket', { worldX: worldMouseX, worldY: worldMouseY });
      rocketCount = Math.max(0, rocketCount - 1);
      setTimeout(() => { rocketCount = Math.min(MAX_ROCKETS, rocketCount + 1); }, 8000);
    }
  }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

// Continuous shoot on hold
let shootHold = false;
canvas.addEventListener('mousedown', e => { if (e.button === 0) shootHold = true; });
canvas.addEventListener('mouseup', e => { if (e.button === 0) shootHold = false; });

// ─── INPUT LOOP ───────────────────────────────────────────────────────────────
setInterval(() => {
  if (!myPlayer || !myPlayer.alive) return;
  socket.emit('input', { w: keys.w, a: keys.a, s: keys.s, d: keys.d });
  if (shootHold) {
    if (shootCooldown <= 0) {
      socket.emit('shoot');
      shootCooldown = 8;
    }
  }
  if (shootCooldown > 0) shootCooldown--;
}, 1000 / 60);

// ─── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('init', (data) => {
  myId = data.id;
  mapWidth = data.mapWidth;
  mapHeight = data.mapHeight;
  bunkerData = data.bunkers;
  generateDesertFeatures();
});

socket.on('gameState', (state) => {
  gameState = state;
  myPlayer = state.players.find(p => p.id === myId) || null;
});

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const lbRows = document.getElementById('lb-rows');
    if (!data || !data.length) {
      lbRows.innerHTML = '<div style="color:#5a4a2a;font-size:11px">Zatím žádné záznamy</div>';
      return;
    }
    lbRows.innerHTML = data.map((row, i) =>
      `<div class="lb-row"><span class="lb-name">${i + 1}. ${row.player_name}</span><span class="lb-score">${row.score}</span></div>`
    ).join('');
  } catch (e) { /* ignore */ }
}
fetchLeaderboard();
setInterval(fetchLeaderboard, 30000);

// ─── START SCREEN ─────────────────────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', () => {
  const name = document.getElementById('name-input').value.trim() || 'Pilot';
  socket.emit('join', { name });
  document.getElementById('overlay').style.display = 'none';
  canvas.requestPointerLock && canvas.requestPointerLock();
});

document.getElementById('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('start-btn').click();
});

// Start render
render();
