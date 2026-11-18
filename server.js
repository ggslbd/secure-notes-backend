require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const User = require('./src/models/User');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET must be set (16+ chars)');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // behind Render's proxy (needed for correct rate-limit IPs)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8080')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors({
  origin: origins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/notes', require('./src/routes/notes'));
app.use('/api/posts', require('./src/routes/posts'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 11000) return res.status(409).json({ error: 'Email already in use' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (await User.findOne({ email: ADMIN_EMAIL.toLowerCase() }).lean()) return;
  const admin = new User({ name: 'Admin', email: ADMIN_EMAIL, role: 'admin' });
  await admin.setPassword(ADMIN_PASSWORD);
  await admin.save();
  console.log('Seeded admin', admin.email);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/secure_notes');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build declared indexes
  await seedAdmin();
  app.listen(process.env.PORT || 3000, () => console.log('Listening'));
})();
