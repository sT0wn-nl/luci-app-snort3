'use strict';
'require view';
'require rpc';
'require ui';

var callGetAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'getAlerts'
});

var callClearAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'clearAlerts'
});

var actionColors = {
	'allow': '#17a2b8',
	'alert': '#ffc107',
	'drop': '#dc3545',
	'block': '#dc3545',
	'reject': '#dc3545',
	'log': '#6c757d'
};

function parseAlertLine(line) {
	try {
		return JSON.parse(line);
	} catch(e) {
		return null;
	}
}

function renderAlertTable(text) {
	var lines = (text || '').split('\n').filter(function(l) { return l.trim() !== ''; });

	if (lines.length === 0) {
		return E('div', { 'style': 'text-align:center;opacity:0.5;padding:30px' },
			_('No alerts recorded'));
	}

	var headerRow = E('tr', { 'class': 'tr table-titles' }, [
		E('th', { 'class': 'th' }, _('Time')),
		E('th', { 'class': 'th' }, _('Action')),
		E('th', { 'class': 'th' }, _('Protocol')),
		E('th', { 'class': 'th' }, _('Source')),
		E('th', { 'class': 'th' }, _('Destination')),
		E('th', { 'class': 'th' }, _('Message'))
	]);

	var rows = [headerRow];

	lines.forEach(function(line) {
		var a = parseAlertLine(line);
		if (a) {
			var color = actionColors[a.action] || '#6c757d';
			var src = a.src_addr + (a.src_port ? ':' + a.src_port : '');
			var dst = a.dst_addr + (a.dst_port ? ':' + a.dst_port : '');

			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'white-space:nowrap;font-size:0.85em' },
					a.timestamp || '-'),
				E('td', { 'class': 'td' },
					E('span', {
						'style': 'padding:2px 6px;border-radius:8px;font-size:0.8em;font-weight:bold;color:white;background:' + color
					}, (a.action || '-').toUpperCase())),
				E('td', { 'class': 'td' }, a.proto || '-'),
				E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:0.85em' }, src),
				E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:0.85em' }, dst),
				E('td', { 'class': 'td', 'style': 'font-weight:bold;color:' + color }, a.msg || '-')
			]));
		} else {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': '6' }, line)
			]));
		}
	});

	return E('table', { 'class': 'table', 'id': 'alerts-table' }, rows);
}

function renderLogLines(text) {
	var lines = (text || '').split('\n').filter(function(l) { return l.trim() !== ''; });
	if (lines.length === 0) {
		return E('div', { 'style': 'text-align:center;opacity:0.5;padding:20px' },
			_('No logs'));
	}
	return E('div', {}, lines.map(function(line) {
		return E('div', {
			'style': 'padding:4px 0;border-bottom:1px solid currentColor;opacity:0.8;word-wrap:break-word;font-size:0.85em'
		}, line);
	}));
}

function refreshAlerts() {
	return callGetAlerts().then(function(data) {
		var box = document.getElementById('alerts-box');
		if (box) {
			box.innerHTML = '';
			box.appendChild(renderAlertTable(data ? data.alerts : ''));
		}
		var logBox = document.getElementById('logs-box');
		if (logBox) {
			logBox.innerHTML = '';
			logBox.appendChild(renderLogLines(data ? data.logs : ''));
		}
	});
}

return view.extend({
	load: function() {
		return callGetAlerts();
	},

	render: function(data) {
		var alerts = data ? data.alerts : '';
		var logs = data ? data.logs : '';

		var view = E('div', {}, [
			E('h2', {}, _('Snort IDS/IPS - Alerts')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Recent alerts (50 most recent)')),
				E('div', { 'style': 'margin-bottom:10px' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'style': 'margin-right:10px',
						'click': refreshAlerts
					}, _('Refresh')),
					E('button', {
						'class': 'cbi-button cbi-button-remove',
						'click': function() {
							if (!confirm(_('Clear all alerts? This cannot be undone.')))
								return;
							return callClearAlerts().then(function(result) {
								if (result && result.success) {
									ui.addNotification(null, E('p', {}, _('Alerts cleared')), 'info');
									refreshAlerts();
								} else {
									ui.addNotification(null, E('p', {}, result ? result.message : _('Error')), 'danger');
								}
							});
						}
					}, _('Clear all alerts'))
				]),
				E('div', {
					'id': 'alerts-box',
					'style': 'max-height:500px;overflow-y:auto'
				}, renderAlertTable(alerts))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Snort system logs (20 most recent)')),
				E('div', {
					'id': 'logs-box',
					'style': 'border-left:4px solid #007bff;padding:15px;margin:15px 0;border-radius:4px;font-family:monospace;max-height:400px;overflow-y:auto'
				}, renderLogLines(logs))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Log files')),
				E('div', { 'style': 'padding:10px' }, [
					E('ul', {}, [
						E('li', {}, [
							E('code', {}, '/var/log/alert_json.txt'),
							' - ' + _('JSON alerts (non-manual mode)')
						]),
						E('li', {}, [
							E('code', {}, '/var/log/alert_fast.txt'),
							' - ' + _('Fast alerts (manual mode)')
						])
					]),
					E('p', { 'style': 'margin-top:10px;opacity:0.7' }, [
						_('Detailed reports via SSH: '),
						E('code', {}, 'snort-mgr report -v')
					])
				])
			])
		]);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
