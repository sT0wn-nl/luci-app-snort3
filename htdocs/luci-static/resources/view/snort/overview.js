'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require snort.common as common';
'require snort.charts as charts';

return view.extend({
	statsAge: 0,

	load() {
		return Promise.all([
			common.callStatus(),
			common.callInfo(),
			common.callStats(0)
		]);
	},

	/* ---- notices --------------------------------------------------------- */

	renderNotices(st) {
		const out = common.notices(st, 'overview');
		const link = (path, text) => E('a', { 'href': L.url('admin/services/snort', path) }, [ text ]);

		if (!st.enabled)
			out.unshift(E('div', { 'class': 'alert-message notice' }, [
				E('strong', {}, [ _('Snort is disabled.') ]), ' ',
				_('Configure the interface and networks, install a rule set and then enable Snort.'), ' ',
				link('settings', _('Go to Settings'))
			]));

		if (st.rules_dangling)
			out.push(E('div', { 'class': 'alert-message error' }, [
				E('strong', {}, [ _('The rule set is missing.') ]), ' ',
				_('The rules were stored in RAM and are gone (e.g. after a reboot). Download them again or enable persistent storage.'), ' ',
				link('rules', _('Go to Rules'))
			]));
		else if (!st.rules_present)
			out.push(E('div', { 'class': 'alert-message error' }, [
				E('strong', {}, [ _('No rules installed.') ]), ' ',
				_('Snort cannot detect anything without rules.'), ' ',
				link('rules', _('Download a rule set'))
			]));
		else if (st.rules_volatile && !st.manual)
			out.push(E('div', { 'class': 'alert-message notice' }, [
				_('The rule set is stored in RAM and will be lost after a reboot.'), ' ',
				link('rules', _('Enable persistent storage or automatic updates'))
			]));

		const daq = st.manual ? null : common.daqProblem(st.mode, st.method, st.interface, st.nfq_chain);
		if (daq)
			out.push(E('div', { 'class': 'alert-message ' + daq.level }, [
				daq.text, ' ', link('settings', _('Change in Settings'))
			]));

		if (!st.logging && !st.manual)
			out.push(E('div', { 'class': 'alert-message warning' }, [
				_('Alert logging is disabled, so the Alerts page and statistics stay empty.'), ' ',
				link('settings', _('Enable in Settings'))
			]));

		if (st.restart_needed)
			out.push(E('div', { 'class': 'alert-message warning' }, [
				E('strong', {}, [ _('Restart required.') ]), ' ',
				_('The configuration or rules changed after Snort was started.'), ' ',
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'handleService', 'restart') }, [ _('Restart now') ])
			]));

		return out;
	},

	/* ---- status ---------------------------------------------------------- */

	renderStatus(st, info) {
		let svc;
		if (st.running)
			svc = common.badge(_('Running'), 'green');
		else if (st.enabled)
			svc = common.badge(_('Stopped'), 'red');
		else
			svc = common.badge(_('Disabled'), 'grey');

		const jobs = [];
		if (st.jobs?.update || st.jobs?.['update-restart'])
			jobs.push(common.badge(_('Rule update running'), 'blue'));
		if (st.jobs?.check)
			jobs.push(common.badge(_('Configuration test running'), 'blue'));

		const rulesTotal = info.rules_total?.enabled ?? 0;
		const rulesText = st.rules_present
			? _('%d active rules in %d file(s)').format(rulesTotal, info.rules?.files?.length ?? 0)
			: _('none');

		const ruleSrc = st.rules_source ? common.sourceText(st.rules_source) : null;

		return common.kvTable([
			[ _('Service'), E('span', {}, [ svc, ' ', ...jobs ]) ],
			[ _('Start at boot'), st.boot_enabled ? _('yes') : _('no') ],
			[ _('Snort version'), info.version ?? '-' ],
			st.running ? [ _('Process'), _('PID %d, running for %s, memory %s').format(st.pid, common.fmtUptime(st.uptime), common.fmtBytes(st.rss)) ] : null,
			[ _('Configuration mode'), st.manual ? _('Manual (own snort.lua)') : _('Managed by LuCI') ],
			[ _('Operation mode'), st.manual ? '-' : common.modeText(st.mode) ],
			[ _('Packet capture (DAQ)'), st.manual ? '-' : (st.method ?? '-').toUpperCase() ],
			[ _('Interface'), st.interface || '-' ],
			st.manual ? null : [ _('Home network'), st.home_net || '-' ],
			[ _('Rule set'), E('span', {}, [
				rulesText,
				ruleSrc ? ' · ' + ruleSrc : '',
				(st.rules_present && st.rules_updated) ? ' · ' + _('updated %s').format(common.fmtEpoch(st.rules_updated)) : '',
				st.rules_present ? ' · ' + (st.rules_volatile ? _('stored in RAM') : _('stored in flash')) : ''
			]) ],
			st.manual ? null : [ _('Custom rules'), _('%d active').format(info.local_rules?.enabled ?? 0) ],
			[ _('Alert log'), st.alert_files ? _('%s in %d file(s)').format(common.fmtBytes(st.alert_size), st.alert_files) : _('no alert log yet') ]
		]);
	},

	renderButtons(st) {
		const btn = (label, cls, fn, disabled) => E('button', {
			'class': 'btn cbi-button ' + cls,
			'click': ui.createHandlerFn(this, fn),
			'disabled': disabled ? '' : null
		}, [ label ]);

		return E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;margin-top:1em' }, [
			btn(_('Start'), 'cbi-button-apply', () => this.handleService('start'), st.running),
			btn(_('Stop'), 'cbi-button-reset', () => this.handleService('stop'), !st.running),
			btn(_('Restart'), 'cbi-button-action', () => this.handleService('restart'), !st.enabled),
			st.boot_enabled
				? btn(_('Disable at boot'), 'cbi-button-neutral', () => this.handleService('disable'))
				: btn(_('Enable at boot'), 'cbi-button-neutral', () => this.handleService('enable')),
			E('span', { 'style': 'flex:1' }),
			btn(_('Test configuration'), 'cbi-button-neutral', () => common.runJob('check', _('Configuration test')), st.jobs?.check),
			st.manual ? '' : btn(_('Show generated config'), 'cbi-button-neutral', () => common.showGenerated('snort')),
			(!st.manual && st.method === 'nfq') ? btn(_('Show nftables rules'), 'cbi-button-neutral', () => common.showGenerated('nftables')) : ''
		]);
	},

	/* ---- statistics ------------------------------------------------------ */

	renderStats(stats) {
		if (!stats || !stats.total)
			return E('p', { 'class': 'cbi-value-description' }, [ _('No alerts have been logged yet.') ]);

		const cards = E('div', { 'style': 'margin-bottom:1.2em' }, [ charts.kpis([
			{ value: charts.fmtNum(stats.total) + (stats.truncated ? '+' : ''), label: _('Alerts in log') },
			{ value: charts.fmtNum(stats.last24), label: _('Last 24 hours') },
			{ value: charts.fmtNum(stats.unique_sigs), label: _('Distinct rules') },
			{ value: charts.fmtNum(stats.unique_srcs), label: _('Source addresses') }
		]) ]);

		/* 24h histogram */
		const now = new Date(stats.now);
		const cols = stats.hours.map((n, i) => {
			const hour = new Date(now.getTime() - (23 - i) * 3600000).getHours();
			return { label: '%02d'.format(hour), title: _('%02d:00 – %d alerts').format(hour, n), values: [ n ] };
		});
		const histogram = E('div', { 'style': 'margin-bottom:1.2em' }, [
			E('h4', {}, [ _('Alerts per hour (last 24 hours)') ]),
			charts.columns({ columns: cols, height: 120, xEvery: 3 })
		]);

		const alertsUrl = (q) => L.url('admin/services/snort/alerts') + '?q=' + encodeURIComponent(q);

		const table = (title, head, rows) => E('div', { 'style': 'flex:1 1 22em;min-width:0' }, [
			E('h4', {}, [ title ]),
			E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr table-titles' }, head.map((h) => E('th', { 'class': 'th' }, [ h ]))),
				...rows
			])
		]);

		const sigRows = stats.top_sigs.map((s) => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'width:4em;text-align:right' }, [ String(s.count) ]),
			E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, [ common.ruleLink(s.gid, s.sid) ]),
			E('td', { 'class': 'td' }, [ E('a', { 'href': alertsUrl(s.sid) }, [ s.msg ?? '-' ]) ])
		]));
		const addrRows = (list) => list.map((a) => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'width:4em;text-align:right' }, [ String(a.count) ]),
			E('td', { 'class': 'td' }, [ E('a', { 'href': alertsUrl(a.key ?? a.addr) }, [ a.key ?? a.addr ]) ])
		]));

		return E('div', {}, [
			cards,
			histogram,
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:1.5em' }, [
				table(_('Top rules'), [ _('Count'), _('Rule'), _('Message') ], sigRows),
			]),
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:1.5em' }, [
				table(_('Top source addresses'), [ _('Count'), _('Address') ], addrRows(stats.top_srcs)),
				table(_('Top destination addresses'), [ _('Count'), _('Address') ], addrRows(stats.top_dsts))
			])
		]);
	},

	/* ---- actions --------------------------------------------------------- */

	handleService(action) {
		return common.serviceAction(action).then(() => this.refresh(true));
	},

	/* Only rebuild notices / buttons when their inputs change, so buttons stay clickable. */
	stateKey(st) {
		return JSON.stringify([ st.running, st.enabled, st.boot_enabled, st.manual, st.mode, st.method, st.interface, st.nfq_chain,
			st.logging, st.luci_include, st.rules_present, st.rules_volatile, st.rules_dangling,
			st.restart_needed, st.jobs ]);
	},

	refresh(withStats) {
		/* getInfo is more expensive (runs snort -V, counts rules): refresh it with the stats */
		const calls = [ common.callStatus() ];
		if (withStats)
			calls.push(common.callInfo(), common.callStats(0));

		return Promise.all(calls).then(([ st, info, stats ]) => {
			if (info)
				this.info = info;
			info = this.info;
			const key = this.stateKey(st);
			if (key !== this.lastKey) {
				this.lastKey = key;
				dom.content(this.noticeNode, this.renderNotices(st));
				dom.content(this.buttonNode, this.renderButtons(st));
			}
			dom.content(this.statusNode, this.renderStatus(st, info));
			if (stats)
				dom.content(this.statsNode, this.renderStats(stats));
		});
	},

	render([ st, info, stats ]) {
		this.info = info;
		this.noticeNode = E('div', {}, this.renderNotices(st));
		this.statusNode = E('div', {}, [ this.renderStatus(st, info) ]);
		this.buttonNode = E('div', { 'style': 'margin-bottom:1.5em' }, [ this.renderButtons(st) ]);
		this.lastKey = this.stateKey(st);
		this.statsNode = E('div', {}, [ this.renderStats(stats) ]);

		poll.add(() => {
			this.statsAge += 5;
			const withStats = this.statsAge >= 30;
			if (withStats)
				this.statsAge = 0;
			return this.refresh(withStats);
		}, 5);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Snort IDS') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Snort 3 is an open source network intrusion detection and prevention system. It inspects traffic on the selected interface, matches it against a rule set and logs (IDS) or blocks (IPS) suspicious traffic.')
			]),
			this.noticeNode,
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, [ _('Status') ]),
				this.statusNode,
				this.buttonNode
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;align-items:center' }, [
					E('h3', { 'style': 'flex:1' }, [ _('Alert statistics') ]),
					E('a', { 'class': 'btn cbi-button-action', 'style': 'margin-right:.5em', 'href': L.url('admin/services/snort/statistics') }, [ _('More statistics') ]),
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, () => this.refresh(true)) }, [ _('Refresh') ])
				]),
				this.statsNode
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
