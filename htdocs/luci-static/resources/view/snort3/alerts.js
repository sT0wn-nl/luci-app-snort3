'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callGetAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'getAlerts'
});

var actionColors = {
	'allow': '#17a2b8',
	'alert': '#ffc107',
	'drop': '#dc3545',
	'block': '#dc3545',
	'reject': '#dc3545',
	'log': '#6c757d'
};

function formatJsonAlert(line) {
	try {
		var a = JSON.parse(line);
		var color = actionColors[a.action] || '#6c757d';
		var addr = a.src_addr + (a.src_port ? ':' + a.src_port : '') +
			' \u2192 ' + a.dst_addr + (a.dst_port ? ':' + a.dst_port : '');

		return E('div', {
			'style': 'padding:10px;margin:6px 0;border-left:4px solid ' + color + ';border-radius:3px'
		}, [
			E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px' }, [
				E('strong', { 'style': 'color:' + color }, a.msg || 'Unknown'),
				E('span', {
					'style': 'padding:2px 8px;border-radius:10px;font-size:0.8em;font-weight:bold;color:white;background:' + color
				}, (a.action || 'N/A').toUpperCase())
			]),
			E('div', { 'style': 'font-size:0.85em;opacity:0.8;margin-top:4px' }, [
				E('span', {}, a.timestamp || ''),
				E('span', { 'style': 'margin:0 8px' }, '|'),
				E('span', {}, a.proto || ''),
				E('span', { 'style': 'margin:0 8px' }, '|'),
				E('span', {}, addr),
				a.sid ? E('span', { 'style': 'margin-left:8px;opacity:0.6' }, '[SID:' + a.gid + ':' + a.sid + ':' + a.rev + ']') : ''
			])
		]);
	} catch(e) {
		return null;
	}
}

function renderAlertLines(text, className) {
	var lines = (text || '').split('\n').filter(function(l) { return l.trim() !== ''; });
	if (lines.length === 0) {
		return E('div', { 'style': 'text-align:center;opacity:0.5;padding:20px' },
			_('No alerts recorded'));
	}

	return E('div', {}, lines.map(function(line) {
		var jsonEl = formatJsonAlert(line);
		if (jsonEl) return jsonEl;

		return E('div', {
			'class': className,
			'style': 'padding:5px 0;border-bottom:1px solid currentColor;opacity:0.8;word-wrap:break-word'
		}, line);
	}));
}

return view.extend({
	load: function() {
		return callGetAlerts();
	},

	render: function(data) {
		var alerts = data ? data.alerts : '';
		var logs = data ? data.logs : '';

		var view = E('div', {}, [
			E('h2', {}, _('Snort - Alerts and Logs')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Recent alerts (50 most recent)')),
				E('div', {
					'id': 'alerts-box',
					'style': 'padding:10px;margin:15px 0;border-radius:4px;max-height:500px;overflow-y:auto'
				}, renderAlertLines(alerts, 'alert-line')),
				E('div', { 'style': 'text-align:right;margin-top:10px' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'click': function() {
							return callGetAlerts().then(function(newData) {
								var box = document.getElementById('alerts-box');
								if (box) {
									box.innerHTML = '';
									box.appendChild(renderAlertLines(newData ? newData.alerts : '', 'alert-line'));
								}
								var logBox = document.getElementById('logs-box');
								if (logBox) {
									logBox.innerHTML = '';
									logBox.appendChild(renderAlertLines(newData ? newData.logs : '', 'log-line'));
								}
							});
						}
					}, _('Refresh'))
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Snort system logs (20 most recent)')),
				E('div', {
					'id': 'logs-box',
					'style': 'border-left:4px solid #007bff;padding:15px;margin:15px 0;border-radius:4px;font-family:monospace;font-size:0.9em;max-height:400px;overflow-y:auto'
				}, renderAlertLines(logs, 'log-line'))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Actions')),
				E('div', { 'style': 'padding:10px' }, [
					E('p', {}, _('View detailed reports via SSH with the command:')),
					E('pre', {
						'style': 'padding:10px;border-radius:4px'
					}, 'snort-mgr report -v (requires coreutils-sort package)'),
					E('p', { 'style': 'margin-top:15px' }, _('Log files:')),
					E('ul', {}, [
						E('li', {}, [
							E('code', {}, '/var/log/alert_json.txt'),
							' - ' + _('JSON alerts (non-manual mode)')
						]),
						E('li', {}, [
							E('code', {}, '/var/log/alert_fast.txt'),
							' - ' + _('Fast alerts (manual mode)')
						])
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
