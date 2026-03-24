'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require uci';

var callGetRulesInfo = rpc.declare({
	object: 'luci.snort3',
	method: 'getRulesInfo'
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

var callGetInterfaces = rpc.declare({
	object: 'luci.snort3',
	method: 'getInterfaces'
});

return view.extend({
	load: function() {
		return Promise.all([
			callGetRulesInfo(),
			callGetInterfaces()
		]);
	},

	render: function(data) {
		var rulesInfo = data[0];
		var ifaces = data[1] ? data[1].interfaces : [];

		var m, s, o;

		m = new form.Map('snort', _('Snort IDS/IPS - Configuration'),
			_('Snort is an open source intrusion detection and prevention system.'));

		/* General */
		s = m.section(form.TypedSection, 'snort', _('General'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable Snort'),
			_('Enable or disable Snort service'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Flag, 'manual', _('Manual mode'),
			_('Use manual configuration (snort.lua)'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.MultiValue, 'interface', _('Network interface'),
			_('Network interface(s) to monitor'));
		ifaces.forEach(function(iface) {
			o.value(iface, iface);
		});
		o.display_size = 5;

		o = s.option(form.Value, 'home_net', _('Local network'),
			_('IP address range to protect'));
		o.placeholder = '192.168.1.0/24';
		o.default = '192.168.1.0/24';

		o = s.option(form.Value, 'external_net', _('External network'),
			_('External IP address range'));
		o.placeholder = 'any';
		o.default = 'any';

		var modeOpt = s.option(form.ListValue, 'mode', _('Operating mode'),
			_('IDS = Detection only, IPS = Active prevention'));
		modeOpt.value('ids', 'IDS (' + _('Detection') + ')');
		modeOpt.value('ips', 'IPS (' + _('Prevention') + ')');
		modeOpt.default = 'ids';
		modeOpt.write = function(section_id, value) {
			uci.set('snort', section_id, 'mode', value);
			if (value === 'ips') {
				uci.set('snort', section_id, 'method', 'nfq');
			}
		};

		o = s.option(form.DummyValue, '_ips_warning');
		o.rawhtml = true;
		o.default = '<div style="padding:8px 12px;border-left:4px solid #ffc107;border-radius:3px;margin:4px 0">' +
			'<strong style="color:#ffc107">\u26A0 ' + _('IPS mode warning') + ':</strong> ' +
			_('IPS mode routes all traffic through Snort using NFQ. If Snort crashes, network connectivity may be lost. Keep SSH access available.') +
			'</div>';
		o.depends('mode', 'ips');

		var methodOpt = s.option(form.ListValue, 'method', _('DAQ method'),
			_('Packet acquisition method'));
		methodOpt.value('pcap', 'PCAP');
		methodOpt.value('afpacket', 'AF_PACKET');
		methodOpt.value('nfq', 'NFQ');
		methodOpt.default = 'pcap';
		methodOpt.depends('mode', 'ids');

		o = s.option(form.DummyValue, '_ips_method');
		o.rawhtml = true;
		o.default = '<em>' + _('DAQ method is automatically set to NFQ in IPS mode') + '</em>';
		o.depends('mode', 'ips');

		o = s.option(form.Value, 'snaplen', _('Capture length'),
			_('Maximum packet capture size'));
		o.placeholder = '1518';
		o.default = '1518';
		o.datatype = 'range(1518,65535)';

		/* Logging */
		s = m.section(form.TypedSection, 'snort', _('Logging'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'logging', _('Enable logging'),
			_('Enable event logging'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'log_dir', _('Log directory'));
		o.placeholder = '/var/log';
		o.default = '/var/log';

		o = s.option(form.Value, 'config_dir', _('Configuration directory'));
		o.placeholder = '/etc/snort';
		o.default = '/etc/snort';

		o = s.option(form.Value, 'temp_dir', _('Temporary directory'));
		o.placeholder = '/var/snort.d';
		o.default = '/var/snort.d';

		/* Rules */
		s = m.section(form.TypedSection, 'snort', _('Rules'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.DummyValue, '_rules_info', _('Rules location'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			if (rulesInfo && rulesInfo.symlink_active) {
				return '<span style="color:green">\u2713 ' + _('Active symbolic link') +
					': /etc/snort/rules \u2192 ' + rulesInfo.symlink_target + '</span>' +
					(rulesInfo.rule_count > 0 ? '<br><span style="opacity:0.7">' + _('Rule files:') + ' ' + rulesInfo.rule_count + '</span>' : '');
			} else if (rulesInfo && rulesInfo.rules_in_temp) {
				return '<span style="color:orange">\u26A0 ' + _('Rules are in') + ' /var/snort.d/rules</span>';
			}
			return '<span style="opacity:0.5">' + _('No rules directory found') + '</span>';
		};

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

		o = s.option(form.DummyValue, '_update_status', _('Update status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return '<div id="update-status"><em>' + _('Click "Update" to start the rules update') + '</em></div>';
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

		o = s.option(form.Button, '_update_rules', _('Update rules'));
		o.inputtitle = _('Update');
		o.inputstyle = 'apply';
		o.onclick = function() {
			return callUpdateRules().then(function(result) {
				if (result && result.success) {
					ui.addNotification(null, E('p', {}, _('Update launched in background.')), 'info');
					monitorUpdate();
				} else {
					ui.addNotification(null, E('p', {}, result ? result.message : _('Error')), 'danger');
				}
			});
		};

		var self = this;
		self._map = m;
		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this._map.save().then(function() {
			return ui.changes.apply(mode == '0');
		});
	},

	handleSave: function(ev) {
		return this._map.save();
	},

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
