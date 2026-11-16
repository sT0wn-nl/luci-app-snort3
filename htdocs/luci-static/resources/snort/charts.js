'use strict';
'require baseclass';

/*
 * Small dependency-free chart kit for luci-app-snort.
 *
 * Colours (validated for contrast and colour-vision deficiency):
 *  - single series: blue #2a78d6 (light) / #3987e5 (dark)
 *  - priority (ordinal, one hue): high → low = dark → light (light theme),
 *    light → dark on the dark theme
 *  - heatmap: sequential blue ramp, near-zero recedes to the surface
 * Text always uses the theme's own ink; identity is never colour alone
 * (legends, labels and tooltips name every series).
 */

const CSS = `
.snv{--snv-1:#2a78d6;--snv-grid:rgba(0,0,0,.09);--snv-axis:rgba(0,0,0,.25);--snv-muted:#898781;
--snv-p1:#0d366b;--snv-p2:#1c5cab;--snv-p3:#3987e5;--snv-p4:#86b6ef;
--snv-h0:rgba(128,128,128,.10);--snv-h1:#cde2fb;--snv-h2:#9ec5f4;--snv-h3:#6da7ec;--snv-h4:#3987e5;--snv-h5:#256abf;--snv-h6:#184f95;
--snv-hover:rgba(128,128,128,.14);--snv-tip-bg:#fcfcfb;--snv-tip-fg:#0b0b0b;--snv-tip-bd:rgba(11,11,11,.12)}
[data-darkmode="true"] .snv{--snv-1:#3987e5;--snv-grid:rgba(255,255,255,.08);--snv-axis:rgba(255,255,255,.22);
--snv-p1:#cde2fb;--snv-p2:#86b6ef;--snv-p3:#3987e5;--snv-p4:#1c5cab;
--snv-h0:rgba(128,128,128,.14);--snv-h1:#104281;--snv-h2:#1c5cab;--snv-h3:#2a78d6;--snv-h4:#5598e7;--snv-h5:#86b6ef;--snv-h6:#cde2fb;
--snv-tip-bg:#262624;--snv-tip-fg:#f0efec;--snv-tip-bd:rgba(255,255,255,.12)}
@media (prefers-color-scheme:dark){:root:not([data-darkmode="false"]) .snv{--snv-1:#3987e5;--snv-grid:rgba(255,255,255,.08);--snv-axis:rgba(255,255,255,.22);
--snv-p1:#cde2fb;--snv-p2:#86b6ef;--snv-p3:#3987e5;--snv-p4:#1c5cab;
--snv-h0:rgba(128,128,128,.14);--snv-h1:#104281;--snv-h2:#1c5cab;--snv-h3:#2a78d6;--snv-h4:#5598e7;--snv-h5:#86b6ef;--snv-h6:#cde2fb;
--snv-tip-bg:#262624;--snv-tip-fg:#f0efec;--snv-tip-bd:rgba(255,255,255,.12)}}
.snv{position:relative;font-size:12px;line-height:1.3}
.snv-plot{position:relative;margin-left:3.2em}
.snv-grid{position:absolute;left:0;right:0;border-top:1px solid var(--snv-grid);pointer-events:none}
.snv-grid.base{border-top-color:var(--snv-axis)}
.snv-ylab{position:absolute;left:-3.4em;width:3em;text-align:right;transform:translateY(-50%);color:var(--snv-muted);font-variant-numeric:tabular-nums}
.snv-cols{position:absolute;inset:0;display:flex;align-items:stretch;gap:2px}
.snv-col{flex:1;display:flex;flex-direction:column-reverse;gap:2px;min-width:0;border-radius:4px 4px 0 0;cursor:default}
.snv-col:hover{background:var(--snv-hover)}
.snv-seg{width:100%;flex:none}
.snv-col .snv-seg:last-child{border-radius:4px 4px 0 0}
.snv-xlabs{display:flex;gap:2px;margin-left:3.2em;color:var(--snv-muted);height:1.6em;align-items:flex-end}
.snv-xlabs>div{flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:visible}
.snv-legend{display:flex;flex-wrap:wrap;gap:.4em 1.2em;margin:.2em 0 .6em}
.snv-legend span{display:inline-flex;align-items:center;gap:.4em}
.snv-sw{display:inline-block;width:.9em;height:.9em;border-radius:3px}
.snv-tip{position:fixed;z-index:10000;pointer-events:none;background:var(--snv-tip-bg);color:var(--snv-tip-fg);border:1px solid var(--snv-tip-bd);
border-radius:6px;padding:.45em .7em;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.18);display:none;max-width:22em}
.snv-tip b{display:block;margin-bottom:.25em}
.snv-tip .r{display:flex;gap:.6em;justify-content:space-between;align-items:center}
.snv-tip .r span:last-child{font-variant-numeric:tabular-nums;font-weight:bold}
.snv-hb{display:grid;grid-template-columns:minmax(6em,40%) 1fr auto;gap:.35em .6em;align-items:center}
.snv-hb .l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.snv-hb .t{height:.9em;border-radius:0 4px 4px 0;background:var(--snv-1);min-width:2px}
.snv-hb .v{text-align:right;font-variant-numeric:tabular-nums;color:inherit}
.snv-hm{display:grid;gap:2px;align-items:center}
.snv-hm .c{height:1.5em;border-radius:3px}
.snv-hm .c:hover{outline:2px solid var(--snv-axis)}
.snv-hm .rl,.snv-hm .cl{color:var(--snv-muted);font-size:11px;white-space:nowrap}
.snv-hm .cl{text-align:center}
.snv-line svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.snv-cross{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--snv-axis);display:none;pointer-events:none}
.snv-dot{position:absolute;width:9px;height:9px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--snv-1);box-shadow:0 0 0 2px var(--snv-tip-bg);display:none;pointer-events:none}
.snv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(10em,1fr));gap:.8em}
.snv-kpi{padding:.7em .9em;border:1px solid rgba(128,128,128,.3);border-radius:.4em}
.snv-kpi .n{font-size:1.9em;font-weight:bold;line-height:1.15;font-variant-numeric:tabular-nums}
.snv-kpi .d{opacity:.75}
.snv-kpi .s{opacity:.65;font-size:90%;margin-top:.15em}
.snv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24em),1fr));gap:1.2em 2em}
.snv-cards h4{margin:.2em 0 .6em}
.snv-spark{display:inline-flex;align-items:flex-end;gap:1px;height:18px;width:80px;vertical-align:middle}
.snv-spark i{flex:1;background:var(--snv-1);min-height:1px;border-radius:1px 1px 0 0}
.snv-spark i.z{background:var(--snv-grid)}
.snv-empty{color:var(--snv-muted);font-style:italic;padding:1em 0}
`;

