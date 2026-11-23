'use strict';
'require baseclass';
'require rpc';
'require ui';
'require uci';

/*
 * Shared helpers for the luci-app-snort views.
 */

const callStatus = rpc.declare({ object: 'luci.snort', method: 'getStatus', expect: { '': {} } });
const callInfo = rpc.declare({ object: 'luci.snort', method: 'getInfo', expect: { '': {} } });
const callAlerts = rpc.declare({ object: 'luci.snort', method: 'getAlerts', params: [ 'limit', 'all' ], expect: { '': {} } });
const callStats = rpc.declare({ object: 'luci.snort', method: 'getStats', params: [ 'range', 'all' ], expect: { '': {} } });
const callPerf = rpc.declare({ object: 'luci.snort', method: 'getPerf', params: [ 'range' ], expect: { '': {} } });
const callCategories = rpc.declare({ object: 'luci.snort', method: 'getCategories', expect: { '': {} } });
const callClearAlerts = rpc.declare({ object: 'luci.snort', method: 'clearAlerts', expect: { '': {} } });
const callLookupRule = rpc.declare({ object: 'luci.snort', method: 'lookupRule', params: [ 'gid', 'sid' ], expect: { '': {} } });
const callSyslog = rpc.declare({ object: 'luci.snort', method: 'getSyslog', params: [ 'lines' ], expect: { log: '' } });
const callServiceAction = rpc.declare({ object: 'luci.snort', method: 'serviceAction', params: [ 'action' ], expect: { '': {} } });
const callJobStart = rpc.declare({ object: 'luci.snort', method: 'jobStart', params: [ 'name' ], expect: { '': {} } });
const callJobStatus = rpc.declare({ object: 'luci.snort', method: 'jobStatus', params: [ 'name' ], expect: { '': {} } });
const callPrintConfig = rpc.declare({ object: 'luci.snort', method: 'printConfig', params: [ 'type' ], expect: { output: '' } });
const callGetLocalRules = rpc.declare({ object: 'luci.snort', method: 'getLocalRules', expect: { '': {} } });
const callSetLocalRules = rpc.declare({ object: 'luci.snort', method: 'setLocalRules', params: [ 'content' ], expect: { '': {} } });

const COLORS = {
	green:  '#2e7d32',
	red:    '#c62828',
	orange: '#e65100',
	blue:   '#1565c0',
	grey:   '#616161'
};

