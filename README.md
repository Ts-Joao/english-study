<div align="center">

# 📝 Corrigido — English Study Quiz

*A red-pen-in-the-margin quiz app for drilling English grammar before the final exam.*

**🔗 Live site: [ts-joao.github.io/english-study](https://ts-joao.github.io/english-study/)**

![Static Site](https://img.shields.io/badge/type-static%20site-green)
![No Backend](https://img.shields.io/badge/backend-none-blue)
![Vanilla JS](https://img.shields.io/badge/JavaScript-vanilla-yellow)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

---

## Why this exists

I'm taking an English course, and I built this to study for the **final test**. The topics that show up on the exam — verb tenses, conditionals, prepositions, phrasal verbs — needed focused, repeatable practice, and most quiz tools I found had the same problem: get an answer wrong, see "Incorrect", move on. No explanation of *why*, no way to tell which specific rule I'd confused.

So the whole app is built around one rule: **every option has its own feedback, right or wrong.** Picking the wrong tense doesn't just cost a point — it tells me exactly which rule I mixed up and why it doesn't apply here. That turns each wrong answer into an actual micro-lesson instead of a dead end, which is the only way review actually sticks for me.

It's also built to grow. New topics get added over time as the course moves forward — see [Adding a new topic](#adding-a-new-topic) below.

## What it does

- 🧩 **Multiple quiz topics** — tenses, conditionals, prepositions, phrasal verbs — each one a separate JSON file, easy to extend.
- 🔀 **Mixed review mode** — shuffles questions from every topic into one longer session.
- ✍️ **Feedback on every option**, not just the correct one — each wrong choice explains the specific rule behind the mistake, and no two explanations repeat the same reasoning.
- 🎲 **Randomized every attempt** — both question order and answer order are reshuffled each time, so you're not memorizing positions.
- 🎯 **Two retry modes** — redo the full quiz with a fresh shuffle, or redo *only* the questions you got wrong last time.
- 🏆 **Best score per topic**, remembered locally in the browser — no account, no backend, nothing to sign up for.
- ⌨️ **Keyboard shortcuts** — number keys to pick an answer, Enter to move on.

## Live demo

👉 **[ts-joao.github.io/english-study](https://ts-joao.github.io/english-study/)**

No installation needed — it's a static site, just open the link.

## Project structure

```
english-study/
├── index.html            # page structure (home, quiz, results screens)
├── css/
│   └── style.css          # all styling — notebook-paper theme, red-pen corrections
├── js/
│   └── app.js              # quiz logic: data loading, scoring, shuffling, retries
└── data/
    ├── categories.json     # index — maps each topic key to its JSON file
    ├── tenses.json
    ├── conditionals.json
    ├── prepositions.json
    └── phrasal.json
```

HTML, CSS, JS, and content are fully separated. Adding study material never requires touching code — a new topic is just a new JSON file plus one line in `categories.json`.

## Running it locally

`app.js` loads quiz data with `fetch()`, so opening `index.html` by double-clicking it will fail in most browsers — `file://` pages are blocked by CORS from fetching local JSON. Serve the folder instead:

```bash
git clone https://github.com/ts-joao/english-study.git
cd english-study
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Any static server works — VS Code's "Live Server" extension, `npx serve`, etc. — a Python server is just the simplest option that needs nothing extra installed.

## Adding a new topic

1. Create a new file in `data/`, following the structure below (see any existing file for a full example):

   ```json
   {
     "title": "Topic name",
     "eyebrow": "Category · Subtopic",
     "description": "One short sentence about this topic.",
     "questions": [
       {
         "tag": "Specific rule this question tests",
         "text": "A sentence with a gap marked as <code>______</code>",
         "options": [
           { "text": "option 1", "correct": false, "feedback": "Why this is wrong, and which rule it confuses." },
           { "text": "option 2", "correct": true, "feedback": "Why this is correct." }
         ]
       }
     ]
   }
   ```

2. Register it in `data/categories.json`:

   ```json
   { "key": "new-topic-key", "file": "data/new-topic-key.json" }
   ```

3. Reload the page — the new topic card appears automatically on the home screen. No HTML, CSS, or JS changes needed.

> 💡 There's a ready-made prompt for generating new quiz files with an LLM (ChatGPT, Gemini, another Claude session, etc.) that already matches this exact JSON schema and feedback style — ask if you'd like it again.

## Deployment

This repository is deployed with **GitHub Pages** directly from this branch — any push to `main` updates the live site at [ts-joao.github.io/english-study](https://ts-joao.github.io/english-study/) within a minute or two. No build step, no CI pipeline required.

## Tech stack

No frameworks, no bundler, no dependencies beyond web fonts loaded from Google Fonts (Fraunces, Caveat, IBM Plex Mono, Inter). Just HTML, CSS, and vanilla JavaScript — kept intentionally simple so it's easy to read, tweak, and extend while studying, without fighting tooling instead of studying English.

## Roadmap / ideas

- [ ] More topics: modal verbs, passive voice, reported speech, articles, comparatives
- [ ] "Only show questions I've never gotten right" mode
- [ ] Optional audio pronunciation via the Web Speech API
- [ ] Export/import progress as a JSON file for backup

## License

MIT — feel free to fork this for your own exam prep.