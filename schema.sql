CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  input TEXT NOT NULL,
  final_output TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS council_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  advisor_name TEXT NOT NULL,
  response TEXT NOT NULL,
  confidence REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  used_count INTEGER DEFAULT 0
);
