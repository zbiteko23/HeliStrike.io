# 🚁 Desert Strike — Helicopter Game

Multiplayer helikoptérová hra. Node.js + Socket.IO + Supabase, nasazená na Render.com.

## Struktura projektu

```
heli-game/
├── server/
│   └── index.js          ← Node.js server, game loop, Socket.IO
├── public/
│   ├── index.html        ← Frontend, HUD, UI
│   └── js/
│       └── game.js       ← Canvas renderer, vstup, kamera
├── supabase_schema.sql   ← SQL pro Supabase
├── .env.example          ← Vzor proměnných prostředí
└── package.json
```

## Instalace lokálně

```bash
cd heli-game
npm install
cp .env.example .env
# Vyplň SUPABASE_URL a SUPABASE_ANON_KEY
npm run dev
# → http://localhost:3000
```

## Supabase nastavení

1. Vytvoř projekt na https://supabase.com
2. V SQL editoru spusť obsah `supabase_schema.sql`
3. Zkopíruj **Project URL** a **anon public key** do `.env`

## Nasazení na Render.com

1. Pushni projekt na GitHub
2. Na Render.com: **New → Web Service** → propoj GitHub repo
3. Nastavení:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. V **Environment Variables** přidej:
   - `SUPABASE_URL` = tvoje Supabase URL
   - `SUPABASE_ANON_KEY` = tvůj Supabase anon key
5. Deploy → hotovo!

## Ovládání

| Klávesa / tlačítko | Akce |
|---|---|
| **W** | Dopředu (ve směru helikoptéry) |
| **S** | Dozadu (pomaleji) |
| **A** | Tank turn vlevo (otočení na místě) |
| **D** | Tank turn vpravo (otočení na místě) |
| **Levý klik** (držet) | Střelba — normální kulky (proti NPC helikoptérám) |
| **Pravý klik** na bunkr | Vypálení rakety na bunkr |
| **Pravý klik** jinam | Raketa na libovolný bod |
| **Myš** | Helikoptéra se automaticky otáčí k myši |

## Skóre

- Sestřelení NPC helikoptéry = **100 bodů**
- Zničení bunkru raketou = **300 bodů**
- Raketa na NPC = **150 bodů**
- Rakety se dobíjí: 1 raketa za 8 sekund (max 4)
- Skóre se ukládá do Supabase při odpojení

## Herní mechaniky

- **Map:** 3000×2000 pouštní mapa s dunami, kameny a keři
- **Bunkry:** 12 bunkrů na mapě, kliknutelné pravým tlačítkem
- **NPC:** automaticky spawnují u okrajů mapy, pronásledují a střílí hráče
- **Multiplayer:** real-time přes Socket.IO, vidíš ostatní hráče
- **Minimap:** vpravo dole — žlutý bod = ty, červené = NPC, modré = ostatní hráči
- **Respawn:** po zničení se helikoptéra vrátí za 3 sekundy
