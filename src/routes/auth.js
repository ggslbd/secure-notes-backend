const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { asyncHandler, signToken } = require('../middleware/auth');

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
const str = (v) => typeof v === 'string';

// Public registration always creates a plain "user"; only admins can create admins.
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, interests } = req.body || {};
  if (!str(name) || !str(email) || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'name and a valid email are required' });
  }
  const user = new User({ name, email, interests: Array.isArray(interests) ? interests : [] });
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ token: signToken(user), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!str(email) || !str(password)) return res.status(400).json({ error: 'email and password required' });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(user), user });
}));

module.exports = router;
