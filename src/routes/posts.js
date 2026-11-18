const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const { asyncHandler, authenticate, validId } = require('../middleware/auth');
const { parsePage } = require('../utils/pagination');

// ---- Scenario 2: all posts of a user via a single pipeline with $lookup. Posts are public. ----
// GET /api/posts/user/:id?page&limit
router.get('/user/:id', validId, asyncHandler(async (req, res) => {
  const p = parsePage(req.query);
  const uid = new mongoose.Types.ObjectId(req.params.id);

  const [result] = await User.aggregate([
    { $match: { _id: uid } },                       // _id index
    { $project: { name: 1 } },
    {
      $lookup: {
        from: Post.collection.name,
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$author', '$$uid'] } } }, // uses { author: 1, _id: -1 }
          { $sort: { _id: -1 } },                                // satisfied by the same index
          { $skip: p.skip },
          { $limit: p.limit },
          { $project: { title: 1, body: 1, createdAt: 1 } },
        ],
        as: 'posts',
      },
    },
  ]);
  if (!result) return res.status(404).json({ error: 'User not found' });

  const total = await Post.countDocuments({ author: uid });
  res.json({
    user: { _id: result._id, name: result.name },
    data: result.posts, page: p.page, limit: p.limit, total, pages: Math.ceil(total / p.limit),
  });
}));

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { title, body } = req.body || {};
  res.status(201).json(await Post.create({ author: req.user.id, title, body }));
}));

router.delete('/:id', authenticate, validId, asyncHandler(async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, author: req.user.id });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.status(204).end();
}));

module.exports = router;
