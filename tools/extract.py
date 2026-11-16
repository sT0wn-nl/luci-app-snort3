#!/usr/bin/env python3
"""Extract translatable strings (like LuCI's i18n-scan.pl) into po/templates/snort3.pot."""
import re, json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pat = re.compile(r"""\b_\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)""", re.S)
strings = []
def add(s):
    if s and s not in strings: strings.append(s)
for d, _, files in os.walk(os.path.join(root, 'htdocs')):
    for f in sorted(files):
        if f.endswith('.js'):
            src = open(os.path.join(d, f), encoding='utf-8').read()
            for m in pat.finditer(src):
                lit = m.group(1)
                q = lit[0]
                s = lit[1:-1].replace('\\' + q, q).replace('\\n', '\n')
                add(s)
menu = json.load(open(os.path.join(root, 'root/usr/share/luci/menu.d/luci-app-snort3.json')))
for v in menu.values(): add(v.get('title'))
acl = json.load(open(os.path.join(root, 'root/usr/share/rpcd/acl.d/luci-app-snort3.json')))
for v in acl.values(): add(v.get('description'))
def esc(s): return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
out = ['msgid ""', 'msgstr "Content-Type: text/plain; charset=UTF-8"', '']
for s in strings:
    out += ['msgid "%s"' % esc(s), 'msgstr ""', '']
os.makedirs(os.path.join(root, 'po/templates'), exist_ok=True)
open(os.path.join(root, 'po/templates/snort3.pot'), 'w', encoding='utf-8').write('\n'.join(out))
json.dump(strings, sys.stdout, ensure_ascii=False, indent=0)
