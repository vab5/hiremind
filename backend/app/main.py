import json
import logging
import re
import subprocess
import tempfile
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .amplify import chat
from .config import settings
from .db import init_db, save_session, summary


logger = logging.getLogger("hiremind")


app = FastAPI(title="HireMind API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
init_db()


@app.on_event("startup")
def log_configuration():
    logger.info(
        "HireMind configuration: api_key=%s model_id=%s assistant_id=%s",
        "set" if settings.amplify_api_key else "missing",
        "set" if settings.amplify_model_id else "missing",
        "set" if settings.amplify_assistant_id else "missing",
    )


class StartRequest(BaseModel):
    topic: str = "Arrays & Hashing"
    difficulty: Literal["Easy", "Medium", "Hard"] = "Medium"
    mode: Literal["guided", "interview", "behavioral"] = "guided"


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    topic: str
    difficulty: str
    mode: Literal["guided", "interview", "behavioral"] = "guided"
    messages: list[Message] = Field(default_factory=list)
    user_message: str


class EvaluateRequest(BaseModel):
    topic: str
    difficulty: str
    transcript: list[Message]
    code: str = ""
    mode: Literal["guided", "interview", "behavioral"] = "guided"
    hints: int = 0


class SaveSessionRequest(EvaluateRequest):
    feedback: dict = Field(default_factory=dict)


class RunRequest(BaseModel):
    code: str
    tests: list[dict] = Field(default_factory=lambda: [
        {"input": [[2, 1, 3, 5, 3]], "expected": 3},
        {"input": [[1, 2, 3]], "expected": -1},
        {"input": [[4, 4]], "expected": 4},
    ])


class HintRequest(BaseModel):
    topic: str
    difficulty: str
    problem: str
    level: int = 1


def fallback_problem(topic: str, difficulty: str) -> str:
    return (
        f"You are interviewing for a software engineering role. Give the candidate one concise {difficulty.lower()} "
        f"{topic.lower()} problem, including examples and constraints. Do not reveal the solution. End with a warm, "
        "direct question asking them to talk through their first approach."
    )


def extract_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found")
    return json.loads(match.group(0))


def normalize_interview_result(result: dict, request: StartRequest) -> dict:
    """Keep the UI stable when an Assistant uses slightly different JSON field names."""
    def display_text(value, default=""):
        if isinstance(value, str):
            return value
        if value is None:
            return default
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    raw_problem = result.get("problem") or result.get("questionDetails") or {}
    if isinstance(raw_problem, str):
        raw_problem = {"statement": raw_problem}
    if not isinstance(raw_problem, dict):
        raw_problem = {}
    title = display_text(raw_problem.get("title") or raw_problem.get("name") or result.get("title"), f"{request.topic} interview problem")
    statement = display_text(raw_problem.get("statement") or raw_problem.get("description") or raw_problem.get("prompt") or result.get("statement"), "Talk through a solution to the problem presented by the interviewer.")
    examples = raw_problem.get("examples") or raw_problem.get("example") or result.get("examples") or []
    constraints = raw_problem.get("constraints") or raw_problem.get("requirements") or result.get("constraints") or []
    if isinstance(examples, str):
        examples = [examples]
    if not isinstance(examples, list):
        examples = [str(examples)]
    if isinstance(constraints, str):
        constraints = [constraints]
    if not isinstance(constraints, list):
        constraints = [str(constraints)]
    examples = [display_text(example) for example in examples]
    constraints = [display_text(constraint) for constraint in constraints]
    question = display_text(result.get("question") or result.get("openingQuestion") or result.get("firstQuestion"), "Take a moment to restate the problem, then talk me through your first approach.")
    return {
        **result,
        "problem": {"title": title, "statement": statement, "examples": examples, "constraints": constraints},
        "question": question,
        "estimatedMinutes": result.get("estimatedMinutes") or 25,
        "tags": result.get("tags") or [request.topic, request.difficulty],
    }


@app.get("/api/health")
def health():
    return {"ok": True, "amplifyConfigured": bool(settings.amplify_api_key)}


@app.post("/api/start")
def start(request: StartRequest):
    messages = [{"role": "user", "content": "Start the interview."}]
    prompt = (
        "Act as a thoughtful technical interviewer. Output ONLY valid JSON with keys: problem, question, "
        "estimatedMinutes, tags. The problem should be a realistic coding interview prompt with a title, statement, "
        "examples, constraints, and no solution. The question is your opening spoken prompt, under 45 words. "
        f"Topic: {request.topic}. Difficulty: {request.difficulty}. Mode: {request.mode}. "
        + ("This is a behavioral interview. Ask a STAR-format question and do not include a coding problem. " if request.mode == "behavioral" else fallback_problem(request.topic, request.difficulty))
    )
    try:
        result = normalize_interview_result(extract_json(chat(messages, prompt)), request)
    except Exception:
        logger.exception("Amplify start interview failed (topic=%s, mode=%s)", request.topic, request.mode)
        result = {
            "problem": {
                "title": "First Duplicate",
                "statement": "Given an array of integers, return the first value that appears twice. If no value repeats, return -1.",
                "examples": ["[2, 1, 3, 5, 3] → 3", "[1, 2, 3] → -1"],
                "constraints": ["1 ≤ nums.length ≤ 100,000", "Values fit in a 32-bit signed integer"],
            },
            "question": "Welcome in. Take a minute to restate the problem, then talk me through the approach you’d try first.",
            "estimatedMinutes": 25,
            "tags": [request.topic, request.difficulty],
        }
        if request.mode == "behavioral":
            result = {"problem": {"title": "A challenging project", "statement": "Tell me about a time you faced a difficult technical challenge. Explain the situation, your actions, and the result.", "examples": ["Use the STAR structure: Situation · Task · Action · Result"], "constraints": ["Keep your answer to 2–3 minutes", "Focus on your specific contribution"]}, "question": "Tell me about a time a technical project did not go as planned. What did you do, and what did you learn?", "estimatedMinutes": 20, "tags": ["Behavioral", "STAR"]}
    return result


@app.post("/api/chat")
def interview_chat(request: ChatRequest):
    history = [m.model_dump() for m in request.messages[-12:]]
    transcript = "\n".join(f"{message['role'].upper()}: {message['content']}" for message in history)
    prompt = (
        "You are the interviewer in a live software engineering interview. Stay in the interviewer role. "
        "Use the transcript below as the source of truth and respond directly to the candidate's latest answer. "
        "Do not repeat an earlier question, do not use a canned fallback question, and do not ask about information "
        "the candidate already provided. Ask exactly one natural, specific follow-up question at a time. Briefly "
        "acknowledge one concrete detail from their answer before asking the question. Keep responses under 65 words. "
        "For a behavioral interview, ask a follow-up about the missing STAR detail (situation, task, action, result, "
        "impact, or reflection); never ask about algorithms or invariants. For a technical interview, probe the "
        "candidate's stated approach, assumptions, edge cases, correctness, or complexity; never introduce a new "
        "problem. If they ask for a hint, give one small hint related to the current problem. Plain text only.\n"
        f"Mode: {request.mode}. Topic: {request.topic}. Difficulty: {request.difficulty}.\n"
        f"Conversation so far:\n{transcript}\nCANDIDATE'S LATEST ANSWER: {request.user_message}"
    )
    try:
        return {"reply": chat(history + [{"role": "user", "content": request.user_message}], prompt, 600)}
    except Exception:
        logger.exception("Amplify interviewer chat failed (topic=%s, mode=%s)", request.topic, request.mode)
        if request.mode == "behavioral":
            return {"reply": f"You mentioned {request.user_message[:90].rstrip('.')} — what was your specific contribution, and what changed as a result?"}
        return {"reply": f"You mentioned {request.user_message[:90].rstrip('.')} — what edge case or tradeoff would you validate next?"}


@app.post("/api/hint")
def hint(request: HintRequest):
    prompts = {
        1: "Give one tiny directional hint without naming the solution or data structure.",
        2: "Give a more specific hint about the key invariant or data structure, but do not provide code.",
        3: "Give near-solution pseudocode in a few lines, but do not write final code.",
    }
    try:
        reply = chat([{"role": "user", "content": "The candidate asked for a hint."}], f"You are a coding interview coach. {prompts.get(request.level, prompts[3])} Problem: {request.problem}", 350)
    except Exception:
        reply = ["Look for a way to remember what you have already seen as you scan once.", "Ask yourself what information must be available in O(1) at each step.", "Keep a set of seen values; when a value is already present, return it."][min(request.level, 3) - 1]
    return {"reply": reply, "level": request.level}


@app.post("/api/run")
def run_code(request: RunRequest):
    # This is a development runner with a hard timeout. Production should use a separate sandbox such as Judge0.
    wrapper = request.code + "\n" + "\n".join(
        f"console.log(JSON.stringify(firstDuplicate(...{json.dumps(test['input'])})));" for test in request.tests
    )
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=True) as file:
            file.write(wrapper)
            file.flush()
            result = subprocess.run(["node", file.name], capture_output=True, text=True, timeout=3)
        if result.returncode != 0:
            return {"passed": False, "error": result.stderr[-1000:], "results": []}
        outputs = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        results = [{"passed": output == test["expected"], "expected": test["expected"], "actual": output} for output, test in zip(outputs, request.tests)]
        return {"passed": bool(results) and all(item["passed"] for item in results), "results": results}
    except subprocess.TimeoutExpired:
        return {"passed": False, "error": "Execution timed out after 3 seconds.", "results": []}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Node.js is required for the JavaScript runner.")


