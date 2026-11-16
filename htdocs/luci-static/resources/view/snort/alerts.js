'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require snort.common as common';

const PAGE_SIZE = 100;

return view.extend({
	alerts: [],
	page: 0,

	load() {
		const q = new URLSearchParams(window.location.search).get('q');
		this.initialQuery = q ?? '';
		return Promise.all([
			common.callAlerts(1000),
			common.callStatus()
		]);
	},

	/* ---- filtering -------------------------------------------------------- */

	filtered() {
		const q = (this.fSearch.value || '').trim().toLowerCase();
		const range = +this.fRange.value;
		const action = this.fAction.value;
		const now = Date.now();
		const terms = q ? q.split(/\s+/) : [];

		return this.alerts.filter((a) => {
			if (range && (!a.ts || a.ts < now - range * 1000))
				return false;
			if (action && a.action !== action)
				return false;
			if (terms.length) {
				const hay = [ a.msg, a.src_addr, a.dst_addr, a.proto, a.action,
					'%d:%d'.format(a.gid ?? 1, a.sid ?? 0), String(a.sid ?? ''),
					String(a.src_port ?? ''), String(a.dst_port ?? '') ].join(' ').toLowerCase();
				return terms.every((t) => hay.indexOf(t) > -1);
			}
			return true;
		});
	},

	/* ---- rendering -------------------------------------------------------- */

	renderEvents(list) {
		const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
		if (this.page >= pages)
			this.page = pages - 1;
		const slice = list.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);

		const rows = slice.map((a) => E('tr', { 'class': 'tr', 'style': 'cursor:pointer', 'click': () => this.showDetails(a) }, [
			E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [ common.fmtTime(a.ts) ]),
			E('td', { 'class': 'td' }, [ common.badge(a.action ?? '-', common.actionColor(a.action)) ]),
			E('td', { 'class': 'td' }, [ a.proto ?? '-' ]),
			E('td', { 'class': 'td', 'style': 'word-break:break-all' }, [ common.addr(a.src_addr, a.src_port) ]),
			E('td', { 'class': 'td', 'style': 'word-break:break-all' }, [ common.addr(a.dst_addr, a.dst_port) ]),
			E('td', { 'class': 'td', 'style': 'white-space:nowrap', 'click': (ev) => ev.stopPropagation() }, [ common.ruleLink(a.gid, a.sid, a.rev) ]),
			E('td', { 'class': 'td' }, [ a.msg ?? '-' ])
		]));

		const table = E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, [ _('Time') ]),
				E('th', { 'class': 'th' }, [ _('Action') ]),
				E('th', { 'class': 'th' }, [ _('Proto') ]),
				E('th', { 'class': 'th' }, [ _('Source') ]),
				E('th', { 'class': 'th' }, [ _('Destination') ]),
				E('th', { 'class': 'th' }, [ _('Rule') ]),
				E('th', { 'class': 'th' }, [ _('Message') ])
			]),
			...rows
		]);

		if (!rows.length)
			table.appendChild(E('tr', { 'class': 'tr placeholder' }, [
				E('td', { 'class': 'td', 'colspan': 7 }, [ E('em', {}, [ this.alerts.length ? _('No alerts match the filter.') : _('No alerts logged.') ]) ])
			]));

		const pager = (pages > 1) ? E('div', { 'style': 'display:flex;gap:.5em;align-items:center;justify-content:center;margin-top:.8em' }, [
			E('button', { 'class': 'btn cbi-button-neutral', 'disabled': this.page === 0 ? '' : null, 'click': () => { this.page--; this.update(); } }, [ '‹ ' + _('Newer') ]),
			E('span', {}, [ _('Page %d of %d').format(this.page + 1, pages) ]),
			E('button', { 'class': 'btn cbi-button-neutral', 'disabled': this.page >= pages - 1 ? '' : null, 'click': () => { this.page++; this.update(); } }, [ _('Older') + ' ›' ])
		]) : '';

		return [ table, pager ];
	},

	renderGrouped(list) {
		const groups = {};
		list.forEach((a) => {
			const k = '%d:%d'.format(a.gid ?? 1, a.sid ?? 0);
			const g = groups[k] ??= { gid: a.gid ?? 1, sid: a.sid ?? 0, msg: a.msg, count: 0, srcs: {}, dsts: {}, first: a.ts, last: a.ts, actions: {}, sample: a };
			g.count++;
			if (a.src_addr) g.srcs[a.src_addr] = (g.srcs[a.src_addr] ?? 0) + 1;
			if (a.dst_addr) g.dsts[a.dst_addr] = (g.dsts[a.dst_addr] ?? 0) + 1;
			if (a.action) g.actions[a.action] = true;
			if (a.ts && (!g.first || a.ts < g.first)) g.first = a.ts;
			if (a.ts && (!g.last || a.ts > g.last)) g.last = a.ts;
		});

		const topAddrs = (obj) => {
			const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
			return keys.slice(0, 3).join(', ') + (keys.length > 3 ? ' ' + _('(+%d more)').format(keys.length - 3) : '');
		};

		const rows = Object.values(groups).sort((a, b) => b.count - a.count).map((g) =>
			E('tr', { 'class': 'tr', 'style': 'cursor:pointer', 'click': () => this.showDetails(g.sample) }, [
				E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(g.count) ]),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap', 'click': (ev) => ev.stopPropagation() }, [ common.ruleLink(g.gid, g.sid) ]),
				E('td', { 'class': 'td' }, [ g.msg ?? '-', ' ', ...Object.keys(g.actions).map((a) => common.badge(a, common.actionColor(a))) ]),
				E('td', { 'class': 'td', 'style': 'word-break:break-all' }, [ topAddrs(g.srcs) ]),
				E('td', { 'class': 'td', 'style': 'word-break:break-all' }, [ topAddrs(g.dsts) ]),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [ common.fmtTime(g.last) ])
			]));

		const table = E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Count') ]),
				E('th', { 'class': 'th' }, [ _('Rule') ]),
				E('th', { 'class': 'th' }, [ _('Message') ]),
				E('th', { 'class': 'th' }, [ _('Sources') ]),
				E('th', { 'class': 'th' }, [ _('Destinations') ]),
				E('th', { 'class': 'th' }, [ _('Last seen') ])
			]),
			...rows
		]);

		if (!rows.length)
			table.appendChild(E('tr', { 'class': 'tr placeholder' }, [
				E('td', { 'class': 'td', 'colspan': 6 }, [ E('em', {}, [ _('No alerts match the filter.') ]) ])
			]));

		return [ table ];
	},

	update() {
		const list = this.filtered();
		const grouped = this.fView.value === 'grouped';
		dom.content(this.countNode, _('%d of %d loaded alerts').format(list.length, this.alerts.length));
		dom.content(this.tableNode, grouped ? this.renderGrouped(list) : this.renderEvents(list));
	},

	reload() {
		return common.callAlerts(+this.fLimit.value).then((res) => {
			this.alerts = res.alerts ?? [];
			this.update();
		});
	},

	/* ---- details & suppression -------------------------------------------- */

	showDetails(a) {
		const fields = Object.keys(a).filter((k) => k !== 'ts').sort();
		const ruleNode = E('div', {}, [ E('em', { 'class': 'spinning' }, [ _('Looking up rule…') ]) ]);

		common.callLookupRule(a.gid ?? 1, a.sid ?? 0).then((res) => {
			if (!res.rules?.length) {
				dom.content(ruleNode, E('em', {}, [ _('Rule text not found in the installed rule files.') ]));
				return;
			}
			dom.content(ruleNode, res.rules.map((r) => E('div', {}, [
				E('div', { 'class': 'cbi-value-description' }, [ r.line ? '%s:%d'.format(r.file, r.line) : r.file ]),
				E('pre', { 'style': 'white-space:pre-wrap;word-break:break-all;font-size:85%' }, [ r.rule ])
			])));
		});

		const btn = (label, track, ip) => E('button', {
			'class': 'btn cbi-button-action',
			'click': ui.createHandlerFn(this, 'addSuppression', a, track, ip)
		}, [ label ]);

		ui.showModal(_('Alert details'), [
			E('h4', {}, [ a.msg ?? '-' ]),
			E('table', { 'class': 'table' }, fields.map((k) => E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'width:30%;font-weight:bold' }, [ k ]),
				E('td', { 'class': 'td', 'style': 'word-break:break-all' }, [ String(a[k]) ])
			]))),
			E('h4', {}, [ _('Rule') ]),
			ruleNode,
			E('p', {}, [ E('a', { 'href': common.ruleDocUrl(a.gid, a.sid), 'target': '_blank', 'rel': 'noreferrer' }, [ _('Rule documentation on snort.org') ]) ]),
			E('h4', {}, [ _('Suppress this alert') ]),
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em' }, [
				btn(_('Suppress rule completely'), '', ''),
				a.src_addr ? btn(_('Only from %s').format(a.src_addr), 'by_src', a.src_addr) : '',
				a.dst_addr ? btn(_('Only to %s').format(a.dst_addr), 'by_dst', a.dst_addr) : ''
			]),
			E('h4', {}, [ _('Disable this rule') ]),
			E('p', { 'class': 'cbi-value-description' }, [ _('A disabled rule is no longer evaluated at all (saves CPU). Prefer suppression if the rule is useful for other hosts.') ]),
			E('button', { 'class': 'btn cbi-button-negative', 'click': ui.createHandlerFn(this, () => common.disableRule(a.gid, a.sid, a.msg)) }, [ _('Disable rule %d:%d').format(a.gid ?? 1, a.sid ?? 0) ]),
			E('div', { 'class': 'right', 'style': 'margin-top:1em' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Close') ])
			])
		], 'cbi-modal');
	},

	addSuppression(a, track, ip) {
		return common.addSuppression(a, track, ip);
	},

	/* ---- actions ---------------------------------------------------------- */

	handleExport() {
		const list = this.filtered();
		const cols = [ 'timestamp', 'action', 'proto', 'src_addr', 'src_port', 'dst_addr', 'dst_port', 'dir', 'gid', 'sid', 'rev', 'msg' ];
		const esc = (v) => (v == null) ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
		const csv = [ cols.join(',') ].concat(list.map((a) => cols.map((c) => esc(a[c])).join(','))).join('\n') + '\n';
		const link = E('a', {
			'href': URL.createObjectURL(new Blob([ csv ], { type: 'text/csv' })),
			'download': 'snort-alerts-%s.csv'.format(new Date().toISOString().slice(0, 10))
		});
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	},

	handleClear() {
		ui.showModal(_('Clear alert log'), [
			E('p', {}, [ _('Delete all logged alerts? This cannot be undone.') ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]), ' ',
				E('button', { 'class': 'btn cbi-button-negative', 'click': ui.createHandlerFn(this, () =>
					common.callClearAlerts().then(() => { ui.hideModal(); this.page = 0; return this.reload(); })) }, [ _('Clear') ])
			])
		]);
	},

	render([ res, st ]) {
		this.alerts = res.alerts ?? [];

		const sel = (opts, value, title) => {
			const s = E('select', { 'class': 'cbi-input-select', 'title': title, 'change': () => { this.page = 0; this.update(); } },
				opts.map(([ v, t ]) => E('option', { 'value': v }, [ t ])));
			s.value = value;
			return s;
		};

		this.fSearch = E('input', {
			'type': 'search', 'class': 'cbi-input-text', 'value': this.initialQuery,
			'placeholder': _('Search message, IP, port or SID…'), 'style': 'flex:1 1 16em;min-width:10em',
			'input': () => { this.page = 0; this.update(); }
		});
		this.fRange = sel([ [ '0', _('All time') ], [ '3600', _('Last hour') ], [ '86400', _('Last 24 hours') ], [ '604800', _('Last 7 days') ] ], '0', _('Time range'));
		const actions = [ [ '', _('All actions') ] ];
		[ 'alert', 'allow', 'drop', 'block', 'reject', 'would_drop', 'would_block' ].forEach((a) => actions.push([ a, a ]));
		this.fAction = sel(actions, '', _('Action'));
		this.fView = sel([ [ 'events', _('Show events') ], [ 'grouped', _('Group by rule') ] ], 'events', _('View'));
		this.fLimit = sel([ [ '500', _('Last %d').format(500) ], [ '1000', _('Last %d').format(1000) ], [ '5000', _('Last %d').format(5000) ], [ '10000', _('Last %d').format(10000) ] ], '1000', _('Number of alerts to load'));
		this.fLimit.addEventListener('change', () => this.reload());

		this.fAuto = E('input', { 'type': 'checkbox', 'checked': '' });
		poll.add(() => this.fAuto.checked ? this.reload() : Promise.resolve(), 10);

		this.countNode = E('span', { 'class': 'cbi-value-description' });
		this.tableNode = E('div', { 'style': 'overflow-x:auto' });

		const toolbar = E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;align-items:center;margin-bottom:.8em' }, [
			this.fSearch, this.fRange, this.fAction, this.fView, this.fLimit
		]);
		const toolbar2 = E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;align-items:center;margin-bottom:.8em' }, [
			this.countNode,
			E('span', { 'style': 'flex:1' }),
			E('label', { 'style': 'display:flex;align-items:center;gap:.3em' }, [ this.fAuto, _('Auto refresh') ]),
			E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, 'reload') }, [ _('Refresh') ]),
			E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleExport') }, [ _('Export CSV') ]),
			E('button', { 'class': 'btn cbi-button-negative', 'click': ui.createHandlerFn(this, 'handleClear') }, [ _('Clear log') ])
		]);

		const notes = common.notices(st, 'alerts');
		if (!res.logging && !st.manual)
			notes.push(E('div', { 'class': 'alert-message warning' }, [ _('Alert logging is disabled in the settings; no new alerts will be shown.') ]));
		if (st.method === 'pcap' && st.running && !st.manual)
			notes.push(E('div', { 'class': 'alert-message notice' }, [ _('With the pcap DAQ Snort may write alerts in batches, so new alerts can appear with a delay. Use afpacket for near real-time alerts.') ]));

		this.update();

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Snort IDS – Alerts') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Alerts from %s. Click an alert for details, the matching rule and to suppress false positives.').format(res.log_dir ? res.log_dir + '/*alert_json.txt' : _('the alert log'))
			]),
			...notes,
			E('div', { 'class': 'cbi-section' }, [ toolbar, toolbar2, this.tableNode ])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
