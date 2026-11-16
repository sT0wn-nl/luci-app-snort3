#!/usr/bin/env python3
"""Regenerate po/templates/snort.pot and po/nl/snort3.po.

Dutch translations live in tools/nl.json (English msgid -> Dutch).
Run after changing UI strings; missing translations are reported."""
import os, re, sys, subprocess, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
strings = json.loads(subprocess.check_output([sys.executable, os.path.join(root, 'tools/extract.py')]))
nl = json.load(open(os.path.join(root, 'tools/nl.json'), encoding='utf-8'))
def esc(s): return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
fmt = re.compile(r'%[-0-9.]*[sdhmtfq%]')
out = ['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Language: nl\\n"', '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"', '']
missing = 0
for en in strings:
    tr = nl.get(en)
    if tr is None:
        missing += 1; print('MISSING:', en); continue
    if sorted(fmt.findall(en)) != sorted(fmt.findall(tr)):
        print('FORMAT MISMATCH:', en, '=>', tr); sys.exit(1)
    out += ['msgid "%s"' % esc(en), 'msgstr "%s"' % esc(tr), '']
os.makedirs(os.path.join(root, 'po/nl'), exist_ok=True)
open(os.path.join(root, 'po/nl/snort3.po'), 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(strings), 'strings,', missing, 'missing')
