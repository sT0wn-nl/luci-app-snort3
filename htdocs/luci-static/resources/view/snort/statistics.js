'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require snort.common as common';
'require snort.charts as charts';

const RANGES = [
	[ 86400, _('Last 24 hours') ],
	[ 604800, _('Last 7 days') ],
	[ 2592000, _('Last 30 days') ],
	[ 0, _('All logged alerts') ]
];

const DAYS = [ _('Mon'), _('Tue'), _('Wed'), _('Thu'), _('Fri'), _('Sat'), _('Sun') ];

function pad2(n) { return String(n).padStart(2, '0'); }

function bucketLabel(t, size, span) {
	const d = new Date(t);
	if (size >= 86400000 || span > 2 * 86400000)
		return '%s-%s'.format(pad2(d.getDate()), pad2(d.getMonth() + 1));
	return '%s:00'.format(pad2(d.getHours()));
}

function bucketTitle(t, size) {
	const a = new Date(t), b = new Date(t + size);
	const f = (d) => '%s-%s %s:%s'.format(pad2(d.getDate()), pad2(d.getMonth() + 1), pad2(d.getHours()), pad2(d.getMinutes()));
	return '%s – %s'.format(f(a), f(b));
}

function sortedEntries(obj) {
	return Object.keys(obj || {}).map((k) => ({ key: k, count: obj[k] })).sort((a, b) => b.count - a.count);
}