let tipNode = null;

function ensureStyle() {
	if (document.getElementById('snv-style'))
		return;
	document.head.appendChild(E('style', { 'id': 'snv-style' }, [ CSS ]));
	tipNode = E('div', { 'class': 'snv snv-tip' });
	document.body.appendChild(tipNode);
}

function showTip(ev, title, rows) {
	if (!tipNode)
		return;
	tipNode.innerHTML = '';
	if (title)
		tipNode.appendChild(E('b', {}, [ title ]));
	(rows || []).forEach((r) => tipNode.appendChild(E('div', { 'class': 'r' }, [
		E('span', {}, [ r.color ? E('i', { 'class': 'snv-sw', 'style': 'background:%s;margin-right:.4em'.format(r.color) }) : '', r.label ]),
		E('span', {}, [ r.value ])
	])));
	tipNode.style.display = 'block';
	const w = tipNode.offsetWidth, h = tipNode.offsetHeight;
	let x = ev.clientX + 14, y = ev.clientY + 14;
	if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
	if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
	tipNode.style.left = Math.max(4, x) + 'px';
	tipNode.style.top = Math.max(4, y) + 'px';
}

function hideTip() {
	if (tipNode)
		tipNode.style.display = 'none';
}

/* "nice" axis maximum and 2 intermediate ticks */
function niceMax(v) {
	if (v <= 0)
		return 1;
	const p = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [ 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 ])
		if (m * p >= v)
			return m * p;
	return 10 * p;
}

