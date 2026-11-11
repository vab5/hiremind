import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[2] / "hiremind.db"


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                mode TEXT NOT NULL,
                score INTEGER NOT NULL,
                hints INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                transcript TEXT NOT NULL,
                code TEXT NOT NULL,
                feedback TEXT NOT NULL
            )"""
        )


def save_session(topic, difficulty, mode, score, hints, transcript, code, feedback):
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO sessions (topic,difficulty,mode,score,hints,created_at,transcript,code,feedback) VALUES (?,?,?,?,?,?,?,?,?)",
            (topic, difficulty, mode, score, hints, datetime.now(timezone.utc).isoformat(), json.dumps(transcript), code, json.dumps(feedback)),
        )
        return cursor.lastrowid


def summary():
    with connect() as db:
        rows = db.execute("SELECT topic, score, hints, created_at FROM sessions ORDER BY created_at DESC LIMIT 40").fetchall()
    sessions = [dict(row) for row in rows]
    by_topic = {}
    for row in sessions:
        by_topic.setdefault(row["topic"], []).append(row["score"])
    topic_scores = [{"topic": topic, "score": round(sum(scores) / len(scores)), "sessions": len(scores)} for topic, scores in by_topic.items()]
    return {"sessions": sessions, "topicScores": topic_scores, "total": len(sessions), "average": round(sum(r["score"] for r in sessions) / len(sessions)) if sessions else 0}

