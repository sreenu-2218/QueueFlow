const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "replace-this-secret-before-deployment";
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    if (!token) throw new Error("Missing token");
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please log in to continue." });
  }
}
module.exports = { auth, SECRET };
