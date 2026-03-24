'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callGetStatus = rpc.declare({
	object: 'luci.snort3',
	method: 'getStatus'
});

var callServiceAction = rpc.declare({
	object: 'luci.snort3',
	method: 'serviceAction',
	params: ['action']
});

function doAction(action) {
	return callServiceAction(action).then(function(result) {
		if (result && result.success) {
			ui.addNotification(null, E('p', {}, result.message), 'info');
		} else {
			ui.addNotification(null, E('p', {}, _('Error') + ': ' + (result ? result.message : '')), 'danger');
		}
	});
}

function updateStatus(status) {
	var fields = {
		'snort-status': function() {
			return status.running
				? E('span', { 'style': 'color:green;font-weight:bold' }, '\u25CF ' + _('Running'))
				: E('span', { 'style': 'color:red;font-weight:bold' }, '\u25CF ' + _('Stopped'));
		},
		'snort-pid': function() { return document.createTextNode(status.pid || 'N/A'); },
		'snort-mem': function() { return document.createTextNode(status.mem_usage || 'N/A'); },
		'snort-sysmem': function() {
			var c = status.mem_percent > 80 ? 'red' : (status.mem_percent > 60 ? 'orange' : 'green');
			return E('span', { 'style': 'color:' + c },
				status.mem_used + ' MB / ' + status.mem_total + ' MB (' + status.mem_percent + '%)');
		},
		'snort-alerts': function() { return document.createTextNode(String(status.alert_count)); },
		'snort-interface': function() { return document.createTextNode(status.interface); },
		'snort-mode': function() { return document.createTextNode(status.mode.toUpperCase()); },
		'snort-method': function() { return document.createTextNode(status.method.toUpperCase()); }
	};

	Object.keys(fields).forEach(function(id) {
		var el = document.getElementById(id);
		if (el) {
			el.innerHTML = '';
			el.appendChild(fields[id]());
		}
	});
}

return view.extend({
	load: function() {
		return callGetStatus();
	},

	render: function(status) {
		var rows = [
			[_('Status'), 'snort-status'],
			['PID', 'snort-pid'],
			[_('Snort memory'), 'snort-mem'],
			[_('System memory'), 'snort-sysmem'],
			[_('Total alerts'), 'snort-alerts'],
			[_('Interface'), 'snort-interface'],
			[_('Mode'), 'snort-mode'],
			[_('DAQ method'), 'snort-method']
		];

		var tableRows = rows.map(function(r) {
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'width:30%;font-weight:bold' }, r[0] + ':'),
				E('td', { 'class': 'td', 'id': r[1] }, E('em', {}, _('Loading...')))
			]);
		});

		var view = E('div', {}, [
			E('h2', {}, _('Snort IDS/IPS - Status')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service Status')),
				E('table', { 'class': 'table', 'style': 'width:100%' }, tableRows)
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Controls')),
				E('div', { 'style': 'padding:10px 0' }, [
					E('button', {
						'class': 'cbi-button cbi-button-apply', 'style': 'margin:5px',
						'click': function() { return doAction('start'); }
					}, '\u25B6 ' + _('Start')),
					E('button', {
						'class': 'cbi-button cbi-button-reset', 'style': 'margin:5px',
						'click': function() { return doAction('stop'); }
					}, '\u25A0 ' + _('Stop')),
					E('button', {
						'class': 'cbi-button cbi-button-action', 'style': 'margin:5px',
						'click': function() { return doAction('restart'); }
					}, '\u21BB ' + _('Restart')),
					E('button', {
						'class': 'cbi-button cbi-button-save', 'style': 'margin:5px',
						'click': function() { return doAction('enable'); }
					}, _('Enable at boot')),
					E('button', {
						'class': 'cbi-button cbi-button-remove', 'style': 'margin:5px',
						'click': function() { return doAction('disable'); }
					}, _('Disable at boot'))
				])
			])
		]);

		updateStatus(status);

		poll.add(function() {
			return callGetStatus().then(updateStatus);
		}, 3);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
