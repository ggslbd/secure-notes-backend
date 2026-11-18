const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const { asyncHandler, authenticate, requireAdmin, validId } = require('../middleware/auth');
const { parsePage, envelope } = require('../utils/pagination');

router.use(authenticate);

// ---- Current user ----
router.get('/me', asyncHandler(async (req, res) => {
  res.json(await User.findById(req.user.id));
}));

router.patch('/me', asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (typeof req.body?.name === 'string') user.name = req.body.name;
  if (Array.isArray(req.body?.interests)) user.interests = req.body.interests;
  if (req.body?.password !== undefined) await user.setPassword(req.body.password);
  await user.save();
  res.json(user);
}));

// ---- Admin: Scenario 1 — users grouped by interest (exactly one User.aggregate call) ----
// GET /api/users/by-interests[?interest=chess][&page&limit]   (paginates over interest groups)
router.get('/by-interests', requireAdmin, asyncHandler(async (req, res) => {
  const p = parsePage(req.query);
  const interest = typeof req.query.interest === 'string' ? req.query.interest.trim().toLowerCase() : null;

  const pipeline = [];
  if (interest) pipeline.push({ $match: { interests: interest } });       // uses { interests: 1 } index
  pipeline.push({ $unwind: '$interests' });
  if (interest) pipeline.push({ $match: { interests: interest } });       // keep only the requested group
  pipeline.push(
    {
      $group: {
        _id: '$interests',
        count: { $sum: 1 },
        users: { $push: { _id: '$_id', name: '$name', email: '$email' } },
      },
    },
    { $sort: { _id: 1 } },
    {
      $facet: {
        data: [{ $skip: p.skip }, { $limit: p.limit }],
        total: [{ $count: 'n' }],
      },
    }
  );

  const [out] = await User.aggregate(pipeline);
  const total = out.total[0]?.n || 0;
  res.json(envelope(out.data, total, p));
}));

// ---- Admin: user management ----
router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const p = parsePage(req.query);
  const [data, total] = await Promise.all([
    User.find().sort({ _id: -1 }).skip(p.skip).limit(p.limit).lean(), // default _id index
    User.estimatedDocumentCount(),
  ]);
  data.forEach((u) => delete u.__v);
  res.json(envelope(data, total, p));
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, password, role, interests } = req.body || {};
  const user = new User({
    name, email, role: role === 'admin' ? 'admin' : 'user',
    interests: Array.isArray(interests) ? interests : [],
  });
  await user.setPassword(password);
  await user.save();
  res.status(201).json(user);
}));

router.get('/:id', validId, requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

router.patch('/:id', validId, requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  if (typeof b.name === 'string') user.name = b.name;
  if (typeof b.email === 'string') user.email = b.email;
  if (b.role === 'user' || b.role === 'admin') {
    if (req.params.id === req.user.id && b.role !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote yourself' });
    }
    user.role = b.role;
  }
  if (Array.isArray(b.interests)) user.interests = b.interests;
  if (b.password !== undefined) await user.setPassword(b.password);
  await user.save();
  res.json(user);
}));

router.delete('/:id', validId, requireAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Cascade: both use the { owner/author, _id } indexes.
  await Promise.all([Note.deleteMany({ owner: user._id }), Post.deleteMany({ author: user._id })]);
  res.status(204).end();
}));

module.exports = router;
