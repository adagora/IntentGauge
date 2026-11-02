"""Execute the actual CityWheels loop with its offline provider; never load .env."""
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime

root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
from citywheels.agent import run_agent
from citywheels.fake_model import FakeModel

request = json.load(sys.stdin)
source = root / 'data'
original = (source / 'bookings.json').read_bytes()
with tempfile.TemporaryDirectory(prefix='evallol-citywheels-') as folder:
    data = Path(folder) / 'data'
    shutil.copytree(source, data)
    patch = request.get('bookingPatch')
    if patch is not None:
        if set(patch) != {'id', 'rental_price_eur'}:
            raise ValueError('Only a fixture rental-price override is supported')
        value = patch['rental_price_eur']
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError('Fixture price must be finite and nonnegative')
        bookings = json.loads((data / 'bookings.json').read_text())
        found = [b for b in bookings if b['id'] == patch['id']]
        if len(found) != 1:
            raise ValueError('Fixture override must identify one existing booking')
        found[0]['rental_price_eur'] = value
        (data / 'bookings.json').write_text(json.dumps(bookings))
    before = (data / 'bookings.json').read_bytes()
    now = datetime.fromisoformat(request['now']) if request.get('now') else None
    result = run_agent(request['question'], FakeModel(), data_dir=data, now=now)
    after = (data / 'bookings.json').read_bytes()
    refund = next((c['result'] for c in reversed(result.tool_trace) if c['name'] == 'calculate_refund'), None)
    retrieved = {}
    for call in result.tool_trace:
        if call['name'] == 'search_policies':
            for passage in call['result'].get('passages', []):
                key = passage['source'] + '#' + passage['heading']
                retrieved[key] = {'id': key, 'text': passage['text'], 'metadata': {'source': passage['source'], 'heading': passage['heading']}}
    observation = {
        'answer': result.answer,
        'toolCalls': result.tool_trace,
        'retrieved': list(retrieved.values()),
        'data': {
            'provider': 'fake', 'execution': 'actual-agent-offline-provider',
            'answerLower': result.answer.lower(), 'refund': refund,
            'bookingsUnchanged': before == after and original == (source / 'bookings.json').read_bytes(),
            'bookingFixtureHash': hashlib.sha256(before).hexdigest(),
            'clock': request.get('now') or '2026-06-10T09:00:00+02:00',
            'intentTelemetry': 'not-emitted-by-agent',
        },
    }
    # No synthetic intent, abstention, citation or cost measurements.
    print(json.dumps(observation, ensure_ascii=False))
