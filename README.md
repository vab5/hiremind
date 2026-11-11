# HireMind

HireMind is a voice-first technical interview simulator for CS students. It uses the Amplify chat API for the interviewer and evaluator, and the browser’s built-in Web Speech APIs for free voice input/output.

## Run locally

```bash
# terminal 1
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev
```

The root `.env` contains the Amplify settings used by the backend’s Pydantic config loader. If the API is unavailable, the UI uses a small local fallback so the practice flow remains demoable.

## Included features

- JavaScript test execution with a hard timeout through `POST /api/run`.
- SQLite session history and topic-level readiness through `POST /api/sessions` and `GET /api/progress`.
- Three progressive hint levels through `POST /api/hint`; hint usage is included in saved sessions.
- Guided, realistic, and behavioral interview modes.
- A dashboard that updates after each completed interview.

The current code runner is intended for local development only. Before exposing it to untrusted users, move execution into Judge0 or an isolated container/microVM; a process timeout alone is not a complete security sandbox.

