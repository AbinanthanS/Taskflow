-- Migration 002: CHECK constraints, column/position index, and activities.user_id ON DELETE SET NULL

-- 1. CHECK constraint for board_members.role
ALTER TABLE board_members DROP CONSTRAINT IF EXISTS chk_board_members_role;
ALTER TABLE board_members ADD CONSTRAINT chk_board_members_role
    CHECK (role IN ('owner', 'admin', 'member'));

-- 2. CHECK constraint for tasks.priority
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_priority;
ALTER TABLE tasks ADD CONSTRAINT chk_tasks_priority
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- 3. Composite index on tasks(column_id, position)
CREATE INDEX IF NOT EXISTS idx_tasks_col_pos ON tasks(column_id, position);

-- 4. Change activities.user_id FK to ON DELETE SET NULL
DO $$
BEGIN
    ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_user_id_fkey;
    ALTER TABLE activities ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE activities ADD CONSTRAINT activities_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
END $$;
