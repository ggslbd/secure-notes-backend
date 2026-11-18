const jwt = require('jsonwebtoken');
const User = require('../models/User');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Re-read the user (by _id index) so deleted users / role changes take effect immediately.
  const user = await User.findById(payload.sub).select('role').lean();
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  req.user = { id: String(user._id), role: user.role };
  next();
});

const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

const validId = (req, res, next) =>
  /^[a-f\d]{24}$/i.test(req.params.id) ? next() : res.status(400).json({ error: 'Invalid id' });

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

module.exports = { asyncHandler, authenticate, requireAdmin, validId, signToken };
