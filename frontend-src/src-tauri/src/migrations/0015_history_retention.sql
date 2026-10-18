CREATE INDEX history_created_at ON change_history(julianday(created_at));
ALTER TABLE history_context ADD COLUMN last_pruned_on TEXT;
