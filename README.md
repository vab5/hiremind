# HireMind

HireMind is a voice assisted interview practice app for computer science students. It pairs a conversational interviewer with a JavaScript workspace, gives structured feedback after a practice session, and tracks recent scores by topic.

The project is a local, single user prototype built with React, Vite, FastAPI, and SQLite. The language model is accessed through Vanderbilt's Amplify chat API. Browser speech recognition and speech synthesis provide optional voice input and spoken interviewer replies.

## What you can do

- Practice technical interviews in guided or realistic interview mode, or answer a behavioral prompt using STAR guidance.
- Choose a topic, difficulty, and interview format.
- Talk using browser speech recognition or type your answers. Hear interviewer replies using browser speech synthesis.
- Write JavaScript and run the included sample tests for the `firstDuplicate` function.
- Request up to three progressively more specific hints.
- Finish a session to receive feedback on problem solving, communication, correctness, and complexity.
- Review up to 40 recent saved sessions and average scores by topic on the dashboard.

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm
- A modern browser; voice input availability varies by browser and platform. Text input remains available.
- A Vanderbilt Amplify API key and model ID for live model-generated interviews, replies, hints, and evaluations. The assistant ID is optional.

Node.js is also used by the backend to run the JavaScript sample tests. The app does not require a separate database server: SQLite creates `hiremind.db` in the repository root on first backend start.

## Run locally

From the repository root, start the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually <http://localhost:5173>. The backend API is available at <http://localhost:8000>, with interactive API documentation at <http://localhost:8000/docs>.

## Configure Amplify

Create a `.env` file in the repository root (next to this README):

```dotenv
AMPLIFY_API_KEY=your_api_key
AMPLIFY_MODEL_ID=your_model_id
# Optional
AMPLIFY_ASSISTANT_ID=your_assistant_id
```

The backend reads these values from that root `.env` file. The API key is sent by the backend to `https://prod-api.vanderbilt.ai`; it is not needed in the browser. Keep `.env` private and do not commit it. The repository `.gitignore` excludes `.env` and local `*.db` files.

With no valid Amplify configuration or if the service request fails, the backend keeps the practice flow usable with built-in fallback behavior. The fallback provides a fixed sample problem, generic follow-up prompts, a sample hint, and canned evaluation feedback. It is useful for trying the interface, but it is not an AI-generated or personalized evaluation. Check the backend logs if you expect live Amplify responses.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `AMPLIFY_API_KEY` | Empty | Authenticates backend requests to Amplify. |
| `AMPLIFY_MODEL_ID` | Empty | Selects the Amplify model. Required for meaningful live model calls. |
| `AMPLIFY_ASSISTANT_ID` | Empty | Optional Amplify assistant identifier. |
| `VITE_API_URL` | `http://localhost:8000/api` | Frontend API base URL; set this in `frontend/.env` when the API is hosted elsewhere. |

For example, for a separately hosted backend, create `frontend/.env` with:

```dotenv
VITE_API_URL=https://your-api-host.example/api
```

The backend currently allows browser requests from `http://localhost:5173` and `http://localhost:3000`. Update its CORS configuration in `backend/app/main.py` if you serve the frontend from another origin.

## Data and API

SQLite persistence is initialized automatically. Session records include the topic, difficulty, mode, score, hint count, transcript, submitted code, feedback, and timestamp. The database is local to this checkout and can be reset by stopping the backend and deleting `hiremind.db`; it will be recreated at the next start.

The main endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Basic health and API-key configured status. |
| `POST` | `/api/start` | Create a technical or behavioral interview prompt. |
| `POST` | `/api/chat` | Continue the interview conversation. |
| `POST` | `/api/hint` | Generate a hint. |
| `POST` | `/api/run` | Run submitted JavaScript against sample tests. |
| `POST` | `/api/evaluate` | Evaluate the session transcript and code. |
| `POST` | `/api/sessions` | Persist the completed session. |
| `GET` | `/api/progress` | Return recent sessions and score summaries. |

## Current scope and limitations

- This is a local prototype, not a hosted multi-user service. There is no authentication, user separation, or cloud database.
- The JavaScript runner executes submitted code as a local Node.js subprocess with a three-second timeout. A timeout is not a security sandbox. Do not expose `/api/run` to untrusted users; a public deployment needs isolated execution, such as Judge0 or a container/microVM with resource and network restrictions.
- Browser speech recognition depends on browser support and permissions. If unavailable, use the text box. Spoken output depends on browser speech synthesis support.
- Interview history is stored in the local SQLite file; protect or remove it if transcripts or code contain sensitive material.
- The interface contains prototype presentation elements and should be reviewed for production use, accessibility, and cross-browser behavior.

## Project layout

```text
backend/
  app/                 FastAPI routes, Amplify client, and SQLite persistence
  requirements.txt     Python dependencies
frontend/
  src/                 React interface and views
  package.json         Vite scripts and JavaScript dependencies
```
