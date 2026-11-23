'use strict';
'require view';
'require dom';
'require form';
'require poll';
'require uci';
'require ui';
'require snort.common as common';

return view.extend({
	load() {
		return Promise.all([
			common.callInfo(),
			common.callStatus(),
			common.callCategories(),
			common.callStats(2592000),
			uci.load('snort')
		]);
	},

	renderRuleStatus(info, st) {
		const r = info.rules ?? {};
		let state;
		if (r.symlink && !r.exists)
			state = common.badge(_('Missing (lost after reboot)'), 'red');
		else if (!r.files?.length)
			state = common.badge(_('Not installed'), 'red');
		else
			state = common.badge(_('Installed'), 'green');

		const location = r.symlink
			? _('%s → %s').format(r.path, r.target)
			: r.path;

		const files = (r.files ?? []).map((f) => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, [ f.name ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(f.enabled ?? 0) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(f.luci ?? 0) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(f.disabled ?? 0) ]),
			E('td', { 'class': 'td', 'style': 'text-align:right' }, [ common.fmtBytes(f.size) ]),
			E('td', { 'class': 'td' }, [ common.fmtEpoch(f.mtime) ])
		]));

		const running = st.jobs?.update || st.jobs?.['update-restart'];

		return E('div', {}, [
			common.kvTable([
				[ _('State'), state ],
				[ _('Source'), r.source ? common.sourceText(r.source) : _('unknown (installed outside LuCI)') ],
				[ _('Last update'), common.fmtEpoch(r.last_update ?? r.mtime) ],
				[ _('Location'), E('span', {}, [ location, ' ', r.files?.length ? common.badge(r.volatile ? _('RAM') : _('flash'), r.volatile ? 'orange' : 'blue') : '' ]) ],
				[ _('Rules'), E('span', {}, [
					_('%d active').format(info.rules_total?.enabled ?? 0),
					' · ', _('%d disabled in LuCI').format((info.rules_total?.luci ?? 0) + (info.local_rules?.luci ?? 0)),
					' · ', _('%d commented out in the rule files').format(info.rules_total?.disabled ?? 0)
				]) ],
				[ _('Custom rules'), E('span', {}, [
					_('%d active in %s').format(info.local_rules?.enabled ?? 0, info.local_rules?.path ?? '-'), ' ',
					E('a', { 'href': L.url('admin/services/snort/localrules') }, [ _('Edit') ])
				]) ]
			]),
			files.length ? E('details', { 'style': 'margin:.5em 0 1em' }, [
				E('summary', { 'style': 'cursor:pointer' }, [ _('Rule files (%d)').format(files.length) ]),
				E('table', { 'class': 'table cbi-section-table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, [ _('File') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Active') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Disabled in LuCI') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Commented out') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Size') ]),
						E('th', { 'class': 'th' }, [ _('Modified') ])
					]),
					...files
				])
			]) : '',
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;align-items:center' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-apply',
					'disabled': running ? '' : null,
					'click': ui.createHandlerFn(this, 'handleUpdate', st)
				}, [ running ? _('Update running…') : _('Download / update rules now') ]),
				E('span', { 'class': 'cbi-value-description' }, [ _('Uses the saved settings below. Save & Apply changes first.') ])
			])
		]);
	},

	handleUpdate(st) {
		const restartBtn = E('button', {
			'class': 'btn cbi-button-action',
			'click': () => {
				ui.hideModal();
				common.serviceAction('restart').then(() => this.refreshStatus());
			}
		}, [ _('Restart Snort now') ]);

		return common.runJob('update', _('Updating Snort rules'), st.running ? [ restartBtn ] : [])
			.then(() => this.refreshStatus());
	},

	refreshStatus() {
		return Promise.all([ common.callInfo(), common.callStatus() ]).then(([ info, st ]) => {
			dom.content(this.statusNode, this.renderRuleStatus(info, st));
		});
	},

	renderCategories(cats, stats) {
		const list = cats.categories || [];
		if (!list.length)
			return E('p', { 'class': 'cbi-value-description' }, [ _('Install a rule set to manage its categories.') ]);

		const disabled = () => L.toArray(uci.get('snort', 'luci', 'disabled_category'));
		const toggle = (name, on) => {
			let d = disabled().filter((c) => c !== name);
			if (!on)
				d.push(name);
			uci.set('snort', 'luci', 'disabled_category', d.length ? d : null);
		};
		const counts = stats.categories || {};
		const fired = stats.cat_rules || {};

		const rows = list.map((c) => {
			const on = disabled().indexOf(c.name) < 0;
			const n = counts[c.name] || 0;
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'width:2.5em' }, [
					E('input', { 'type': 'checkbox', 'checked': on ? '' : null, 'title': _('Enabled'),
						'change': (ev) => toggle(c.name, ev.target.checked) })
				]),
				E('td', { 'class': 'td' }, [ c.name ]),
				E('td', { 'class': 'td', 'style': 'text-align:right' }, [ String(c.rules) ]),
				E('td', { 'class': 'td', 'style': 'text-align:right' }, [ n ? String(n) : '–' ]),
				E('td', { 'class': 'td', 'style': 'text-align:right' }, [ fired[c.name] ? String(fired[c.name]) : '–' ])
			]);
		});

		return E('div', {}, [
			E('div', { 'class': 'cbi-section-descr' }, [
				_('Uncheck a category to disable all its rules (they are not evaluated, saving CPU and memory). The alert columns cover the last 30 days and help to spot noisy categories. Save & Apply to activate.')
			]),
			E('div', { 'style': 'max-height:28em;overflow:auto' }, [
				E('table', { 'class': 'table cbi-section-table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, [ '' ]),
						E('th', { 'class': 'th' }, [ _('Category') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Rules') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Alerts (30 days)') ]),
						E('th', { 'class': 'th', 'style': 'text-align:right' }, [ _('Rules fired') ])
					]),
					...rows
				])
			])
		]);
	},

	render([ info, st, cats, stats ]) {
		let m, s, o;

		if (!uci.get('snort', 'luci'))
			uci.add('snort', 'luci', 'luci');

		m = new form.Map('snort', _('Snort IDS – Rules'),
			_('Snort needs a rule set to detect anything. The free <em>community</em> rules need no account; the larger <em>registered/subscriber</em> rule sets need an oinkcode from snort.org.'));

		/* Rule set status (custom rendered) */
		this.statusNode = E('div', {}, [ this.renderRuleStatus(info, st) ]);
		s = m.section(form.NamedSection, 'luci', 'luci', _('Installed rule set'));
		s.render = () => E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, [ _('Installed rule set') ]),
			this.statusNode
		]);

		/* Source and update settings */
		s = m.section(form.NamedSection, 'luci', 'luci', _('Rule source & updates'));
		s.addremove = false;

		o = s.option(form.ListValue, 'rules_source', _('Rule set'));
		o.value('community', _('Snort community rules (free, ~4,000 rules)'));
		o.value('subscription', _('Snort registered/subscriber rules (oinkcode)'));
		o.value('testing', _('Test rules (only alerts on ICMP ping, no download)'));
		o.default = 'community';
		o.rmempty = false;

		o = s.option(form.Value, '_oinkcode', _('Oinkcode'),
			_('Personal code from your account at <a href="https://www.snort.org/oinkcodes" target="_blank" rel="noreferrer">snort.org/oinkcodes</a>. Note: the snort3 package downloads the snapshot for a fixed Snort version.'));
		o.ucisection = 'snort';
		o.ucioption = 'oinkcode';
		o.password = true;
		o.depends('snort.luci.rules_source', 'subscription');
		o.validate = (section_id, value) => {
			if (!value)
				return _('An oinkcode is required for this rule set');
			return /^[0-9a-fA-F]{20,64}$/.test(value) ? true : _('An oinkcode is a 40 character hexadecimal string');
		};

		o = s.option(form.Flag, 'rules_persist', _('Store rules persistently'),
			_('Keep the rules in <code>%s/rules</code> on flash so they survive a reboot (several MB, written on every update). Otherwise they are kept in RAM and must be downloaded again after a reboot.').format(info.config_dir ?? '/etc/snort'));
		o.default = '0';

		o = s.option(form.Flag, 'rules_backup', _('Keep backup of previous rules'),
			_('Move the previous rules to <code>%s/old.rules</code> before installing new ones.').format(info.temp_dir ?? '/var/snort.d'));
		o.default = '0';

		o = s.option(form.ListValue, 'auto_update', _('Automatic update'),
			_('Download new rules on a schedule (via cron). With rules in RAM this also restores them after a reboot at the next scheduled time.'));
		o.value('0', _('disabled'));
		o.value('daily', _('daily'));
		o.value('weekly', _('weekly (Sunday)'));
		o.default = '0';

		o = s.option(form.ListValue, 'update_hour', _('Update time'));
		for (let h = 0; h < 24; h++)
			o.value(String(h), '%02d:00'.format(h));
		o.default = '3';
		o.depends('auto_update', 'daily');
		o.depends('auto_update', 'weekly');

		o = s.option(form.Flag, 'update_restart', _('Restart Snort after update'),
			_('Restart a running Snort after an automatic update (only when the configuration test succeeds).'));
		o.default = '1';
		o.depends('auto_update', 'daily');
		o.depends('auto_update', 'weekly');

		/* Categories and individually disabled rules */
		s = m.section(form.NamedSection, 'luci', 'luci', _('Rule categories'));
		s.render = () => E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, [ _('Rule categories') ]),
			this.renderCategories(cats, stats)
		]);

		s = m.section(form.NamedSection, 'luci', 'luci', _('Disabled rules'),
			_('Individual rules that are switched off, as <code>gid:sid</code>. Rules can also be disabled from the Alerts and Statistics pages.'));
		o = s.option(form.DynamicList, 'disabled_sid', _('Disabled rules'));
		o.validate = (section_id, value) => (!value || /^\d+:\d+$/.test(value)) ? true : _('Expecting gid:sid, e.g. 1:2018959');
		o.placeholder = '1:408';

		/* Only re-read the (more expensive) rule info while an update job runs. */
		this.wasRunning = false;
		poll.add(() => common.callStatus().then((cur) => {
			const running = !!(cur.jobs?.update || cur.jobs?.['update-restart']);
			if (running || this.wasRunning) {
				this.wasRunning = running;
				return this.refreshStatus();
			}
		}), 5);

		return m.render();
	}
});
