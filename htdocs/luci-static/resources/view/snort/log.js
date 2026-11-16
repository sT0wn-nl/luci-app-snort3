'use strict';
'require view';
'require poll';
'require ui';
'require snort.common as common';

return view.extend({
	load() {
		return common.callSyslog(500);
	},

	update(log) {
		const q = (this.filter.value || '').toLowerCase();
		let lines = (log || '').split(/\n/).filter((l) => l.length);
		if (q)
			lines = lines.filter((l) => l.toLowerCase().indexOf(q) > -1);
		this.raw = log;
		this.textarea.value = lines.length ? lines.reverse().join('\n') : _('No log entries.');
	},

	render(log) {
		this.textarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width:100%;min-height:30em;font-family:monospace;font-size:85%',
			'readonly': 'readonly',
			'rows': 30,
			'wrap': 'off'
		});
		this.filter = E('input', {
			'type': 'search', 'class': 'cbi-input-text', 'style': 'flex:1 1 16em',
			'placeholder': _('Filter…'),
			'input': () => this.update(this.raw)
		});
		this.update(log);

		poll.add(() => common.callSyslog(500).then((l) => this.update(l)), 10);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, [ _('Snort IDS – System Log') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Messages from Snort, snort-rules, snort-mgr and luci-snort in the system log (newest first). Useful when Snort fails to start.')
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;gap:.5em;margin-bottom:.8em' }, [
					this.filter,
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, () => common.callSyslog(500).then((l) => this.update(l))) }, [ _('Refresh') ])
				]),
				this.textarea
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
