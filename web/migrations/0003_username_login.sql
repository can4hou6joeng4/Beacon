ALTER TABLE users ADD COLUMN username TEXT;

UPDATE users
SET username = 'user_' || substr(lower(replace(id, '-', '')), 1, 27)
WHERE username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
