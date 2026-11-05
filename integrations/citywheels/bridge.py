import hashlib
import json
import math
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime
from decimal import Decimal
from pathlib import Path

AMOUNT = re.compile(
    r"(?:€\s*|\bEUR\b\s*)(\d+(?:[.,]\d{1,2})?)(?!\d|[.,]\d)|(?<![\d.,])(\d+(?:[.,]\d{1,2})?)\s*(?:€|\bEUR\b|\beuros?\b)",
    re.IGNORECASE,
)
NUMBER = re.compile(r"(?<![\d.,])\d+(?:[.,]\d+)?")


def numbers_in(text):
    found = set()
    for match in NUMBER.finditer(text):
        found.add(Decimal(match.group(0).replace(",", ".")).normalize())
    return found


def ungrounded_amounts(answer, tool_calls):
    grounded = numbers_in(json.dumps([call["result"] for call in tool_calls], ensure_ascii=False))
    missing = []
    for match in AMOUNT.finditer(answer):
        amount = Decimal((match.group(1) or match.group(2)).replace(",", ".")).normalize()
        if amount not in grounded and float(amount) not in missing:
            missing.append(float(amount))
    return missing


def apply_price_patch(data, patch):
    if set(patch) != {"id", "rental_price_eur"}:
        raise ValueError("Only a fixture rental-price override is supported")
    value = patch["rental_price_eur"]
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError("Fixture price must be finite and nonnegative")
    path = data / "bookings.json"
    bookings = json.loads(path.read_text())
    found = [booking for booking in bookings if booking["id"] == patch["id"]]
    if len(found) != 1:
        raise ValueError("Fixture override must identify one existing booking")
    found[0]["rental_price_eur"] = value
    path.write_text(json.dumps(bookings))


def build_model(arguments):
    if "--live" not in arguments:
        from citywheels.fake_model import FakeModel

        return "fake", "fake-helpdesk", FakeModel()
    from citywheels.openai_model import OpenAIModel

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise ValueError("Live mode requires OPENAI_API_KEY")
    index = arguments.index("--model") if "--model" in arguments else -1
    model = arguments[index + 1] if index >= 0 else "gpt-4o-mini"
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    return "openai", model, OpenAIModel(key, model, base_url)


def main():
    root = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(root))
    from citywheels.agent import run_agent
    from citywheels.clock import FIXED_NOW

    request = json.load(sys.stdin)
    provider, model_name, model = build_model(sys.argv[2:])
    source = root / "data"
    original = (source / "bookings.json").read_bytes()
    with tempfile.TemporaryDirectory(prefix="evallol-citywheels-") as folder:
        data = Path(folder) / "data"
        shutil.copytree(source, data)
        if request.get("bookingPatch") is not None:
            apply_price_patch(data, request["bookingPatch"])
        before = (data / "bookings.json").read_bytes()
        now = datetime.fromisoformat(request["now"]) if request.get("now") else None
        result = run_agent(request["question"], model, data_dir=data, now=now)
        after = (data / "bookings.json").read_bytes()
    tool_calls = [
        {"name": step["name"], "arguments": step["arguments"], "result": step["result"]}
        for step in result.tool_trace
    ]
    refund = next((call["result"] for call in reversed(tool_calls) if call["name"] == "calculate_refund"), None)
    retrieved = {}
    for call in tool_calls:
        if call["name"] == "search_policies":
            for passage in call["result"].get("passages", []):
                key = passage["source"] + "#" + passage["heading"]
                retrieved[key] = {
                    "id": key,
                    "text": passage["text"],
                    "metadata": {"source": passage["source"], "heading": passage["heading"]},
                }
    observation = {
        "answer": result.answer,
        "toolCalls": tool_calls,
        "retrieved": list(retrieved.values()),
        "data": {
            "provider": provider,
            "model": model_name,
            "execution": "help-desk-agent-python",
            "answerLower": result.answer.lower(),
            "refund": refund,
            "writeIntents": result.write_intents,
            "writeIntentCount": len(result.write_intents),
            "ungroundedAmounts": ungrounded_amounts(result.answer, tool_calls),
            "clock": request.get("now") or FIXED_NOW.isoformat(),
            "bookingsUnchanged": before == after and original == (source / "bookings.json").read_bytes(),
            "bookingFixtureHash": hashlib.sha256(before).hexdigest(),
            "audit": "not-recorded",
        },
    }
    print(json.dumps(observation, ensure_ascii=False))


main()
