-- Run timing for anti-cheat: when the run's start token was issued, how long
-- the run took in real time, and the minimum game time its distance needs.
-- flag = 'slow' when the run took much longer than the game needs
-- (long pauses, or the game slowed down). Older rows stay NULL.
ALTER TABLE scores ADD COLUMN run_started_at TEXT;
ALTER TABLE scores ADD COLUMN duration_s INTEGER;
ALTER TABLE scores ADD COLUMN min_game_s INTEGER;
ALTER TABLE scores ADD COLUMN flag TEXT;
