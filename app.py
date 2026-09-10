"""ARLO - Flask AI assistant backend."""

import ast
import json
import operator
import os
import re
from datetime import datetime

from flask import Flask, jsonify, render_template, request
from sklearn.feature_extraction.text import TfidfVectorizer
from zoneinfo import ZoneInfo

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAQ_PATH = os.path.join(BASE_DIR, "faq_data.json")
FAQ_THRESHOLD = 0.25


def load_faqs():
    try:
        with open(FAQ_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
        return [item for item in data if item.get("question") and item.get("answer")]
    except (FileNotFoundError, json.JSONDecodeError):
        return []


FAQ_DATA = load_faqs()
faq_questions = [item["question"] for item in FAQ_DATA]

if faq_questions:
    vectorizer = TfidfVectorizer(stop_words="english")
    faq_matrix = vectorizer.fit_transform(faq_questions)
else:
    vectorizer = None
    faq_matrix = None


def _normalize_question(text):
    return re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())


def _faq_match_score(question, faq_question):
    q = _normalize_question(question)
    f = _normalize_question(faq_question)
    if q == f:
        return 1.0
    if q in f or f in q:
        return 0.85
    q_tokens = set(q.split())
    f_tokens = set(f.split())
    if not q_tokens or not f_tokens:
        return 0.0
    overlap = len(q_tokens & f_tokens) / max(len(q_tokens | f_tokens), 1)
    return round(overlap, 4)


def match_faq(message):
    message = (message or "").strip()
    if not message or not FAQ_DATA:
        return None, 0.0

    normalized = _normalize_question(message)
    best_answer = None
    best_score = 0.0
    for item in FAQ_DATA:
        score = _faq_match_score(normalized, item.get("question", ""))
        if score > best_score:
            best_score = score
            best_answer = item.get("answer")

    if best_score >= FAQ_THRESHOLD:
        return best_answer, best_score

    college_keywords = [
        "college", "timing", "timings", "hours", "admission", "result", "leave",
        "fee", "contact", "office", "exam", "campus"
    ]
    if any(word in normalized for word in college_keywords):
        return best_answer, best_score

    return None, 0.0


_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_CALC_SAFE_CHARS = re.compile(r"^[\d\.\+\-\*\/\%\(\)\s]+$")
_PERCENT_OF = re.compile(r"([\d\.]+)\s*%\s*of\s*([\d\.]+)", re.IGNORECASE)


def _format_number(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, float):
        return round(value, 6)
    return value


