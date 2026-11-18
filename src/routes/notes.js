const router = require('express').Router();
const Note = require('../models/Note');
const { asyncHandler, authenticate, validId } = require('../middleware/auth');
const { parsePage, envelope } = require('../utils/pagination');

router.use(authenticate);

// GET /api/notes                 -> my notes
// GET /api/notes?scope=all       -> admin: everyone's notes (optionally &owner=<userId>)
router.get('/', asyncHandler(async (req, res) => {
  const p = parsePage(req.query);
  const isAdminAll = req.user.role === 'admin' && req.query.scope === 'all';
  const filter = {};
  if (!isAdminAll) filter.owner = req.user.id;
  else if (/^[a-f\d]{24}$/i.test(req.query.owner || '')) filter.owner = req.query.owner;

  let q = Note.find(filter).sort({ _id: -1 }).skip(p.skip).limit(p.limit);
  if (isAdminAll) q = q.populate('owner', 'name email'); // by _id
  const [data, total] = await Promise.all([
    q.lean(),
    Object.keys(filter).length ? Note.countDocuments(filter) : Note.estimatedDocumentCount(),
  ]);
  res.json(envelope(data, total, p));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, content } = req.body || {};
  const note = await Note.create({ owner: req.user.id, title, content });
  res.status(201).json(note);
}));

// Users can read their own note; admins can read any note.
router.get('/:id', validId, asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id).lean();
  if (!note || (req.user.role !== 'admin' && String(note.owner) !== req.user.id)) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json(note);
}));

// Modify/delete: owner only (admins inherit user rights on THEIR OWN notes; they can only view others').
router.patch('/:id', validId, asyncHandler(async (req, res) => {
  const update = {};
  if (typeof req.body?.title === 'string') update.title = req.body.title;
  if (typeof req.body?.content === 'string') update.content = req.body.content;
  const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.user.id }, update, {
    new: true, runValidators: true,
  });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
}));

router.delete('/:id', validId, asyncHandler(async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.status(204).end();
}));

module.exports = router;
