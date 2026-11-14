const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "queueflow.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL,
  person_name TEXT NOT NULL,
  token_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  called_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY(queue_id) REFERENCES queues(id)
);
`);
module.exports = db;
