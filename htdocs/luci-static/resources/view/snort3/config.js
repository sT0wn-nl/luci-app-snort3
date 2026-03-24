'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require poll';

var callGetStatus = rpc.declare({
	object: 'luci.snort3',
	method: 'getStatus'
});

var callUpdateRules = rpc.declare({
	object: 'luci.snort3',
	method: 'updateRules'
});

var callCheckUpdateStatus = rpc.declare({
	object: 'luci.snort3',
	method: 'checkUpdateStatus'
});

var callCleanupTemp = rpc.declare({
	object: 'luci.snort3',
	method: 'cleanupTemp'
});

var callFixRules = rpc.declare({
	object: 'luci.snort3',
	method: 'fixRules'
});

var callGetRulesInfo = rpc.declare({
	object: 'luci.snort3',
	method: 'getRulesInfo'
});

var callServiceAction = rpc.declare({
	object: 'luci.snort3',
	method: 'serviceAction',
	params: ['action']
});

var callGetRecentAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'getRecentAlerts'
});

function renderStatusSection(status, rulesInfo, recentAlerts) {
	var isRunning = status ? status.running : false;

	var statusTable = E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'width:30%;font-weight:bold' }, _('Status') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-status' },
				isRunning
					? E('span', { 'style': 'color:green;font-weight:bold' }, '\u25CF ' + _('Running'))
					: E('span', { 'style': 'color:red;font-weight:bold' }, '\u25CF ' + _('Stopped'))
			)
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, 'PID:'),
			E('td', { 'class': 'td', 'id': 'snort-pid' }, status ? (status.pid || 'N/A') : '-')
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('Snort memory') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-mem' }, status ? (status.mem_usage || 'N/A') : '-')
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('System memory') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-sysmem' }, status
				? E('span', {
					'style': 'color:' + (status.mem_percent > 80 ? 'red' : (status.mem_percent > 60 ? 'orange' : 'green'))
				}, status.mem_used + ' MB / ' + status.mem_total + ' MB (' + status.mem_percent + '%)')
				: '-'
			)
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('Total alerts') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-alerts' }, status ? String(status.alert_count) : '-')
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('Interface') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-interface' }, status ? status.interface : '-')
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('Mode') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-mode' }, status ? status.mode.toUpperCase() : '-')
		]),
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'font-weight:bold' }, _('DAQ method') + ':'),
			E('td', { 'class': 'td', 'id': 'snort-method' }, status ? status.method.toUpperCase() : '-')
		])
	]);

	var controlButtons = E('div', { 'class': 'cbi-section', 'style': 'padding:10px 0' }, [
		E('button', {
			'class': 'cbi-button cbi-button-apply',
			'style': 'margin:5px',
			'click': function() { return doServiceAction('start'); }
		}, '\u25B6 ' + _('Start')),
		E('button', {
			'class': 'cbi-button cbi-button-reset',
			'style': 'margin:5px',
			'click': function() { return doServiceAction('stop'); }
		}, '\u25A0 ' + _('Stop')),
		E('button', {
			'class': 'cbi-button cbi-button-action',
			'style': 'margin:5px',
			'click': function() { return doServiceAction('restart'); }
		}, '\u21BB ' + _('Restart')),
		E('button', {
			'class': 'cbi-button cbi-button-save',
			'style': 'margin:5px',
			'click': function() { return doServiceAction('enable'); }
		}, _('Enable at boot')),
		E('button', {
			'class': 'cbi-button cbi-button-remove',
			'style': 'margin:5px',
			'click': function() { return doServiceAction('disable'); }
		}, _('Disable at boot'))
	]);

	var alertCount = recentAlerts ? recentAlerts.count : 0;
	var alertText = recentAlerts && recentAlerts.alerts ? recentAlerts.alerts : '';
	var alertLines = alertText ? alertText.split('\n').filter(function(l) { return l.trim() !== ''; }) : [];

	var alertItems = [];
	if (alertLines.length === 0) {
		alertItems.push(E('div', {
			'style': 'text-align:center;color:#4caf50;padding:20px;font-weight:bold'
		}, '\u2713 ' + _('No recent alerts - Your network is secure')));
	} else {
		alertLines.forEach(function(line) {
			alertItems.push(E('div', {
				'style': 'padding:8px;margin:5px 0;background:white;border-left:3px solid #dc3545;border-radius:3px'
			}, E('div', { 'style': 'color:#d32f2f;font-weight:bold;margin:5px 0' }, line)));
		});
	}

	var recentAlertsSection = E('div', {}, [
		E('div', { 'style': 'margin:10px 0' }, [
			E('strong', {}, _('Detected alerts') + ': '),
			E('span', {
				'id': 'alert-count-badge',
				'style': 'background:#dc3545;color:white;padding:2px 8px;border-radius:10px;font-size:0.9em;margin-left:10px'
			}, String(alertCount)),
			E('a', {
				'href': L.url('admin/services/snort3/alerts'),
				'class': 'cbi-button cbi-button-apply',
				'style': 'float:right;margin-left:10px;color:white'
			}, _('View all alerts'))
		]),
		E('div', {
			'id': 'recent-alerts-box',
			'style': 'background:#f8f9fa;border-left:4px solid #dc3545;padding:15px;margin:10px 0;border-radius:5px;font-family:monospace;font-size:0.85em;max-height:300px;overflow-y:auto'
		}, alertItems)
	]);

	return E('div', {}, [
		E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Service Status')),
			statusTable,
			controlButtons,
		]),
		E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Recent Alerts')),
			recentAlertsSection
		])
	]);
}

