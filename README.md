# The Reader — AI College Admissions Predictor

A full-stack app that gives students an honest, structured "read" on their college application profile — the way an admissions officer would score it, not a vague chatbot answer.

You create an account, enter your GPA, test score, intended major, and a list of extracurriculars/honors, and Gemini returns a scored breakdown: an overall admissions score, a separate academic score, an individual 1-100 rating *for each activity* with specific feedback, a list of real strengths and weaknesses, and realistic reach/target/safety school odds. Every read is saved to your account, so you can track how your profile evolves over time.

**Stack:** Node.js + Express backend, SQLite database (`better-sqlite3`), JWT-based accounts, vanilla HTML/CSS/JS frontend, Google Gemini API. No build step, no framework — every file is readable top to bottom.

---

## What it actually does

### 1. Structured, per-item scoring — not one vague number
Most "AI rate my chances" tools just return a paragraph. This app forces the model to return a fixed shape of data: an academic score, a *separate score per activity* (so "Founded a 40-member coding club" and "Member of French club" get graded on their own merits, not averaged together), and an overall holistic score that's explicitly not just a mean of the parts — the same way a real admissions reader weighs a file.

This is enforced with Gemini's structured output feature (`responseSchema` in `server.js`), which constrains the model at the API level to only return integers where a score is expected and strings where feedback is expected. It's not asking nicely — the model literally cannot return `"pretty solid, maybe an 80"` where an integer is required.

### 2. A deliberately tough grading prompt
The prompt (`buildPrompt()` in `server.js`) explicitly instructs the model to act as *"a veteran US college admissions officer... grade on the real curve of applicants to selective US colleges"* and to avoid "artificially encouraging" scores or vague filler like "well-rounded." The goal is a realistic read, not flattery.

### 3. Accounts and history
Sign up with an email/password (hashed with bcrypt — plaintext is never stored). Every submission is saved to a `predictions` table linked to your account, so the History view can show your past reads with their scores and dates. Sessions are handled with JWTs, not server-side session storage, so the backend stays stateless.

### 4. Your API key never gets exposed
The browser never talks to Google directly. The frontend sends your Gemini key to *your own* local server over `/api/predict`, and only the server makes the outbound call to `generativelanguage.googleapis.com`. That means your key never shows up in browser dev tools or gets baked into any client-side code.

### 5. Auto-updating model reference
Google renames and deprecates Gemini models frequently. Instead of hardcoding a specific version, the app defaults to `gemini-flash-latest` — an alias Google maintains that always points to their current recommended Flash model, so the app doesn't silently break every few months.

---

## How a request flows through the app

1. **Browser** (`public/script.js`) — collects the form, attaches your session JWT and (optionally) your Gemini key, POSTs to `/api/predict`
2. **Server** (`server.js`) — verifies your JWT, builds the grading prompt from your form data, calls Gemini with a strict response schema, parses the returned JSON
3. **Database** (`db.js`) — the parsed result is saved to `predictions`, linked to your `user_id`
4. **Server** — sends the clean JSON back to the browser
5. **Browser** — `renderResults()` drops each field into its matching spot in the page: score numbers, progress bars, activity cards, strength/improvement lists, and school-tier rows

Nothing is manually parsed or regex-matched anywhere in this chain — the schema guarantees the shape all the way through.

---

## Project structure

```
college-predictor/
├── server.js          Express server, auth routes, Gemini prompt + call, response schema
├── db.js               SQLite setup — users + predictions tables
├── public/
│   ├── index.html       Auth screen, form, results, history views
│   ├── script.js        Client-side state, auth flow, form handling, rendering
│   └── style.css         Report-card styling
├── package.json
└── .env.example         Template for your Gemini key, JWT secret, model, port
```

---

## Quick start

```bash
npm install
cp .env.example .env   # add your Gemini key + a random JWT_SECRET
npm start
```
Then open `http://localhost:3000`, sign up, and submit your profile. Full setup details are in `.env.example`'s comments if you get stuck.