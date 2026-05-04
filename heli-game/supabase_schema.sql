-- Spusť v Supabase SQL editoru

CREATE TABLE IF NOT EXISTS scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  bunkers_destroyed integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index pro leaderboard
CREATE INDEX IF NOT EXISTS scores_score_idx ON scores(score DESC);

-- Povolíme čtení pro všechny (public leaderboard)
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scores" ON scores FOR INSERT WITH CHECK (true);
