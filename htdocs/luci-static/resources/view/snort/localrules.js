'use strict';
'require view';
'require dom';
'require ui';
'require snort.common as common';

const EXAMPLES = [
	'# Examples – remove the leading "#" to activate. Use SIDs >= 1000000.',
	'# alert icmp any any -> $HOME_NET any (msg:"LOCAL ping to home network"; itype:8; sid:1000001; rev:1;)',
	'# alert tcp $EXTERNAL_NET any -> $HOME_NET 22 (msg:"LOCAL inbound SSH"; flags:S; sid:1000002; rev:1;)',
	'# alert http any any -> any any (msg:"LOCAL curl user agent"; http_header:field user-agent; content:"curl/"; sid:1000003; rev:1;)',
	'# drop tcp any any -> any 23 (msg:"LOCAL block telnet (IPS only)"; sid:1000004; rev:1;)'
].join('\n');

return view.extend({
	load() {
		return Promise.all([
			common.callGetLocalRules(),
			common.callStatus()
		]);
	},

	analyse(text) {
		let active = 0, comments = 0;
		const sids = {}, dups = [], problems = [];
		text.split(/\n/).forEach((line, i) => {
			const l = line.trim();
			if (!l)
				return;
			if (l.charAt(0) === '#') {
				comments++;
				return;
			}
			active++;
			const sid = /\bsid\s*:\s*(\d+)\s*;/.exec(l);
			if (!sid)
				problems.push(_('Line %d: rule without sid').format(i + 1));
			else if (sids[sid[1]])
				dups.push(sid[1]);
			else
				sids[sid[1]] = true;
			if (!/\)\s*$/.test(l))
				problems.push(_('Line %d: rule does not end with ")"').format(i + 1));
		});
		dups.forEach((s) => problems.push(_('Duplicate sid %s').format(s)));
		return { active, comments, problems };
	},

	updateInfo() {
		const res = this.analyse(this.textarea.value);
		dom.content(this.infoNode, [
			_('%d active rule(s)').format(res.active), ' ',
			...res.problems.map((p) => E('div', { 'style': 'color:#c62828' }, [ '⚠ ', p ]))
		]);
	},

	render([ data, st ]) {
		this.path = data.path;
		this.textarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width:100%;min-height:24em;font-family:monospace;font-size:90%;white-space:pre;overflow-wrap:normal;overflow-x:auto',
			'spellcheck': 'false',
			'rows': 24,
			'wrap': 'off',
			'input': () => this.updateInfo()
		}, [ data.content ?? '' ]);
		this.infoNode = E('div', { 'class': 'cbi-value-description' });
		this.updateInfo();

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Snort IDS – Custom Rules') ]),
			E('div', { 'class': 'cbi-map-descr' },
				_('Your own Snort rules, loaded in addition to the downloaded rule set. They are stored in <code>%h</code> and kept on sysupgrade. After saving, Snort is restarted when you use “Save & Apply”.').format(this.path)),
			...common.notices(st, 'localrules'),
			E('div', { 'class': 'cbi-section' }, [
				this.textarea,
				this.infoNode,
				E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;margin-top:.8em' }, [
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleValidate') }, [ _('Save & test configuration') ]),
					E('button', { 'class': 'btn cbi-button-neutral', 'click': () => {
						this.textarea.value = this.textarea.value.replace(/\s*$/, '') + '\n\n' + EXAMPLES + '\n';
						this.updateInfo();
					} }, [ _('Insert examples') ]),
					E('a', { 'class': 'btn cbi-button-neutral', 'href': 'https://docs.snort.org/rules/', 'target': '_blank', 'rel': 'noreferrer' }, [ _('Rule writing guide') ])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, [ _('Quick reference') ]),
				E('pre', { 'style': 'white-space:pre-wrap;font-size:90%' }, [
					'action proto source port -> destination port (options; sid:N; rev:N;)\n\n',
					'action:  alert | block | drop | reject | pass   (block/drop/reject only act in IPS mode)\n',
					'proto:   ip | tcp | udp | icmp | http | dns | ssl | …\n',
					'address: any, $HOME_NET, $EXTERNAL_NET, 192.168.1.10, [10.0.0.0/8,!10.1.0.0/16]\n',
					'options: msg:"…"; content:"…"; nocase; flow:to_server,established; itype:8; …'
				])
			])
		]);
	},

	save() {
		const res = this.analyse(this.textarea.value);
		if (res.problems.length)
			ui.addNotification(null, E('p', {}, [ _('Saved with warnings: %s').format(res.problems.join('; ')) ]), 'warning');
		return common.callSetLocalRules(this.textarea.value).then((r) => {
			if (!r?.result)
				throw new Error(r?.error ?? _('Unable to save the custom rules'));
			return r;
		});
	},

	handleValidate() {
		return this.save()
			.then(() => common.runJob('check', _('Configuration test')))
			.catch((e) => ui.addNotification(null, E('p', {}, [ e.message ]), 'error'));
	},

	handleSave() {
		return this.save().then(() => {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Custom rules saved. Restart Snort to activate them.') ]), 5000, 'info');
		}).catch((e) => ui.addNotification(null, E('p', {}, [ e.message ]), 'error'));
	},

	handleSaveApply() {
		return this.save()
			.then(() => common.callStatus())
			.then((st) => {
				if (!st.running) {
					ui.addTimeLimitedNotification(null, E('p', {}, [ _('Custom rules saved. Snort is not running.') ]), 5000, 'info');
					return;
				}
				return common.runJob('check', _('Testing configuration before restart')).then((rc) => {
					if (rc !== 0)
						return;
					ui.hideModal();
					return common.serviceAction('restart').then(() =>
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('Custom rules saved and Snort restarted.') ]), 5000, 'info'));
				});
			})
			.catch((e) => ui.addNotification(null, E('p', {}, [ e.message ]), 'error'));
	},

	handleReset() {
		return common.callGetLocalRules().then((data) => {
			this.textarea.value = data.content ?? '';
			this.updateInfo();
		});
	}
});