return view.extend({
	range: 604800,

	load() {
		const r = new URLSearchParams(window.location.search).get('range');
		if (r != null && RANGES.some((x) => String(x[0]) === r))
			this.range = +r;
		return Promise.all([
			common.callStats(this.range),
			common.callPerf(this.range || 2592000),
			common.callStatus(),
			common.callInfo()
		]);
	},

	section(title, descr, body, extra) {
		return E('div', { 'class': 'cbi-section' }, [
			E('div', { 'style': 'display:flex;align-items:baseline;gap:1em;flex-wrap:wrap' }, [
				E('h3', { 'style': 'flex:1' }, [ title ]), extra || ''
			]),
			descr ? E('div', { 'class': 'cbi-section-descr' }, [ descr ]) : '',
			body
		]);
	},

	alertsUrl(q) {
		return L.url('admin/services/snort/alerts') + '?q=' + encodeURIComponent(q);
	},

	/* ---- summary ---------------------------------------------------------- */

	renderSummary(s, info) {
		const loaded = (info.rules_total?.enabled ?? 0) + (info.local_rules?.enabled ?? 0);
		const days = this.range ? this.range / 86400 : Math.max(1, ((s.last ?? 0) - (s.first ?? 0)) / 86400000);
		const blocked = [ 'drop', 'block', 'reject', 'would_drop', 'would_block' ]
			.reduce((n, a) => n + (s.actions?.[a] ?? 0), 0);
		const high = s.priorities?.['1'] ?? 0;
		const pct = (n, d) => d ? '%.1f%%'.format(100 * n / d) : '-';

		return charts.kpis([
			{ value: charts.fmtNum(s.total) + (s.truncated ? '+' : ''), label: _('Alerts'),
				sub: _('≈ %s per day').format(charts.fmtNum(s.total / Math.max(days, 1 / 24))) },
			{ value: charts.fmtNum(high), label: _('High priority'), sub: _('%s of all alerts').format(pct(high, s.total)) },
			{ value: charts.fmtNum(s.distinct_rules), label: _('Rules that fired'),
				sub: loaded ? _('%s of %s loaded rules').format(pct(s.distinct_rules, loaded), charts.fmtNum(loaded)) : '',
				title: _('Share of the loaded rules that produced at least one alert in this period') },
			{ value: charts.fmtNum(s.unique_srcs), label: _('Source addresses'), sub: _('%s destinations').format(charts.fmtNum(s.unique_dsts)) },
			{ value: charts.fmtNum(blocked), label: _('Blocked / would block'), sub: pct(blocked, s.total) }
		]);
	},

	/* ---- timeline ----------------------------------------------------------- */

	renderTimeline(s) {
		if (!s.total)
			return charts.empty(_('No alerts in this period.'));
		const series = charts.priorities;
		const bl = s.buckets || [];
		const span = bl.length ? bl[bl.length - 1].t - bl[0].t : 0;
		const cols = bl.map((b) => ({
			label: bucketLabel(b.t, s.bucket, span),
			title: bucketTitle(b.t, s.bucket),
			values: b.c,
			t: b.t
		}));
		/* label each day once when the period spans several days */
		let xEvery = Math.max(1, Math.ceil(cols.length / 8));
		if (span > 2 * 86400000 && s.bucket < 86400000)
			xEvery = Math.max(1, Math.round(86400000 / s.bucket) * Math.ceil(cols.length * s.bucket / 86400000 / 10));
		const chart = charts.columns({ columns: cols, series: series, height: 180, xEvery: xEvery });

		const table = E('details', { 'style': 'margin-top:.5em' }, [
			E('summary', { 'style': 'cursor:pointer' }, [ _('Show as table') ]),
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, [ _('Period') ]),
					...series.map((x) => E('th', { 'class': 'th', 'style': 'text-align:right' }, [ x.label ])),
					E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Total') ])
				]),
				...cols.filter((c) => c.values.some((v) => v)).map((c) => E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, [ c.title ]),
					...c.values.map((v) => E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(v) ])),
					E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(c.values.reduce((a, b) => a + b, 0)) ])
				]))
			])
		]);
		return E('div', {}, [ chart, table ]);
	},

	renderHeatmap(s) {
		if (!s.total)
			return charts.empty(_('No alerts in this period.'));
		return charts.heatmap({
			matrix: s.heat,
			rowLabels: DAYS,
			colLabels: Array.from({ length: 24 }, (_x, h) => pad2(h)),
			colEvery: 3,
			tip: (r, c) => '%s %s:00 – %s:59'.format(DAYS[r], pad2(c), pad2(c))
		});
	},

	/* ---- rule effectiveness ---------------------------------------------- */

	renderPareto(s) {
		const counts = s.counts || [];
		if (counts.length < 2)
			return charts.empty(_('Too few different rules fired for this analysis.'));
		const total = counts.reduce((a, b) => a + b, 0);
		let acc = 0, n80 = 0;
		const pts = counts.map((c, i) => {
			acc += c;
			if (!n80 && acc >= 0.8 * total)
				n80 = i + 1;
			return { t: i + 1, v: 100 * acc / total };
		});
		pts.unshift({ t: 0, v: 0 });
		const chart = charts.line({
			points: pts, label: _('Share of all alerts'), height: 110, maxFloor: 100,
			fmt: (v) => Math.round(v) + '%',
			fmtT: (t) => _('Top %d rule(s)').format(t),
			fmtTick: (t) => String(Math.round(t))
		});
		return E('div', {}, [
			E('p', {}, [
				E('strong', {}, [ _('%d of %d rules (%s) cause 80%% of all alerts.').format(n80, counts.length, '%.0f%%'.format(100 * n80 / counts.length)) ]), ' ',
				_('A steep curve means a few noisy rules dominate: tuning (suppressing, filtering or disabling) just those rules removes most of the noise.')
			]),
			chart,
			E('div', { 'style': 'text-align:center;opacity:.7;font-size:90%' }, [ _('Rules ranked by number of alerts →') ])
		]);
	},

	noiseHint(r, total) {
		const share = total ? r.count / total : 0;
		if (r.count >= 10 && r.top_pair_share >= 0.9 && share >= 0.05)
			return [ common.badge(_('noisy'), 'orange'), _('%.0f%% of alerts, one host pair').format(100 * share) ];
		if (r.count >= 20 && share >= 0.25)
			return [ common.badge(_('dominant'), 'orange'), _('%.0f%% of all alerts').format(100 * share) ];
		if (r.srcs >= 10)
			return [ common.badge(_('widespread'), 'blue'), _('seen from %d sources').format(r.srcs) ];
		return null;
	},

	renderRuleTable(s) {
		const rules = s.rules || [];
		if (!rules.length)
			return charts.empty(_('No alerts in this period.'));
		const total = s.total || 1;
		const max = rules[0].count;
		const prio = { 1: _('high'), 2: _('medium'), 3: _('low') };

		const rows = rules.slice(0, 25).map((r) => {
			const hint = this.noiseHint(r, total);
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [ common.ruleLink(r.gid, r.sid, r.rev) ]),
				E('td', { 'class': 'td' }, [
					E('a', { 'href': this.alertsUrl(String(r.sid)) }, [ r.msg ?? '-' ]),
					E('div', { 'style': 'opacity:.7;font-size:90%' }, [
						[ r.cat, (r.cls && r.cls !== 'none') ? r.cls : null, prio[r.prio] ? _('priority %s').format(prio[r.prio]) : null ].filter((x) => x).join(' · ')
					]),
					hint ? E('div', { 'style': 'margin-top:.2em' }, [ hint[0], ' ', E('small', {}, [ hint[1] ]) ]) : ''
				]),
				E('td', { 'class': 'td', 'style': 'min-width:8em' }, [
					E('div', { 'style': 'display:flex;align-items:center;gap:.4em' }, [
						E('span', { 'style': 'min-width:3em;text-align:right;font-variant-numeric:tabular-nums' }, [ charts.fmtNum(r.count) ]),
						E('div', { 'style': 'flex:1;height:.6em;border-radius:0 3px 3px 0;background:rgba(128,128,128,.15)' }, [
							E('div', { 'class': 'snv', 'style': 'height:100%;border-radius:0 3px 3px 0;background:var(--snv-1);width:%s%%'.format((100 * r.count / max).toFixed(1)) })
						])
					]),
					E('small', { 'style': 'opacity:.7' }, [ '%.1f%%'.format(100 * r.count / total) ])
				]),
				E('td', { 'class': 'td' }, [ charts.spark(r.spark, _('Trend over the selected period')) ]),
				E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(r.srcs), ' → ', String(r.dsts) ]),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [ common.fmtTime(r.last) ]),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [
					E('button', { 'class': 'btn cbi-button-neutral', 'title': _('Suppress all alerts of this rule'),
						'click': ui.createHandlerFn(this, () => common.addSuppression({ gid: r.gid, sid: r.sid, msg: r.msg }, '', '')) }, [ _('Suppress') ]), ' ',
					E('button', { 'class': 'btn cbi-button-negative', 'title': _('Disable the rule so it is no longer evaluated'),
						'click': ui.createHandlerFn(this, () => common.disableRule(r.gid, r.sid, r.msg)) }, [ _('Disable') ])
				])
			]);
		});

		return E('div', { 'style': 'overflow-x:auto' }, [
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, [ _('Rule') ]),
					E('th', { 'class': 'th' }, [ _('Message') ]),
					E('th', { 'class': 'th' }, [ _('Alerts') ]),
					E('th', { 'class': 'th' }, [ _('Trend') ]),
					E('th', { 'class': 'th', 'style': 'text-align:right', 'title': _('Distinct source → destination addresses') }, [ _('Hosts') ]),
					E('th', { 'class': 'th' }, [ _('Last seen') ]),
					E('th', { 'class': 'th' }, [ _('Tuning') ])
				]),
				...rows
			]),
			rules.length > 25 ? E('p', { 'style': 'opacity:.7' }, [ _('Showing the 25 most frequent of %d rules.').format(s.distinct_rules) ]) : ''
		]);
	},

	renderCoverage(s, cats) {
		const loaded = {};
		(cats.categories || []).forEach((c) => loaded[c.name] = c);
		const disabled = cats.disabled_category || [];
		const rows = sortedEntries(s.categories).map((c) => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, [ E('a', { 'href': this.alertsUrl(c.key) }, [ c.key ]) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ charts.fmtNum(c.count) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(s.cat_rules?.[c.key] ?? 0) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ loaded[c.key] ? String(loaded[c.key].rules) : '-' ]),
			E('td', { 'class': 'td' }, [ disabled.indexOf(c.key) > -1 ? common.badge(_('disabled'), 'grey') : '' ])
		]));
		if (!rows.length)
			return charts.empty(_('No alerts in this period.'));
		return E('div', { 'style': 'overflow-x:auto' }, [
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, [ _('Category') ]),
					E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Alerts') ]),
					E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Rules fired') ]),
					E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Rules loaded') ]),
					E('th', { 'class': 'th' }, [ '' ])
				]),
				...rows
			]),
			E('p', { 'style': 'opacity:.7' }, [
				_('Categories can be disabled completely on the'), ' ',
				E('a', { 'href': L.url('admin/services/snort/rules') }, [ _('Rules page') ]), '.'
			])
		]);
	},

	/* ---- breakdowns ------------------------------------------------------ */

	renderBreakdowns(s) {
		const items = (list, href) => list.map((x) => ({ label: x.key, value: x.count, href: href ? this.alertsUrl(x.key.replace(/\/.*$/, '')) : null }));
		const total = s.total;
		const card = (title, node) => E('div', {}, [ E('h4', {}, [ title ]), node ]);
		return charts.cards([
			card(_('Categories'), charts.hbars({ items: items(sortedEntries(s.categories), true), total })),
			card(_('Classification'), charts.hbars({ items: items(s.classes || []), total, emptyText: _('No classification in the logged alerts (older alerts or rules without classtype).') })),
			card(_('Top source addresses'), charts.hbars({ items: items(s.top_srcs || [], true), total })),
			card(_('Top destination addresses'), charts.hbars({ items: items(s.top_dsts || [], true), total })),
			card(_('Destination ports'), charts.hbars({ items: items(s.top_dports || [], true), total })),
			card(_('Services (application protocols)'), charts.hbars({ items: items(s.services || []), total, emptyText: _('No service detected.') })),
			card(_('Protocols'), charts.hbars({ items: items(sortedEntries(s.protos)), total })),
			card(_('Actions'), charts.hbars({ items: items(sortedEntries(s.actions)), total }))
		]);
	},

	/* ---- performance ---------------------------------------------------- */

	renderPerf(perf, st) {
		const pts = perf.points || [];
		if (!pts.length)
			return E('div', {}, [
				charts.empty(perf.enabled
					? _('No performance samples yet; the first sample is written after one interval.')
					: _('Performance monitoring is disabled.')),
				!perf.enabled ? E('a', { 'href': L.url('admin/services/snort/settings') }, [ _('Enable in Settings → Advanced') ]) : ''
			]);

		const gap = (perf.interval || 60) * 2500;
		/* every perf_monitor sample covers one interval */
		const iv = perf.interval || 60;
		const rate = (key, mult) => pts.map((p) => ({ t: p.t * 1000, v: (p[key] || 0) * (mult || 1) / iv }));
		const T = (t) => common.fmtTime(t);
		const tick = (t) => { const d = new Date(t); return '%s-%s %s:%s'.format(pad2(d.getDate()), pad2(d.getMonth() + 1), pad2(d.getHours()), pad2(d.getMinutes())); };

		const drop = pts.filter((p) => p.received > 0).map((p) => ({ t: p.t * 1000, v: 100 * (p.dropped || 0) / p.received }));
		const totRecv = pts.reduce((a, p) => a + p.received, 0);
		const totDrop = pts.reduce((a, p) => a + p.dropped, 0);
		const totAlerts = pts.reduce((a, p) => a + p.alerts, 0);
		const totTimeouts = pts.reduce((a, p) => a + (p.rule_timeouts || 0), 0);
		const cpu = pts.filter((p) => p.cpu != null).map((p) => ({ t: p.t * 1000, v: p.cpu }));
		const avgCpu = cpu.length ? cpu.reduce((a, p) => a + p.v, 0) / cpu.length : null;
		const dropPct = totRecv ? 100 * totDrop / totRecv : 0;

		const card = (title, descr, node) => E('div', {}, [
			E('h4', {}, [ title ]), descr ? E('div', { 'style': 'margin-bottom:.5em;opacity:.7;font-size:90%' }, [ descr ]) : '', node
		]);

		return E('div', {}, [
			charts.kpis([
				{ value: charts.fmtNum(totRecv), label: _('Packets received'), sub: _('in %d samples').format(pts.length) },
				{ value: '%.2f%%'.format(dropPct), label: _('Packets dropped'),
					sub: dropPct > 1 ? '⚠ ' + _('Snort cannot keep up') : (dropPct > 0 ? _('occasional drops') : '✓ ' + _('no drops')) },
				{ value: totRecv ? '%.2f'.format(10000 * totAlerts / totRecv) : '-', label: _('Alerts per 10,000 packets'), title: _('Detection ratio: how often inspected traffic matches a rule') },
				avgCpu != null ? { value: '%.1f%%'.format(avgCpu), label: _('Average CPU (Snort threads)') } : null,
				totTimeouts ? { value: charts.fmtNum(totTimeouts), label: _('Rule time-outs'), sub: _('slow rules hit the latency limit') } : null
			]),
			E('div', { 'style': 'height:1em' }),
			charts.cards([
				card(_('Throughput'), _('Traffic inspected by Snort.'),
					charts.line({ points: rate('bytes', 8 / 1e6), label: _('Mbit/s'), fmt: (v) => v.toFixed(v < 10 ? 2 : 0), fmtT: T, fmtTick: tick, gap: gap })),
				card(_('Packets per second'), null,
					charts.line({ points: rate('analyzed'), label: _('packets/s'), fmtT: T, fmtTick: tick, gap: gap })),
				card(_('Packet drop rate'), _('Packets the DAQ had to drop because Snort was too slow. Should stay at 0%.'),
					charts.line({ points: drop, label: _('dropped'), fmt: (v) => v.toFixed(v < 1 ? 2 : 1) + '%', maxFloor: 1, fmtT: T, fmtTick: tick, gap: gap })),
				cpu.length ? card(_('CPU usage'), _('Snort packet threads, percentage of one core.'),
					charts.line({ points: cpu, label: _('CPU'), fmt: (v) => v.toFixed(v < 10 ? 1 : 0) + '%', maxFloor: 5, fmtT: T, fmtTick: tick, gap: gap })) : '',
				card(_('Alerts per minute'), null,
					charts.line({ points: rate('alerts', 60), label: _('alerts/min'), fmtT: T, fmtTick: tick, gap: gap })),
				card(_('New flows per second'), _('Connections tracked by the stream inspector.'),
					charts.line({ points: rate('flows'), label: _('flows/s'), fmtT: T, fmtTick: tick, gap: gap }))
			])
		]);
	},

	/* ---- page ------------------------------------------------------------- */

	renderAll() {
		const [ s, perf, st, info, cats ] = this.data;
		const rangeText = RANGES.find((r) => r[0] === this.range)?.[1] ?? '';
		dom.content(this.body, [
			...common.notices(st, 'statistics'),
			(!st.logging && !st.manual) ? E('div', { 'class': 'alert-message warning' }, [ _('Alert logging is disabled, statistics stay empty.') ]) : '',
			this.section(_('Summary'), null, this.renderSummary(s, info)),
			this.section(_('Alerts over time'), _('Stacked by rule priority (from the rule\'s classtype). Hover a column for details.'), this.renderTimeline(s)),
			this.section(_('Activity by weekday and hour'), _('Reveals patterns such as nightly scans or alerts during office hours.'), this.renderHeatmap(s)),
			this.section(_('Rule effectiveness'), _('Which rules generate the alerts, whether they are spread over many hosts or repeat between one host pair (often a false positive), and how they trend.'),
				E('div', {}, [ this.renderPareto(s), E('div', { 'style': 'height:1em' }), this.renderRuleTable(s) ])),
			this.section(_('Rule categories'), _('Alerts per category compared with the number of loaded rules in that category.'), this.renderCoverage(s, cats)),
			this.section(_('Breakdown'), rangeText, this.renderBreakdowns(s)),
			this.section(_('Snort performance'), _('From Snort\'s perf_monitor: how much traffic is inspected and whether Snort keeps up with it.'), this.renderPerf(perf, st))
		]);
	},

	reload() {
		return Promise.all([
			common.callStats(this.range),
			common.callPerf(this.range || 2592000),
			common.callStatus(),
			common.callInfo(),
			common.callCategories()
		]).then((data) => {
			this.data = data;
			this.renderAll();
		});
	},

	render(data) {
		this.body = E('div', {}, [ E('p', { 'class': 'spinning' }, [ _('Loading…') ]) ]);
		const sel = E('select', { 'class': 'cbi-input-select', 'change': (ev) => {
			this.range = +ev.target.value;
			dom.content(this.body, E('p', { 'class': 'spinning' }, [ _('Loading…') ]));
			this.reload();
		} }, RANGES.map(([ v, t ]) => E('option', { 'value': v, 'selected': v === this.range ? '' : null }, [ t ])));

		common.callCategories().then((cats) => {
			this.data = [ ...data, cats ];
			this.renderAll();
		});
		poll.add(() => this.reload(), 60);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Snort IDS – Statistics') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Insight into what Snort detects, how effective the rules are and how well Snort performs. Statistics are based on the logged alerts (at most the last 50,000) and Snort\'s performance monitor.')
			]),
			E('div', { 'style': 'display:flex;gap:.5em;align-items:center;flex-wrap:wrap;margin-bottom:1em' }, [
				E('label', {}, [ _('Period') + ': ' ]), sel,
				E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, 'reload') }, [ _('Refresh') ])
			]),
			this.body
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
