const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    interests: {
      type: [String],
      default: [],
      set: (arr) => [...new Set((arr || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    },
  },
  { timestamps: true }
);

// Login + uniqueness. Also serves any lookup by email.
userSchema.index({ email: 1 }, { unique: true });
// Multikey index: supports the $match on interests in the group-by-interests aggregation.
userSchema.index({ interests: 1 });

userSchema.methods.setPassword = async function (plain) {
  if (typeof plain !== 'string' || plain.length < 8 || plain.length > 72) {
    const e = new Error('Password must be 8-72 characters');
    e.status = 400;
    throw e;
  }
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
