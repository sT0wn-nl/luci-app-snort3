'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callGetAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'getAlerts'
});

function renderAlertLines(text, className) {
	var lines = (text || '').split('\n').filter(function(l) { return l.trim() !== ''; });
	if (lines.length === 0) {
		return E('div', { 'style': 'text-align:center;opacity:0.5;padding:20px' },
			_('No alerts recorded'));
	}
	return E('div', {}, lines.map(function(line) {
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
					'style': 'border-left:4px solid #dc3545;padding:15px;margin:15px 0;border-radius:4px;font-family:monospace;font-size:0.9em;max-height:500px;overflow-y:auto'
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
							E('code', {}, '/var/log/alert_fast.txt'),
							' - ' + _('Fast alerts')
						]),
						E('li', {}, [
							E('code', {}, '/var/log/*alert_json.txt'),
							' - ' + _('Detailed JSON alerts')
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