function doServiceAction(action) {
	return callServiceAction(action).then(function(result) {
		if (result && result.success) {
			ui.addNotification(null, E('p', {}, result.message), 'info');
		} else {
			ui.addNotification(null, E('p', {}, _('Error') + ': ' + (result ? result.message : '')), 'danger');
		}
		return callGetStatus().then(updateStatusDisplay);
	});
}

function updateStatusDisplay(status) {
	var el;

	el = document.getElementById('snort-status');
	if (el) {
		el.innerHTML = '';
		el.appendChild(
			status.running
				? E('span', { 'style': 'color:green;font-weight:bold' }, '\u25CF ' + _('Running'))
				: E('span', { 'style': 'color:red;font-weight:bold' }, '\u25CF ' + _('Stopped'))
		);
	}

	el = document.getElementById('snort-pid');
	if (el) el.textContent = status.pid || 'N/A';

	el = document.getElementById('snort-mem');
	if (el) el.textContent = status.mem_usage || 'N/A';

	el = document.getElementById('snort-sysmem');
	if (el) {
		el.innerHTML = '';
		var c = status.mem_percent > 80 ? 'red' : (status.mem_percent > 60 ? 'orange' : 'green');
		el.appendChild(E('span', { 'style': 'color:' + c },
			status.mem_used + ' MB / ' + status.mem_total + ' MB (' + status.mem_percent + '%)'));
	}

	el = document.getElementById('snort-alerts');
	if (el) el.textContent = String(status.alert_count);

	el = document.getElementById('snort-interface');
	if (el) el.textContent = status.interface;

	el = document.getElementById('snort-mode');
	if (el) el.textContent = status.mode.toUpperCase();

	el = document.getElementById('snort-method');
	if (el) el.textContent = status.method.toUpperCase();
}

