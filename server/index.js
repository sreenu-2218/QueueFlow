const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { auth, SECRET } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

const sendError = (res, err) => res.status(400).json({ error: err.message || "Something went wrong." });
const ownedQueue = (queueId, userId) =>
  db.prepare("SELECT * FROM queues WHERE id=? AND user_id=?").get(queueId, userId);

app.get("/api/health", (_, res) => res.json({ status: "ok" }));

app.post("/api/auth/register", (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6)
      return res.status(400).json({ error: "Enter your name, email and a password with at least 6 characters." });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)")
      .run(name.trim(), email.trim().toLowerCase(), hash);
    const user = { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase() };
    const token = jwt.sign(user, SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user });
  } catch (e) { sendError(res, e); }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password || "", row.password))
    return res.status(401).json({ error: "Invalid email or password." });
  const user = { id: row.id, name: row.name, email: row.email };
  res.json({ token: jwt.sign(user, SECRET, { expiresIn: "7d" }), user });
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

app.get("/api/queues", auth, (req, res) => {
  const queues = db.prepare("SELECT * FROM queues WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  const counts = db.prepare(`SELECT queue_id,
    SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) waiting,
    SUM(CASE WHEN status='serving' THEN 1 ELSE 0 END) serving
    FROM tokens GROUP BY queue_id`);
  const map = Object.fromEntries(counts.all().map(x => [x.queue_id, x]));
  res.json(queues.map(q => ({ ...q, waiting: map[q.id]?.waiting || 0, serving: map[q.id]?.serving || 0 })));
});

app.post("/api/queues", auth, (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Queue name is required." });
  const result = db.prepare("INSERT INTO queues(user_id,name) VALUES(?,?)").run(req.user.id, name);
  res.status(201).json(db.prepare("SELECT * FROM queues WHERE id=?").get(result.lastInsertRowid));
});

app.delete("/api/queues/:id", auth, (req, res) => {
  const queue = ownedQueue(req.params.id, req.user.id);
  if (!queue) return res.status(404).json({ error: "Queue not found." });
  db.prepare("DELETE FROM tokens WHERE queue_id=?").run(queue.id);
  db.prepare("DELETE FROM queues WHERE id=?").run(queue.id);
  res.json({ success: true });
});

app.get("/api/queues/:id/tokens", auth, (req, res) => {
  if (!ownedQueue(req.params.id, req.user.id)) return res.status(404).json({ error: "Queue not found." });
  res.json(db.prepare("SELECT * FROM tokens WHERE queue_id=? ORDER BY CASE status WHEN 'serving' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, position, id")
    .all(req.params.id));
});

app.post("/api/queues/:id/tokens", auth, (req, res) => {
  const queue = ownedQueue(req.params.id, req.user.id);
  if (!queue) return res.status(404).json({ error: "Queue not found." });
  const person = (req.body.personName || "").trim();
  if (!person) return res.status(400).json({ error: "Person name is required." });
  const nextNo = db.prepare("SELECT COALESCE(MAX(token_number),0)+1 n FROM tokens WHERE queue_id=?").get(queue.id).n;
  const pos = db.prepare("SELECT COALESCE(MAX(position),0)+1 n FROM tokens WHERE queue_id=? AND status='waiting'").get(queue.id).n;
  const result = db.prepare("INSERT INTO tokens(queue_id,person_name,token_number,position) VALUES(?,?,?,?)")
    .run(queue.id, person, nextNo, pos);
  res.status(201).json(db.prepare("SELECT * FROM tokens WHERE id=?").get(result.lastInsertRowid));
});

app.patch("/api/tokens/:id/move", auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE t.id=? AND q.user_id=?`).get(req.params.id, req.user.id);
  if (!token || token.status !== "waiting") return res.status(400).json({ error: "Only waiting tokens can be moved." });
  const direction = req.body.direction;
  if (!["up", "down"].includes(direction)) return res.status(400).json({ error: "Invalid direction." });
  const step = direction === "up" ? -1 : 1;
  const neighbor = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND status='waiting' AND position ${step < 0 ? "<" : ">"} ?
    ORDER BY position ${step < 0 ? "DESC" : "ASC"} LIMIT 1`).get(token.queue_id, token.position);
  if (neighbor) {
    const swap = db.transaction(() => {
      db.prepare("UPDATE tokens SET position=? WHERE id=?").run(neighbor.position, token.id);
      db.prepare("UPDATE tokens SET position=? WHERE id=?").run(token.position, neighbor.id);
    });
    swap();
  }
  res.json({ success: true });
});

app.post("/api/queues/:id/serve-next", auth, (req, res) => {
  const queue = ownedQueue(req.params.id, req.user.id);
  if (!queue) return res.status(404).json({ error: "Queue not found." });
  const active = db.prepare("SELECT id FROM tokens WHERE queue_id=? AND status='serving'").get(queue.id);
  if (active) return res.status(409).json({ error: "Complete the current service before calling the next token." });
  const next = db.prepare("SELECT * FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY position,id LIMIT 1").get(queue.id);
  if (!next) return res.status(404).json({ error: "There are no waiting tokens." });
  db.prepare("UPDATE tokens SET status='serving', called_at=CURRENT_TIMESTAMP WHERE id=?").run(next.id);
  res.json(db.prepare("SELECT * FROM tokens WHERE id=?").get(next.id));
});

app.post("/api/tokens/:id/complete", auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE t.id=? AND q.user_id=?`).get(req.params.id, req.user.id);
  if (!token || token.status !== "serving") return res.status(400).json({ error: "Token is not currently being served." });
  db.prepare("UPDATE tokens SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?").run(token.id);
  res.json({ success: true });
});

