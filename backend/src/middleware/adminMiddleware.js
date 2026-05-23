const env = require("../config/env");

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Invalid admin token " });
  }
  next();
}

module.exports = adminAuth;