return view.extend({
	load: function() {
		return Promise.all([
			callGetStatus(),
			callGetRulesInfo(),
			callGetRecentAlerts()
		]);
	},

	render: function(data) {
		var status = data[0];
		var rulesInfo = data[1];
		var recentAlerts = data[2];

		var statusSection = renderStatusSection(status, rulesInfo, recentAlerts);

		/* Configuration form (replaces CBI model) */
		var m, s, o;

		m = new form.Map('snort', _('Snort IDS/IPS'),
			_('Snort is an open source intrusion detection and prevention system.'));

		/* General configuration */
		s = m.section(form.TypedSection, 'snort', _('Configuration'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable Snort'),
			_('Enable or disable Snort service'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Flag, 'manual', _('Manual mode'),
			_('Use manual configuration (snort.lua)'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'interface', _('Network interface'),
			_('Network interface to monitor (e.g. br-lan, eth0)'));
		o.placeholder = 'br-lan';
		o.datatype = 'string';

		o = s.option(form.Value, 'home_net', _('Local network'),
			_('IP address range to protect'));
		o.placeholder = '192.168.1.0/24';
		o.default = '192.168.1.0/24';
		o.datatype = 'string';

		o = s.option(form.Value, 'external_net', _('External network'),
			_('External IP address range'));
		o.placeholder = 'any';
		o.default = 'any';
		o.datatype = 'string';

		o = s.option(form.ListValue, 'mode', _('Operating mode'),
			_('IDS = Detection only, IPS = Active prevention'));
		o.value('ids', 'IDS (' + _('Detection') + ')');
		o.value('ips', 'IPS (' + _('Prevention') + ')');
		o.default = 'ids';

		o = s.option(form.ListValue, 'method', _('DAQ method'),
			_('Packet acquisition method'));
		o.value('pcap', 'PCAP (' + _('Recommended') + ')');
		o.value('afpacket', 'AF_PACKET');
		o.value('nfq', 'NFQ (' + _('for IPS') + ')');
		o.default = 'pcap';

		o = s.option(form.Value, 'snaplen', _('Capture Length'),
			_('Maximum packet capture size'));
		o.placeholder = '1518';
		o.default = '1518';
		o.datatype = 'range(1518,65535)';

		/* Logging configuration */
		s = m.section(form.TypedSection, 'snort', _('Logging configuration'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'logging', _('Enable logging'),
			_('Enable event logging'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'log_dir', _('Log directory'),
			_('Path where logs will be stored'));
		o.placeholder = '/var/log';
		o.default = '/var/log';

		o = s.option(form.Value, 'config_dir', _('Configuration directory'),
			_('Snort configuration directory path'));
		o.placeholder = '/etc/snort';
		o.default = '/etc/snort';

		o = s.option(form.Value, 'temp_dir', _('Temporary directory'),
			_('Directory for temporary files and downloaded rules'));
		o.placeholder = '/var/snort.d';
		o.default = '/var/snort.d';

		/* Rules management */
		s = m.section(form.TypedSection, 'snort', _('Rules management'));
		s.anonymous = true;
		s.addremove = false;

		/* Rules info display */
		o = s.option(form.DummyValue, '_rules_info', _('Rules location'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			if (rulesInfo && rulesInfo.symlink_active) {
				return '<span style="color:green">\u2713 ' + _('Active symbolic link') + ': /etc/snort/rules \u2192 ' + rulesInfo.symlink_target + '</span>' +
					(rulesInfo.rule_count > 0 ? '<br><span style="color:#666">' + _('Rule files:') + ' ' + rulesInfo.rule_count + '</span>' : '');
			} else if (rulesInfo && rulesInfo.rules_in_temp) {
				return '<span style="color:orange">\u26A0 ' + _('Rules are in') + ' /var/snort.d/rules</span>';
			} else {
				return '<span style="color:#999">' + _('No rules directory found') + '</span>';
			}
		};

		/* Fix rules button */
		if (rulesInfo && rulesInfo.rules_in_temp && !rulesInfo.symlink_active) {
			o = s.option(form.Button, '_fix_rules', _('Create symbolic link'));
			o.inputtitle = _('Create symbolic link');
			o.inputstyle = 'apply';
			o.onclick = function() {
				return callFixRules().then(function(result) {
					if (result && result.success) {
						ui.addNotification(null, E('p', {}, _('Symbolic link created successfully!')), 'info');
						window.location.reload();
					} else {
						ui.addNotification(null, E('p', {}, _('Error creating symbolic link')), 'danger');
					}
				});
			};
		}

		/* Update status display */
		o = s.option(form.DummyValue, '_update_status', _('Update status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return '<div id="update-status"><em>' + _('Click on "Update" to start the rules update') + '</em></div>';
		};

		o = s.option(form.Value, 'oinkcode', _('Oinkcode'),
			_('Access code to download official Snort rules (optional)'));
		o.password = true;
		o.placeholder = _('Enter your Oinkcode if you have one');

		o = s.option(form.ListValue, 'action', _('Rule action'),
			_('Default action for rules'));
		o.value('default', _('Default'));
		o.value('alert', _('Alert'));
		o.value('block', _('Block'));
		o.value('drop', _('Drop'));
		o.value('reject', _('Reject'));
		o.default = 'default';

		/* Update rules button */
		o = s.option(form.Button, '_update_rules', _('Update rules'));
		o.inputtitle = _('Update');
		o.inputstyle = 'apply';
		o.onclick = function() {
			return callUpdateRules().then(function(result) {
				if (result && result.success) {
					ui.addNotification(null, E('p', {}, _('Update launched in background. Monitoring starts automatically.')), 'info');
					monitorUpdate();
				} else {
					ui.addNotification(null, E('p', {}, result ? result.message : _('Error')), 'danger');
				}
			});
		};

		return m.render().then(function(formEl) {
			/* Start polling for status updates */
			poll.add(function() {
				return callGetStatus().then(updateStatusDisplay);
			}, 5);

			return E('div', {}, [statusSection, formEl]);
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

function monitorUpdate() {
	var statusDiv = document.getElementById('update-status');
	if (!statusDiv) return;

	var interval = setInterval(function() {
		callCheckUpdateStatus().then(function(result) {
			if (result.running) {
				statusDiv.innerHTML = '<span style="color:orange">\u26A0 ' + _('Update in progress...') + '</span>';
			} else if (result.finished) {
				statusDiv.innerHTML = '<span style="color:green">\u2713 ' + _('Update completed!') + '</span>';
				clearInterval(interval);
				callCleanupTemp();
			}
		});
	}, 3000);
}
