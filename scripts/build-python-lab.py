"""Bundle the existing exercise, checker and fixtures for the browser (stdlib only)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXERCISE = ROOT / 'python/exercise'
RUNNER = '''import json, types, traceback
from pathlib import Path
import grader

def execute(source, mode):
    mod = types.ModuleType('__main__' if mode == 'run' else 'student_solution')
    mod.__file__ = 'starter.py'
    try:
        exec(compile(source, 'starter.py', 'exec'), mod.__dict__)
    except SystemExit as e:
        if mode != 'run' or e.code not in (None, 0):
            raise
    if mode == 'run':
        return json.dumps({'kind': 'run'})
    data = json.loads(Path('fixtures/cases.json').read_text())
    rows = []
    for case in data['cases']:
        try:
            errors = grader.grade(mod, case)
            status = 'fail' if errors else 'pass'
            detail = '; '.join(errors) if errors else 'OK'
        except NotImplementedError as e:
            status, detail = 'incomplete', 'TODO: ' + str(e)
        except Exception:
            status, detail = 'fail', traceback.format_exc(limit=3)
        rows.append({'name': case['name'], 'status': status, 'detail': detail})
    return json.dumps({'kind': 'tests', 'rows': rows})
'''
SAMPLE = '''# A real Python example: touching half-open intervals are not overlapping.
def intervals_overlap(xa, wa, xb, wb):
    return xa < xb + wb and xb < xa + wa

print("A=[0,2), B=[2,4):", intervals_overlap(0, 2, 2, 2))
print("A=[0,2), B=[1,3):", intervals_overlap(0, 2, 1, 2))
assert intervals_overlap(0, 2, 2, 2) is False
assert intervals_overlap(0, 2, 1, 2) is True
print("Both example checks passed. Complete the starter to run all course cases.")
'''
data = {'id': 'legality-metrics', 'filename': 'starter.py',
        'starter': (EXERCISE / 'starter.py').read_text(),
        'reference': (EXERCISE / 'reference.py').read_text(),
        'grader': (EXERCISE / 'check.py').read_text(),
        'fixtures': json.loads((EXERCISE / 'fixtures/cases.json').read_text()),
        'runner': RUNNER, 'sample': SAMPLE}
destination = ROOT / 'site/python-lab/exercise.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(f'Browser Python exercise: {len(data["fixtures"]["cases"])} cases')
