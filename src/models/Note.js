const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '', maxlength: 20000 },
  },
  { timestamps: true }
);

// A user's notes, newest first (ObjectId is time-ordered, so _id sorts by creation).
// Also serves the admin "filter by owner" view. Admin "all notes" and GET-by-id use the default _id index.
noteSchema.index({ owner: 1, _id: -1 });

module.exports = mongoose.model('Note', noteSchema);