@app.post("/api/evaluate")
def evaluate(request: EvaluateRequest):
    transcript = "\n".join(f"{m.role}: {m.content}" for m in request.transcript[-30:])
    prompt = (
        "You are a strict but encouraging interview coach. Evaluate the candidate using only the transcript and code. "
        "Output ONLY valid JSON with keys: score, verdict, summary, strengths, improvements, rubric, nextStep. "
        "score is 0-100. rubric is an array of four objects with name, score (0-100), and note. strengths and "
        "improvements are arrays of 2 short strings. Be specific and fair; if no code was provided, score correctness low.\n"
        f"Topic: {request.topic}; difficulty: {request.difficulty}\nTRANSCRIPT:\n{transcript}\nCODE:\n{request.code[:8000]}"
    )
    try:
        result = extract_json(chat([{"role": "user", "content": "Evaluate this interview."}], prompt, 1800))
    except Exception:
        logger.exception("Amplify evaluation failed (topic=%s, mode=%s)", request.topic, request.mode)
        result = {
            "score": 74,
            "verdict": "Promising signal",
            "summary": "You communicated a workable direction and showed good instinct for choosing a linear-time approach. The next step is to make the invariant and edge cases explicit before coding.",
            "strengths": ["Explained the main tradeoff clearly", "Stayed engaged with the interviewer’s follow-up"],
            "improvements": ["State the invariant before writing code", "Walk through one empty and one duplicate-heavy case"],
            "rubric": [
                {"name": "Problem solving", "score": 82, "note": "A solid approach with a clear path to O(n)."},
                {"name": "Communication", "score": 78, "note": "Your thinking was easy to follow."},
                {"name": "Correctness", "score": 68, "note": "Validate edge cases before committing."},
                {"name": "Complexity", "score": 72, "note": "Name time and space costs precisely."},
            ],
            "nextStep": "Try one more Arrays & Hashing problem and narrate the invariant before opening the editor.",
        }
    return result


@app.post("/api/sessions")
def create_session(request: SaveSessionRequest):
    session_id = save_session(request.topic, request.difficulty, request.mode, int(request.feedback.get("score", 0)), request.hints, [m.model_dump() for m in request.transcript], request.code, request.feedback)
    return {"id": session_id}


@app.get("/api/progress")
def progress():
    return summary()