return baseclass.extend({
	callStatus, callInfo, callAlerts, callStats, callClearAlerts, callLookupRule,
	callSyslog, callServiceAction, callJobStart, callJobStatus, callPrintConfig,
	callGetLocalRules, callSetLocalRules, callPerf, callCategories,

	/* Stage a new suppression (UCI); the user activates it with Save & Apply. */
	addSuppression(a, track, ip) {
		return uci.load('snort').then(() => {
			const exists = uci.sections('snort', 'suppress').some((s) =>
				+(s.gid ?? 1) === +(a.gid ?? 1) && +s.sid === +a.sid && (s.track ?? '') === (track || '') && (s.ip ?? '') === (ip || ''));
			ui.hideModal();
			if (exists) {
				ui.addTimeLimitedNotification(null, E('p', {}, [ _('This suppression already exists.') ]), 5000, 'info');
				return;
			}
			const sid = uci.add('snort', 'suppress');
			uci.set('snort', sid, 'enabled', '1');
			uci.set('snort', sid, 'gid', String(a.gid ?? 1));
			uci.set('snort', sid, 'sid', String(a.sid));
			if (track) {
				uci.set('snort', sid, 'track', track);
				uci.set('snort', sid, 'ip', ip);
			}
			uci.set('snort', sid, 'comment', (a.msg ?? '').substring(0, 120));
			return uci.save().then(() => {
				ui.changes.init();
				ui.addTimeLimitedNotification(null, E('p', {}, [
					_('Suppression for rule %d:%d added. Use “Save & Apply” (unsaved changes, top right) to activate it.').format(a.gid ?? 1, a.sid), ' ',
					E('a', { 'href': L.url('admin/services/snort/suppress') }, [ _('View suppressions') ])
				]), 10000, 'info');
			});
		});
	},

	/* Stage disabling a rule (snort.luci.disabled_sid). */
	disableRule(gid, sid, msg) {
		return uci.load('snort').then(() => {
			ui.hideModal();
			if (!uci.get('snort', 'luci'))
				uci.add('snort', 'luci', 'luci');
			const key = '%d:%d'.format(gid ?? 1, sid);
			const list = L.toArray(uci.get('snort', 'luci', 'disabled_sid'));
			if (list.indexOf(key) > -1) {
				ui.addTimeLimitedNotification(null, E('p', {}, [ _('Rule %s is already disabled.').format(key) ]), 5000, 'info');
				return;
			}
			list.push(key);
			uci.set('snort', 'luci', 'disabled_sid', list);
			return uci.save().then(() => {
				ui.changes.init();
				ui.addTimeLimitedNotification(null, E('p', {}, [
					_('Rule %s (%s) will be disabled. Use “Save & Apply” (unsaved changes, top right) to activate it.').format(key, msg ?? '-'), ' ',
					E('a', { 'href': L.url('admin/services/snort/rules') }, [ _('View disabled rules') ])
				]), 10000, 'info');
			});
		});
	},

	/* Small coloured pill, readable in light and dark themes. */
	badge(text, color) {
		return E('span', {
			'style': 'display:inline-block;padding:.1em .6em;border-radius:1em;font-size:90%%;font-weight:bold;color:#fff;background:%s;white-space:nowrap'
				.format(COLORS[color] ?? color ?? COLORS.grey)
		}, [ text ]);
	},

	actionColor(action) {
		switch (action) {
		case 'drop': case 'block': case 'reject': case 'would_drop': case 'would_block': case 'sdrop':
			return 'red';
		case 'alert':
			return 'orange';
		case 'allow': case 'pass':
			return 'blue';
		default:
			return 'grey';
		}
	},

	ruleDocUrl(gid, sid) {
		return 'https://www.snort.org/rule-docs/%d-%d'.format(+gid || 1, +sid || 0);
	},

	ruleLink(gid, sid, rev) {
		const text = rev != null ? '%d:%d:%d'.format(gid ?? 1, sid ?? 0, rev) : '%d:%d'.format(gid ?? 1, sid ?? 0);
		return E('a', { 'href': this.ruleDocUrl(gid, sid), 'target': '_blank', 'rel': 'noreferrer noopener',
			'title': _('Open the rule documentation on snort.org') }, [ text ]);
	},

	fmtTime(ms) {
		if (!ms)
			return '-';
		const d = new Date(ms);
		const pad = (n) => String(n).padStart(2, '0');
		return '%d-%s-%s %s:%s:%s'.format(d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()),
			pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()));
	},

	fmtEpoch(sec) {
		return sec ? this.fmtTime(sec * 1000) : '-';
	},

	fmtBytes(n) {
		return '%1024.2mB'.format(n ?? 0);
	},

	fmtUptime(s) {
		return (s != null) ? '%t'.format(s) : '-';
	},

	addr(ip, port) {
		if (!ip)
			return '-';
		if (port == null || port === '' || port === 0)
			return ip;
		return (ip.indexOf(':') > -1) ? '[%s]:%s'.format(ip, port) : '%s:%s'.format(ip, port);
	},

	modeText(mode) {
		return (mode === 'ips') ? _('IPS – inline prevention') : _('IDS – passive detection');
	},

	sourceText(src) {
		switch (src) {
		case 'community': return _('Snort community rules');
		case 'subscription': return _('Snort registered/subscriber rules (oinkcode)');
		case 'testing': return _('Test rules (ICMP ping only)');
		default: return src ? src : _('unknown');
		}
	},

	/* Table helper: rows of [label, value] */
	kvTable(rows) {
		return E('table', { 'class': 'table' }, rows.filter((r) => r).map((r) =>
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'style': 'width:33%' }, [ r[0] ]),
				E('td', { 'class': 'td left' }, [ r[1] ])
			])));
	},

	/* Run a service action with a busy modal, resolves to the result object. */
	serviceAction(action) {
		const titles = {
			start: _('Starting Snort…'),
			stop: _('Stopping Snort…'),
			restart: _('Restarting Snort…'),
			enable: _('Enabling Snort at boot…'),
			disable: _('Disabling Snort at boot…')
		};
		ui.showModal(null, [ E('p', { 'class': 'spinning' }, [ titles[action] ?? action ]) ]);
		return callServiceAction(action).then((res) => {
			ui.hideModal();
			if (!res?.result) {
				ui.addNotification(null, [
					E('p', {}, [ _('Command "%s" failed (exit code %s).').format(action, res?.rc ?? '?') ]),
					res?.output ? E('pre', { 'style': 'white-space:pre-wrap' }, [ res.output ]) : '',
					E('p', {}, [ _('Run a configuration test from the Overview page for details.') ])
				], 'error');
			}
			return res;
		}).catch((e) => {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, [ e.message ]), 'error');
		});
	},

	/*
	 * Start a background job (update / update-restart / check) and show its
	 * live output in a modal.  Resolves to the exit code.
	 */
	runJob(name, title, extraButtons) {
		const log = E('pre', { 'style': 'max-height:24em;overflow:auto;white-space:pre-wrap;font-size:90%' }, [ _('Starting…') ]);
		const state = E('p', { 'class': 'spinning' }, [ _('Running, please wait…') ]);
		const buttons = E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Close') ])
		]);

		ui.showModal(title, [ state, log, buttons ]);

		return callJobStart(name).then((res) => {
			if (!res?.result)
				throw new Error(res?.error ?? _('Unable to start job'));

			return new Promise((resolve) => {
				const tick = () => {
					callJobStatus(name).then((st) => {
						if (st?.log)
							log.textContent = st.log;
						log.scrollTop = log.scrollHeight;

						if (st?.rc == null) {
							window.setTimeout(tick, 1500);
							return;
						}

						state.classList.remove('spinning');
						dom_replace(state, (st.rc === 0)
							? this.badge(_('Finished successfully'), 'green')
							: this.badge(_('Failed (exit code %d)').format(st.rc), 'red'));

						if (Array.isArray(extraButtons) && st.rc === 0)
							extraButtons.forEach((b) => buttons.insertBefore(b, buttons.firstChild));

						resolve(st.rc);
					}).catch(() => window.setTimeout(tick, 3000));
				};
				window.setTimeout(tick, 1000);
			});
		}).catch((e) => {
			state.classList.remove('spinning');
			state.textContent = e.message;
			return -1;
		});
	},

	/* Modal showing generated configuration (snort-mgr print …). */
	showGenerated(type) {
		const titles = {
			snort: _('Generated Snort configuration'),
			nftables: _('Generated nftables rules (NFQ)'),
			config: _('Effective UCI configuration incl. defaults')
		};
		ui.showModal(titles[type], [ E('p', { 'class': 'spinning' }, [ _('Loading…') ]) ]);
		return callPrintConfig(type).then((out) => {
			ui.showModal(titles[type], [
				E('pre', { 'style': 'max-height:32em;overflow:auto;font-size:90%' }, [ out || _('(empty)') ]),
				E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Close') ]) ])
			]);
		});
	},

	/*
	 * Check the combination of operation mode, DAQ and interface.
	 * Returns { level: 'error'|'warning', text } or null.
	 */
	daqProblem(mode, method, iface, chain) {
		const devs = String(iface || '').split(':').filter((d) => d);
		const noEther = devs.filter((d) => /^(pppoe-|ppp|l2tp-|pptp-|3g-|wwan|tun|tap|wg|gre|ipsec|xfrm|ifb)/.test(d));

		if (mode === 'ips' && method === 'pcap')
			return { level: 'error', text: _('IPS mode cannot block with the pcap DAQ: Snort only sees a copy of the traffic. Use the nfq DAQ with chain hook "forward".') };
		if (mode === 'ips' && method === 'afpacket' && devs.length < 2)
			return { level: 'error', text: _('IPS mode with the afpacket DAQ needs an interface pair such as eth0:eth1 (Snort bridges the two). With a single interface Snort only sees a copy of the traffic: alerts say "block", but nothing is blocked. On a router use the nfq DAQ with chain hook "forward".') };
		if ((method === 'afpacket' || method === 'pcap') && noEther.length)
			return { level: 'error', text: _('Interface %s is not an Ethernet device; the %s DAQ cannot capture on it and Snort will not start. Choose br-lan or the physical device below it, or use the nfq DAQ.').format(noEther.join(', '), method) };
		if (mode === 'ips' && method === 'nfq' && chain && chain !== 'forward')
			return { level: 'warning', text: _('NFQ chain hook is "%s": only traffic to or from the router itself is inspected. Use "forward" to inspect and block traffic between LAN and internet.').format(chain) };
		return null;
	},

	/* Note about alerts of rules that are now disabled or suppressed. */
	hiddenNote(n, showHref, onShow) {
		if (!n)
			return '';
		return E('div', { 'class': 'alert-message notice', 'style': 'margin:.5em 0' }, [
			_('%d alert(s) from rules that are now disabled or suppressed are not shown; they were logged before the change.').format(n), ' ',
			onShow
				? E('a', { 'href': '#', 'click': (ev) => { ev.preventDefault(); onShow(); } }, [ _('Show them') ])
				: E('a', { 'href': showHref || L.url('admin/services/snort/alerts') + '?all=1' }, [ _('Show them') ])
		]);
	},

	tunedBadge(state) {
		if (state === 'disabled')
			return this.badge(_('rule disabled'), 'grey');
		if (state === 'suppressed')
			return this.badge(_('suppressed'), 'grey');
		return '';
	},

	/* Notices shared by several pages. */
	notices(st, page) {
		const out = [];
		const link = (path, text) => E('a', { 'href': L.url('admin/services/snort', path) }, [ text ]);

		if (st.manual && page !== 'settings')
			out.push(E('div', { 'class': 'alert-message warning' }, [
				E('strong', {}, [ _('Manual configuration mode.') ]), ' ',
				_('Snort is started with its own snort.lua; network, detection and logging settings, custom rules and suppressions from LuCI are not applied.'), ' ',
				link('settings', _('Change in Settings'))
			]));

		if (!st.manual && st.luci_include === false)
			out.push(E('div', { 'class': 'alert-message warning' }, [
				_('The LuCI include hook is not active (option snort.snort.include was changed). Custom rules and suppressions are not applied.')
			]));

		return out;
	}
});

function dom_replace(oldNode, newNode) {
	oldNode.parentNode?.replaceChild(newNode, oldNode);
}