function fmtNum(v) {
	if (v == null || isNaN(v))
		return '-';
	if (Math.abs(v) >= 1e6)
		return (v / 1e6).toFixed(1) + 'M';
	if (Math.abs(v) >= 1e4)
		return (v / 1e3).toFixed(1) + 'k';
	if (Math.abs(v) < 10 && v % 1)
		return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
	return String(Math.round(v));
}

function yAxis(plot, max, fmt) {
	[ 0, 0.5, 1 ].forEach((f) => {
		const top = (1 - f) * 100;
		plot.appendChild(E('div', { 'class': 'snv-grid' + (f === 0 ? ' base' : ''), 'style': 'top:%s%%'.format(top) }));
		plot.appendChild(E('div', { 'class': 'snv-ylab', 'style': 'top:%s%%'.format(top) }, [ (fmt || fmtNum)(max * f) ]));
	});
}

return baseclass.extend({
	fmtNum: fmtNum,

	priorities: [
		{ key: 0, label: _('High (1)'), color: 'var(--snv-p1)' },
		{ key: 1, label: _('Medium (2)'), color: 'var(--snv-p2)' },
		{ key: 2, label: _('Low (3)'), color: 'var(--snv-p3)' },
		{ key: 3, label: _('Unclassified'), color: 'var(--snv-p4)' }
	],

	wrap(children) {
		ensureStyle();
		return E('div', { 'class': 'snv' }, children);
	},

	empty(text) {
		ensureStyle();
		return E('div', { 'class': 'snv snv-empty' }, [ text ]);
	},

	legend(series) {
		ensureStyle();
		return E('div', { 'class': 'snv snv-legend' }, series.map((s) =>
			E('span', {}, [ E('i', { 'class': 'snv-sw', 'style': 'background:' + s.color }), s.label ])));
	},

	/*
	 * Column chart, optionally stacked.
	 * opts: { columns: [{ label, title, values: [..] }], series: [{ label, color }],
	 *         height, xEvery, onClick(col) }
	 */
	columns(opts) {
		ensureStyle();
		const cols = opts.columns || [];
		const series = opts.series || [ { label: _('Alerts'), color: 'var(--snv-1)' } ];
		const max = niceMax(Math.max(0, ...cols.map((c) => c.values.reduce((a, b) => a + b, 0))));
		const plot = E('div', { 'class': 'snv-plot', 'style': 'height:%dpx'.format(opts.height || 160) });
		yAxis(plot, max);

		const area = E('div', { 'class': 'snv-cols' }, cols.map((c) => {
			const total = c.values.reduce((a, b) => a + b, 0);
			const segs = c.values.map((v, i) => v ? E('div', {
				'class': 'snv-seg',
				'style': 'height:calc(%s%% - 2px);background:%s'.format((100 * v / max).toFixed(2), series[i].color)
			}) : '').filter((n) => n);
			const rows = c.values.map((v, i) => ({ label: series[i].label, value: fmtNum(v), color: series[i].color }))
				.filter((r, i) => series.length === 1 || c.values[i]);
			if (series.length > 1)
				rows.push({ label: _('Total'), value: fmtNum(total) });
			return E('div', {
				'class': 'snv-col',
				'mousemove': (ev) => showTip(ev, c.title || c.label, rows),
				'mouseleave': hideTip,
				'click': opts.onClick ? () => opts.onClick(c) : null,
				'style': opts.onClick ? 'cursor:pointer' : null
			}, segs);
		}));
		plot.appendChild(area);

		const every = opts.xEvery || Math.max(1, Math.ceil(cols.length / 8));
		const xl = E('div', { 'class': 'snv-xlabs' }, cols.map((c, i) => E('div', {}, [ (i % every === 0) ? c.label : '' ])));
		return E('div', { 'class': 'snv' }, [ series.length > 1 ? this.legend(series) : '', plot, xl ]);
	},

	/*
	 * Line/area chart for a single measure over time.
	 * opts: { points: [{ t (ms), v }], fmt(v), fmtT(t), height, gap (ms), maxFloor, label }
	 */
	line(opts) {
		ensureStyle();
		const pts = (opts.points || []).filter((p) => p.v != null && !isNaN(p.v));
		if (pts.length < 2)
			return this.empty(_('Not enough data yet.'));
		const H = 100, W = 1000;
		const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
		const max = niceMax(Math.max(opts.maxFloor || 0, ...pts.map((p) => p.v)));
		const x = (t) => (t - t0) / span * W;
		const y = (v) => H - v / max * H;

		/* break the line where samples are missing (Snort not running) */
		const segs = [ [] ];
		pts.forEach((p, i) => {
			if (i && opts.gap && p.t - pts[i - 1].t > opts.gap)
				segs.push([]);
			segs[segs.length - 1].push(p);
		});
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 %d %d'.format(W, H));
		svg.setAttribute('preserveAspectRatio', 'none');
		segs.filter((s) => s.length).forEach((s) => {
			const d = s.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
			const area = document.createElementNS(ns, 'path');
			area.setAttribute('d', d + 'L%s,%dL%s,%dZ'.format(x(s[s.length - 1].t).toFixed(1), H, x(s[0].t).toFixed(1), H));
			area.setAttribute('style', 'fill:var(--snv-1);fill-opacity:.12;stroke:none');
			svg.appendChild(area);
			const path = document.createElementNS(ns, 'path');
			path.setAttribute('d', s.length > 1 ? d : d + 'l1,0');
			path.setAttribute('style', 'fill:none;stroke:var(--snv-1);stroke-width:2;stroke-linejoin:round;stroke-linecap:round');
			path.setAttribute('vector-effect', 'non-scaling-stroke');
			svg.appendChild(path);
		});

		const plot = E('div', { 'class': 'snv-plot snv-line', 'style': 'height:%dpx'.format(opts.height || 120) });
		yAxis(plot, max, opts.fmt);
		plot.appendChild(svg);
		const cross = E('div', { 'class': 'snv-cross' });
		const dot = E('div', { 'class': 'snv-dot' });
		plot.appendChild(cross);
		plot.appendChild(dot);

		const fmtT = opts.fmtT || ((t) => new Date(t).toLocaleString());
		plot.addEventListener('mousemove', (ev) => {
			const r = plot.getBoundingClientRect();
			const tt = t0 + (ev.clientX - r.left) / r.width * span;
			let best = pts[0];
			for (const p of pts)
				if (Math.abs(p.t - tt) < Math.abs(best.t - tt))
					best = p;
			const px = x(best.t) / W * 100, py = y(best.v) / H * 100;
			cross.style.display = dot.style.display = 'block';
			cross.style.left = px + '%';
			dot.style.left = px + '%';
			dot.style.top = py + '%';
			showTip(ev, fmtT(best.t), [ { label: opts.label || '', value: (opts.fmt || fmtNum)(best.v) } ]);
		});
		plot.addEventListener('mouseleave', () => { cross.style.display = dot.style.display = 'none'; hideTip(); });

		const nl = 5;
		const xl = E('div', { 'class': 'snv-xlabs' }, Array.from({ length: nl }, (_x, i) =>
			E('div', { 'style': 'text-align:%s'.format(i === 0 ? 'left' : i === nl - 1 ? 'right' : 'center') },
				[ (opts.fmtTick || fmtT)(t0 + span * i / (nl - 1)) ])));
		return E('div', { 'class': 'snv' }, [ plot, xl ]);
	},

	/*
	 * Horizontal bars (single series, labelled, values shown).
	 * opts: { items: [{ label, value, title, href, click }], fmt, limit }
	 */
	hbars(opts) {
		ensureStyle();
		const items = (opts.items || []).slice(0, opts.limit || 10);
		if (!items.length)
			return this.empty(opts.emptyText || _('No data.'));
		const max = Math.max(...items.map((i) => i.value), 1);
		const total = opts.total;
		return E('div', { 'class': 'snv snv-hb' }, items.flatMap((it) => {
			const label = it.href
				? E('a', { 'href': it.href, 'title': it.title || it.label }, [ it.label ])
				: E('span', { 'title': it.title || it.label }, [ it.label ]);
			return [
				E('div', { 'class': 'l' }, [ label ]),
				E('div', {
					'mousemove': (ev) => showTip(ev, it.title || it.label, [
						{ label: opts.valueLabel || _('Alerts'), value: (opts.fmt || fmtNum)(it.value) },
						total ? { label: _('Share'), value: '%.1f%%'.format(100 * it.value / total) } : null
					].filter((r) => r)),
					'mouseleave': hideTip
				}, [ E('div', { 'class': 't', 'style': 'width:%s%%'.format((100 * it.value / max).toFixed(1)) }) ]),
				E('div', { 'class': 'v' }, [ (opts.fmt || fmtNum)(it.value) ])
			];
		}));
	},

	/*
	 * Heatmap: rows x cols matrix of counts.
	 * opts: { matrix, rowLabels, colLabels, colEvery, tip(r, c, v) }
	 */
	heatmap(opts) {
		ensureStyle();
		const m = opts.matrix || [];
		const max = Math.max(0, ...m.flat());
		const nc = m[0]?.length || 0;
		const step = (v) => !v ? 0 : Math.min(6, 1 + Math.floor(5.999 * Math.sqrt(v / max)));
		const cells = [ E('div') ];
		(opts.colLabels || []).forEach((l, c) => cells.push(E('div', { 'class': 'cl' }, [ (c % (opts.colEvery || 3) === 0) ? l : '' ])));
		m.forEach((row, r) => {
			cells.push(E('div', { 'class': 'rl' }, [ opts.rowLabels[r] ]));
			row.forEach((v, c) => cells.push(E('div', {
				'class': 'c',
				'style': 'background:var(--snv-h%d)'.format(step(v)),
				'mousemove': (ev) => showTip(ev, opts.tip ? opts.tip(r, c) : '', [ { label: _('Alerts'), value: fmtNum(v) } ]),
				'mouseleave': hideTip
			})));
		});
		const grid = E('div', { 'class': 'snv-hm', 'style': 'grid-template-columns:auto repeat(%d,minmax(0,1fr))'.format(nc) }, cells);
		const legend = E('div', { 'style': 'display:flex;align-items:center;gap:3px;margin-top:.6em;color:var(--snv-muted)' }, [
			E('span', { 'style': 'margin-right:.4em' }, [ _('fewer') ]),
			...[ 0, 1, 2, 3, 4, 5, 6 ].map((i) => E('i', { 'class': 'snv-sw', 'style': 'background:var(--snv-h%d)'.format(i) })),
			E('span', { 'style': 'margin-left:.4em' }, [ _('more') ]),
			E('span', { 'style': 'margin-left:1em' }, [ _('(max %s per cell)').format(fmtNum(max)) ])
		]);
		return E('div', { 'class': 'snv' }, [ grid, legend ]);
	},

	/* Tiny column sparkline */
	spark(values, title) {
		ensureStyle();
		const max = Math.max(1, ...values);
		const n = values.length;
		const vals = (n > 40) ? Array.from({ length: 40 }, (_x, i) => {
			const a = Math.floor(i * n / 40), b = Math.floor((i + 1) * n / 40);
			return values.slice(a, Math.max(b, a + 1)).reduce((s, v) => s + v, 0);
		}) : values;
		const m2 = Math.max(1, ...vals);
		return E('span', { 'class': 'snv snv-spark', 'title': title || '' }, vals.map((v) =>
			E('i', { 'class': v ? '' : 'z', 'style': 'height:%d%%'.format(v ? Math.max(8, Math.round(100 * v / m2)) : 6) })));
	},

	kpis(items) {
		ensureStyle();
		return E('div', { 'class': 'snv snv-kpis' }, items.filter((i) => i).map((i) => E('div', { 'class': 'snv-kpi', 'title': i.title || '' }, [
			E('div', { 'class': 'n' }, [ i.value ]),
			E('div', { 'class': 'd' }, [ i.label ]),
			i.sub ? E('div', { 'class': 's' }, [ i.sub ]) : ''
		])));
	},

	cards(children) {
		ensureStyle();
		return E('div', { 'class': 'snv snv-cards' }, children);
	}
});