app.post("/api/tokens/:id/cancel", auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id
    WHERE t.id=? AND q.user_id=?`).get(req.params.id, req.user.id);
  if (!token || !["waiting", "serving"].includes(token.status)) return res.status(400).json({ error: "This token cannot be cancelled." });
  db.prepare("UPDATE tokens SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP WHERE id=?").run(token.id);
  res.json({ success: true });
});

app.get("/api/analytics", auth, (req, res) => {
  const queues = db.prepare("SELECT id,name FROM queues WHERE user_id=?").all(req.user.id);
  const ids = queues.map(q => q.id);
  if (!ids.length) return res.json({ totals: { waiting: 0, serving: 0, completed: 0, avgWait: 0 }, trend: [], queueStats: [] });
  const marks = ids.map(() => "?").join(",");
  const totals = db.prepare(`SELECT
    SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) waiting,
    SUM(CASE WHEN status='serving' THEN 1 ELSE 0 END) serving,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
    AVG(CASE WHEN called_at IS NOT NULL THEN (julianday(called_at)-julianday(created_at))*1440 END) avgWait
    FROM tokens WHERE queue_id IN (${marks})`).get(...ids);
  const queueStats = queues.map(q => {
    const s = db.prepare(`SELECT
      SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) waiting,
      SUM(CASE WHEN status='serving' THEN 1 ELSE 0 END) serving,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed
      FROM tokens WHERE queue_id=?`).get(q.id);
    return { name: q.name, waiting: s.waiting || 0, serving: s.serving || 0, completed: s.completed || 0 };
  });
  const trend = db.prepare(`SELECT date(created_at) day, COUNT(*) count FROM tokens
    WHERE queue_id IN (${marks}) AND created_at >= datetime('now','-6 days')
    GROUP BY date(created_at) ORDER BY day`).all(...ids);
  res.json({ totals: { waiting: totals.waiting || 0, serving: totals.serving || 0, completed: totals.completed || 0, avgWait: Math.round(totals.avgWait || 0) }, trend, queueStats });
});

const path = require("path");
const fs = require("fs");
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
}
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`QueueFlow API running on http://localhost:${PORT}`));
