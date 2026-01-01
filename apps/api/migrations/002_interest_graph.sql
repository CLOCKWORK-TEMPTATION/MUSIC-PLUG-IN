-- Interest Graph table (LLM + heuristic derived)

CREATE TABLE IF NOT EXISTS user_interest_graph (
    external_user_id VARCHAR(255) PRIMARY KEY,
    graph JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_interest_graph_updated_at ON user_interest_graph(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interest_graph_gin ON user_interest_graph USING GIN (graph);

-- Trigger to keep updated_at fresh
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_interest_graph_updated_at'
    ) THEN
        CREATE TRIGGER update_user_interest_graph_updated_at BEFORE UPDATE ON user_interest_graph
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
