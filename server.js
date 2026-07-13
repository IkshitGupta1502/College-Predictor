require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set in .env — using an insecure default. Fine for local testing, not for anything real.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth helpers ----

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
}

// ---- Auth routes ----

app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and a password of at least 8 characters are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), passwordHash);
  const user = { id: info.lastInsertRowid, email: email.toLowerCase() };

  res.json({ token: signToken(user), email: user.email });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  res.json({ token: signToken(user), email: user.email });
});

app.get('/api/history', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, input_json, result_json, overall_score, created_at FROM predictions WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  const history = rows.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    overallScore: r.overall_score,
    input: JSON.parse(r.input_json),
    result: JSON.parse(r.result_json)
  }));

  res.json({ history });
});

// JSON schema Gemini must follow. Using structured output keeps the
// response predictable so the frontend doesn't have to guess at shape.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    overallScore: { type: 'integer' },
    overallVerdict: { type: 'string' },
    academic: {
      type: 'object',
      properties: {
        score: { type: 'integer' },
        feedback: { type: 'string' }
      },
      required: ['score', 'feedback']
    },
    extracurriculars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          activity: { type: 'string' },
          score: { type: 'integer' },
          feedback: { type: 'string' }
        },
        required: ['activity', 'score', 'feedback']
      }
    },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    schoolTiers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tier: { type: 'string' },
          examples: { type: 'string' },
          admitChancePercent: { type: 'integer' }
        },
        required: ['tier', 'examples', 'admitChancePercent']
      }
    }
  },
  required: ['overallScore', 'overallVerdict', 'academic', 'extracurriculars', 'strengths', 'improvements', 'schoolTiers']
};

function buildPrompt({ gpa, gpaScale, testScore, testType, activities, targetMajor, notes }) {
  const activityList = activities
    .map((a, i) => `${i + 1}. ${a}`)
    .join('\n');

  return `You are a veteran US college admissions officer with 20 years of experience reading applications at selective universities. Evaluate this student's profile honestly and rigorously, the way a real admissions committee would. Do not be artificially encouraging — grade on the real curve of applicants to selective US colleges.

STUDENT PROFILE
GPA: ${gpa} out of ${gpaScale}
${testScore ? `Standardized test score: ${testScore} (${testType})` : 'Standardized test score: not provided'}
Intended major/interest: ${targetMajor || 'undecided'}
Extracurricular activities, honors, and awards:
${activityList}
${notes ? `Additional context: ${notes}` : ''}

INSTRUCTIONS
Rate everything on a 1-100 scale where 100 is the strongest possible profile for admission to the most selective US universities (acceptance rate under 5%), and 1 is extremely weak.
- Score the academic profile (GPA + test score + rigor implied) as a single "academic" score with feedback.
- Score each individual extracurricular/activity separately based on its selectivity, leadership, impact, and how it will read to an admissions committee (a generic club membership scores low; a national award, founded organization, or significant leadership role scores high).
- Give an "overallScore" that is your holistic judgment of the whole application (not just an average of the parts).
- List 3-5 genuine strengths and 3-5 genuine areas for improvement, written directly to the student.
- Give realistic admission chance percentages for 3 tiers: "Reach" (e.g. Ivy+/top 15), "Target" (e.g. solid selective schools where they're competitive), and "Safety" (schools they're very likely to get into), each with a couple of representative example school names and an admitChancePercent.
Be direct and specific. Avoid vague filler like "well-rounded." Return ONLY the JSON matching the required schema, no other text.`;
}

app.post('/api/predict', requireAuth, async (req, res) => {
  try {
    const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'No Gemini API key provided. Enter one in the form, or set GEMINI_API_KEY in your .env file.' });
    }

    const { gpa, gpaScale, testScore, testType, activities, targetMajor, notes } = req.body;

    if (!gpa || !Array.isArray(activities) || activities.filter(Boolean).length === 0) {
      return res.status(400).json({ error: 'Please provide a GPA and at least one extracurricular activity.' });
    }

    const cleanInput = {
      gpa,
      gpaScale: gpaScale || '4.0',
      testScore,
      testType: testType || 'SAT',
      activities: activities.filter(Boolean),
      targetMajor,
      notes
    };

    const prompt = buildPrompt(cleanInput);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Gemini API request failed. Check your API key and try again.', details: errText });
    }

    const data = await geminiRes.json();
    const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textPart) {
      console.error('Unexpected Gemini response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Gemini returned an unexpected response.' });
    }

    let result;
    try {
      result = JSON.parse(textPart);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', textPart);
      return res.status(502).json({ error: 'Could not parse the AI response.' });
    }

    db.prepare(
      'INSERT INTO predictions (user_id, input_json, result_json, overall_score) VALUES (?, ?, ?, ?)'
    ).run(req.user.userId, JSON.stringify(cleanInput), JSON.stringify(result), result.overallScore || 0);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong generating your prediction.' });
  }
});

app.listen(PORT, () => {
  console.log(`College Predictor running at http://localhost:${PORT}`);
});