def _eval_node(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("unsupported expression")


def try_calculate(message):
    text = (message or "").strip().rstrip("?").strip()
    if text.endswith("="):
        text = text[:-1].strip()

    percent_match = _PERCENT_OF.fullmatch(text) or _PERCENT_OF.search(text)
    if percent_match and "of" in text.lower():
        try:
            pct = float(percent_match.group(1))
            base = float(percent_match.group(2))
            return True, _format_number((pct / 100) * base)
        except (ValueError, ZeroDivisionError):
            return False, None

    if not text or not _CALC_SAFE_CHARS.match(text):
        return False, None
    if not re.search(r"[\+\-\*\/\%]", text) or not re.search(r"\d", text):
        return False, None

    try:
        tree = ast.parse(text, mode="eval")
        result = _eval_node(tree.body)
        return True, _format_number(result)
    except (SyntaxError, ValueError, ZeroDivisionError, TypeError):
        return False, None


def _faq_list_reply():
    if not FAQ_DATA:
        return "I don't have any FAQs loaded right now, but I can still help with general questions."
    items = [f"- {item['question']}" for item in FAQ_DATA[:12]]
    return "Here are the FAQ topics I can answer:\n" + "\n".join(items)


CONVERSATION_INTENTS = [
    (r"\b(hello|hi|hey)\b", lambda: "Hello! I'm ARLO. How can I help you today?"),
    (r"\b(how are you|how's it going)\b", lambda: "I'm doing great, thanks for asking. How can I help you today?"),
    (r"\b(who are you|what is your name|what's your name)\b", lambda: "I'm ARLO, your student-friendly AI assistant. I can chat, explain topics, do calculations, help with study prep, and manage notes and tasks."),
    (r"\b(what can you do|what do you do)\b", lambda: "I can chat naturally, answer college FAQs, explain concepts, solve calculations, tell the date and time, and help with notes and planning."),
    (r"\b(thanks|thank you|thankyou)\b", lambda: "You're welcome! I'm here whenever you need help."),
    (r"\b(bye|goodbye|see you)\b", lambda: "Goodbye! Come back anytime."),
    (r"(faq|faqs|what faqs can you answer|list faqs)", _faq_list_reply),
]

DATE_PATTERNS = [
    r"(today'?s date|current date|what'?s the date|what is the date|what day is it|which day is it|what day is today)",
]
TIME_PATTERNS = [
    r"(current time|what'?s the time|what is the time|what time is it|tell me the time)",
]


def build_local_study_reply(message):
    text = (message or "").lower()

    if "python" in text:
        return "Python is a beginner-friendly programming language used for automation, web apps, AI, and data work. A simple Python program usually has variables, functions, loops, and conditionals. Start with variables, input/output, lists, loops, and functions before learning OOP."
    if "sql" in text:
        return "SQL is used to store, fetch, and manage data in databases. Common commands are SELECT, INSERT, UPDATE, DELETE, and JOIN. It is essential for working with relational databases like MySQL, PostgreSQL, and SQLite."
    if "java" in text:
        return "Java is a widely used object-oriented programming language. It emphasizes classes, objects, methods, and inheritance. It is popular for backend development, Android apps, and enterprise systems."
    if "dsa" in text or "data structure" in text or "algorithm" in text:
        return "DSA means Data Structures and Algorithms. It helps you write efficient code by choosing the right data structure like arrays, stacks, queues, linked lists, trees, and graphs, and using efficient algorithms for searching and sorting."
    if "dbms" in text or "database" in text:
        return "DBMS stands for Database Management System. It manages data storage, retrieval, updates, and access control. Common database concepts include tables, keys, normalization, transactions, and joins."
    if "machine learning" in text or "ml" in text or "ai" in text:
        return "Machine learning is a way of training computers to find patterns from data and make predictions or decisions. It uses features, labels, training data, and evaluation. A common workflow is collect data, clean it, train a model, test it, and improve it."
    if "computer network" in text or "network" in text or "tcp" in text or "osi" in text:
        return "Computer networks connect devices so they can share resources and communicate. Important topics include IP addresses, routing, switching, protocols like TCP/IP, and layers such as the OSI model."
    if "html" in text or "css" in text or "javascript" in text or "web" in text:
        return "HTML structures the page, CSS styles it, and JavaScript adds interactivity. For web development, you usually build a layout with HTML, make it visually attractive with CSS, and use JavaScript for buttons, forms, and dynamic behavior."
    if "exam" in text or "study" in text or "revision" in text:
        return "For exam preparation, first list the important topics, make short notes, revise formulas and definitions daily, solve practice questions, and do a quick self-test before the exam."
    if "college" in text or "timing" in text or "admission" in text or "fee" in text:
        return "For college-related questions, check your notice board, official portal, or class coordinator for the latest timings, admission steps, or fee updates."
    return None


def _is_general_question(message):
    low = message.lower()
    general_phrases = [
        "what is", "what are", "how does", "explain", "who is", "why", "can you help",
        "help me", "what should", "tell me about", "i don't understand", "what is the difference",
        "difference between", "machine learning", "python", "sql", "recursion", "photosynthesis",
        "quantum computing", "how are you"
    ]
    return any(phrase in low for phrase in general_phrases)


def get_local_now():
    try:
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except Exception:
        return datetime.now()


def get_response(message, module="aichat"):
    msg = (message or "").strip()
    if not msg:
        return "Please type a message so I can help you.", "info"

    low = msg.lower()

    for pattern, responder in CONVERSATION_INTENTS:
        if re.search(pattern, low):
            return responder(), "conversation"

    if any(re.search(pattern, low, re.I) for pattern in TIME_PATTERNS):
        now = get_local_now()
        return f"It is currently {now.strftime('%I:%M %p')} in India.", "datetime"

    if any(re.search(pattern, low, re.I) for pattern in DATE_PATTERNS):
        now = get_local_now()
        return f"Today is {now.strftime('%A, %d %B %Y')}.", "datetime"

    ok, result = try_calculate(msg)
    if ok:
        return f"🧮 The answer is {result}.", "calculator"

    if module == "calculator":
        return "I couldn't read that as a valid calculation. Try 89 + 78, 100 / 4, or 25% of 800.", "calculator"

    faq_answer, faq_score = match_faq(msg)
    if faq_answer and faq_score >= FAQ_THRESHOLD and not _is_general_question(msg):
        return faq_answer, "faq"

    if module in ("aichat", "study"):
        local_study_reply = build_local_study_reply(msg)
        if local_study_reply:
            return local_study_reply, "study"
        if module == "study":
            return "I can help with study topics like Python, Java, SQL, DBMS, DSA, networking, and machine learning. Ask a specific topic and I will explain it clearly.", "info"
        return "I can help with FAQs, calculations, study topics, date and time, and everyday college questions. Try asking about Python, SQL, Java, DSA, or a college query.", "info"

    return "I'm not able to find a reliable answer to that yet. Try rephrasing it or asking from the FAQ list.", "fallback"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True, silent=True) or {}
    message = (data.get("message") or "").strip()
    module = (data.get("module") or "aichat").strip() or "aichat"
    reply, reply_type = get_response(message, module)
    return jsonify({"reply": reply, "type": reply_type, "module": module})


@app.route("/api/faqs", methods=["GET"])
def faqs():
    return jsonify([item["question"] for item in FAQ_DATA])


if __name__ == "__main__":
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5000"))
    app.run(host=HOST, port=PORT, debug=False)
