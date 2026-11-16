'use strict';
'require view';
'require form';
'require network';
'require uci';
'require tools.widgets as widgets';
'require snort.common as common';

/* IPv4 "a.b.c.d/nn" -> network address in CIDR notation */
function ipv4Network(cidr) {
	const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
	if (!m)
		return null;
	const bits = +m[5];
	const ip = ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0;
	const mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0;
	const net = (ip & mask) >>> 0;
	return '%d.%d.%d.%d/%d'.format(net >>> 24, (net >>> 16) & 255, (net >>> 8) & 255, net & 255, bits);
}

/* Snort accepts a single address/variable or a [list, of, them]. */
function validateNetList(section_id, value) {
	if (value == null || value === '')
		return _('Expecting a network, a list like [192.168.1.0/24, fd00::/64] or "any"');
	if (!/^[\][0-9A-Za-z:.\/!, $_]+$/.test(value))
		return _('Invalid characters; allowed are addresses, prefixes, "any", "!", "$VARIABLES", commas and brackets');
	if ((value.match(/\[/g) || []).length !== (value.match(/\]/g) || []).length)
		return _('Unbalanced brackets');
	return true;
}

return view.extend({
	load() {
		return Promise.all([
			network.getNetworks(),
			network.getWANNetworks(),
			common.callInfo(),
			uci.load('snort')
		]);
	},

	render([ nets, wans, info ]) {
		let m, s, o;

		/* Make sure the LuCI companion section exists, options use it via ucisection. */
		if (!uci.get('snort', 'luci'))
			uci.add('snort', 'luci', 'luci');

		m = new form.Map('snort', _('Snort IDS – Settings'),
			_('Configuration of the Snort 3 service. In <em>managed</em> mode the Snort configuration is generated from these settings by <code>snort-mgr</code>; in <em>manual</em> mode Snort runs your own <code>snort.lua</code>.'));

		s = m.section(form.NamedSection, 'snort', 'snort');
		s.addremove = false;

		s.tab('general', _('General'));
		s.tab('network', _('Networks'));
		s.tab('detection', _('Detection'));
		s.tab('inspection', _('Inspection'));
		s.tab('nfq', _('Inline (NFQ)'));
		s.tab('logging', _('Logging & storage'));
		s.tab('advanced', _('Advanced'));

		/* --- General -------------------------------------------------------- */

		o = s.taboption('general', form.Flag, 'enabled', _('Enable Snort'),
			_('Start Snort at boot and when the configuration is applied.'));
		o.rmempty = false;
		o.default = '0';

		o = s.taboption('general', form.ListValue, 'manual', _('Configuration mode'),
			_('<strong>Managed</strong>: LuCI generates the complete configuration, including custom rules and suppressions. <strong>Manual</strong>: only interface and configuration directory are used; you maintain <code>snort.lua</code> yourself (legacy behaviour).'));
		o.value('0', _('Managed by LuCI (recommended)'));
		o.value('1', _('Manual – use own snort.lua'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('general', widgets.DeviceSelect, 'interface', _('Interface'),
			_('Network device Snort listens on. For IDS this is usually the WAN device (%s). For afpacket inline mode enter a device pair like <code>eth0:eth1</code>.')
				.format(wans.map((w) => w.getL3Device()?.getName() ?? w.getIfname()).filter((n) => n).join(', ') || _('unknown')));
		o.noaliases = true;
		o.nobridges = false;
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'mode', _('Operation mode'),
			_('<strong>IDS</strong> only detects and logs. <strong>IPS</strong> runs inline and can drop traffic; this requires the NFQ (or afpacket) DAQ and the rules\' (or overridden) action.'));
		o.value('ids', _('IDS – passive detection'));
		o.value('ips', _('IPS – inline prevention'));
		o.default = 'ids';
		o.depends('manual', '0');

		/* --- Networks ------------------------------------------------------- */

		const subnets = [];
		nets.forEach((n) => {
			if (n.getName() === 'loopback' || wans.some((w) => w.getName() === n.getName()))
				return;
			(n.getIPAddrs() || []).forEach((a) => {
				const net = ipv4Network(a);
				if (net && subnets.indexOf(net) < 0)
					subnets.push(net);
			});
		});

		o = s.taboption('network', form.Value, 'home_net', _('Home network (HOME_NET)'),
			_('Address range(s) to protect, usually your LAN. Multiple ranges as a list in brackets, e.g. <code>[192.168.1.0/24, fd00::/64]</code>.'));
		subnets.forEach((n) => o.value(n));
		if (subnets.length > 1)
			o.value('[' + subnets.join(', ') + ']', _('All local networks: %s').format(subnets.join(', ')));
		o.value('any', _('any'));
		o.default = '192.168.1.0/24';
		o.validate = validateNetList;
		o.depends('manual', '0');

		o = s.taboption('network', form.Value, 'external_net', _('External network (EXTERNAL_NET)'),
			_('Addresses considered external. <code>any</code> is the safe default; <code>!$HOME_NET</code> ignores attacks between local hosts.'));
		o.value('any', _('any'));
		o.value('!$HOME_NET', _('!$HOME_NET – everything except the home network'));
		o.default = 'any';
		o.validate = validateNetList;
		o.depends('manual', '0');

		/* --- Detection ------------------------------------------------------ */

		o = s.taboption('detection', form.ListValue, 'method', _('Packet capture (DAQ)'),
			_('<strong>afpacket</strong>: fast, recommended for IDS. <strong>pcap</strong>: most compatible, but alerts may only be written in batches. <strong>nfq</strong>: netfilter queue, required for IPS; traffic is sent to Snort through nftables rules.'));
		o.value('afpacket', 'afpacket');
		o.value('pcap', 'pcap');
		o.value('nfq', _('nfq (netfilter queue)'));
		o.default = 'pcap';
		o.depends('manual', '0');
		o.validate = function(section_id, value) {
			const mode = this.section.formvalue(section_id, 'mode');
			if (mode === 'ips' && value === 'pcap')
				return _('IPS mode requires the nfq or afpacket DAQ');
			if (value && info.daq_modules?.length && info.daq_modules.indexOf(value) < 0)
				return _('DAQ module "%s" is not installed').format(value);
			return true;
		};

		o = s.taboption('detection', form.ListValue, 'action', _('Rule action override'),
			_('Override the action of every rule. <em>default</em> keeps the action defined in each rule. In IDS mode blocking actions are only logged (would_drop).'));
		o.value('default', _('default – use the rule\'s action'));
		o.value('alert', _('alert – only log'));
		o.value('block', _('block – drop packet and flow'));
		o.value('drop', _('drop – drop the packet'));
		o.value('reject', _('reject – drop and send reset/unreachable'));
		o.default = 'default';
		o.depends('manual', '0');

		o = s.taboption('detection', form.Value, 'snaplen', _('Snap length'),
			_('Maximum number of bytes captured per packet (1518 – 65535).'));
		o.datatype = 'range(1518,65535)';
		o.placeholder = '1518';
		o.default = '1518';
		o.depends('manual', '0');

		if (info.openappid) {
			o = s.taboption('detection', form.Flag, 'openappid', _('OpenAppID'),
				_('Enable application identification with the OpenAppID detectors.'));
			o.default = '0';
		}
		else {
			o = s.taboption('detection', form.DummyValue, '_openappid', _('OpenAppID'));
			o.rawhtml = true;
			o.default = _('Not available – install the <code>openappid</code> package for application identification.');
		}
		o.depends('manual', '0');

		/* --- NFQ (stored in section 'nfq') ---------------------------------- */

		const nfq = (type, name, title, descr) => {
			const opt = s.taboption('nfq', type, 'nfq_' + name, title, descr);
			opt.ucisection = 'nfq';
			opt.ucioption = name;
			opt.depends({ 'snort.snort.manual': '0', 'snort.snort.method': 'nfq' });
			return opt;
		};

		o = s.taboption('nfq', form.DummyValue, '_nfq_info');
		o.rawhtml = true;
		o.default = _('These settings are only used with the <strong>nfq</strong> DAQ. Snort creates an nftables table <code>inet snort</code> that sends packets to the queues below.');
		o.depends({ 'manual': '0', 'method': 'nfq' });

		o = nfq(form.ListValue, 'chain_type', _('Chain hook'),
			_('Where traffic is queued. <strong>forward</strong> inspects routed traffic between LAN and WAN, <strong>input</strong>/<strong>output</strong> only traffic to/from the router itself.'));
		[ 'forward', 'input', 'output', 'prerouting', 'postrouting' ].forEach((v) => o.value(v));
		o.default = 'input';

		o = nfq(form.ListValue, 'chain_priority', _('Chain priority'));
		o.value('raw', 'raw');
		o.value('filter', 'filter');
		o.value('300', '300');
		o.default = 'filter';

		o = nfq(form.Value, 'queue_start', _('First queue number'));
		o.datatype = 'range(1,32768)';
		o.default = '4';

		o = nfq(form.Value, 'queue_count', _('Number of queues'),
			_('Usually 2 – 8, one per packet thread.'));
		o.datatype = 'range(1,16)';
		o.default = '4';

		o = nfq(form.Value, 'queue_maxlen', _('Queue length'));
		o.datatype = 'range(1024,65536)';
		o.default = '1024';

		o = nfq(form.Value, 'thread_count', _('Packet threads'),
			_('0 = one per CPU core.'));
		o.datatype = 'range(0,32)';
		o.default = '0';

		o = nfq(form.ListValue, 'fanout_type', _('Fanout type'),
			_('Kernel load balancing over the queues.'));
		[ 'hash', 'lb', 'cpu', 'rollover', 'rnd', 'qm' ].forEach((v) => o.value(v));
		o.default = 'hash';

		o = nfq(form.Value, 'include', _('Extra nftables include'),
			_('Optional file with additional nftables statements inserted in the queue chain (e.g. to exclude traffic).'));
		o.datatype = 'file';
		o.optional = true;

		/* --- Logging & storage ---------------------------------------------- */

		o = s.taboption('logging', form.Flag, 'logging', _('Log alerts to file'),
			_('Write alerts as JSON to <code>alert_json.txt</code> in the log directory. Required for the Alerts page and statistics.'));
		o.default = '1';
		o.rmempty = false;
		o.depends('manual', '0');

		o = s.taboption('logging', form.Value, 'log_dir', _('Log directory'),
			_('The default <code>/var/log</code> is in RAM; alerts are lost on reboot. A directory on USB storage keeps them, but avoid the internal flash.'));
		o.datatype = 'directory';
		o.placeholder = '/var/log';
		o.default = '/var/log';
		o.depends('manual', '0');

		o = s.taboption('logging', form.Value, 'temp_dir', _('Working directory'),
			_('Generated configuration and downloaded rules (when not stored persistently).'));
		o.placeholder = '/var/snort.d';
		o.default = '/var/snort.d';
		o.depends('manual', '0');

		/* --- Advanced ------------------------------------------------------- */

		o = s.taboption('advanced', form.Value, 'config_dir', _('Configuration directory'),
			_('Location of <code>snort.lua</code>, <code>snort_defaults.lua</code> and the <code>rules</code> directory.'));
		o.datatype = 'directory';
		o.placeholder = '/etc/snort';
		o.default = '/etc/snort';

		o = s.taboption('advanced', form.Flag, '_restart_on_change', _('Restart on configuration change'),
			_('Snort\'s init script regenerates the configuration on changes but does not restart the running daemon. When enabled, LuCI restarts Snort after you apply changes (also for custom rules and suppressions).'));
		o.ucisection = 'luci';
		o.ucioption = 'restart_on_change';
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, '_user_include', _('Additional include'),
			_('Optional ucode template / Lua snippet appended to the generated <code>snort.lua</code> (after custom rules and suppressions). The variables <code>snort</code> and <code>nfq</code> are available.'));
		o.ucisection = 'luci';
		o.ucioption = 'user_include';
		o.datatype = 'file';
		o.optional = true;
		o.depends('snort.snort.manual', '0');

		/* Options stored in the 'luci' section (applied by include.uc) */
		const lo = (tab, type, name, title, descr) => {
			const opt = s.taboption(tab, type, '_l_' + name, title, descr);
			opt.ucisection = 'luci';
			opt.ucioption = name;
			opt.depends('snort.snort.manual', '0');
			return opt;
		};
		const ldep = (opt, key, val) => {
			opt.deps = [];
			opt.depends({ 'snort.snort.manual': '0', [ 'snort.snort._l_' + key ]: val });
		};

		/* --- Inspection ---------------------------------------------------- */

		o = lo('inspection', form.ListValue, 'policy', _('Detection policy'),
			_('Talos tuning profile applied on top of <code>snort.lua</code> (inspector depths, decompression, PCRE limits). <em>Connectivity</em> is fastest, <em>Max detect</em> finds most but is slowest and noisiest.'));
		o.value('', _('Default (snort.lua as is)'));
		o.value('connectivity', _('Connectivity – performance first'));
		o.value('balanced', _('Balanced – recommended'));
		o.value('security', _('Security – more inspection'));
		o.value('max_detect', _('Maximum detection – testing/lab'));

		o = lo('inspection', form.Flag, 'portscan', _('Port scan detection'),
			_('Detect TCP/UDP/ICMP port scans and sweeps (generator 122). Without this option Snort tracks scans but never reports them.'));
		o.default = '0';

		o = lo('inspection', form.ListValue, 'portscan_level', _('Port scan sensitivity'),
			_('<em>Low</em> only reports scans with negative responses (few false positives); <em>High</em> also catches slow scans but needs tuning.'));
		o.value('low', _('low'));
		o.value('med', _('medium'));
		o.value('hi', _('high'));
		o.default = 'med';
		ldep(o, 'portscan', '1');

		o = lo('inspection', form.DynamicList, 'portscan_ignore', _('Ignore scanners'),
			_('Hosts allowed to scan, e.g. your monitoring server or vulnerability scanner.'));
		o.datatype = 'or(ipaddr,cidr)';
		ldep(o, 'portscan', '1');

		o = lo('inspection', form.Flag, 'reputation', _('IP reputation (blocklist)'),
			_('Alert on (IDS) or block (IPS) traffic from/to listed addresses before any rule is evaluated (generator 136).'));
		o.default = '0';

		o = lo('inspection', form.DynamicList, 'reputation_block', _('Blocked addresses'));
		o.datatype = 'or(ipaddr,cidr)';
		ldep(o, 'reputation', '1');

		o = lo('inspection', form.Value, 'reputation_blocklist', _('Blocklist file'),
			_('Optional file with one address or prefix per line, e.g. a downloaded threat feed.'));
		o.datatype = 'file';
		ldep(o, 'reputation', '1');

		o = lo('inspection', form.DynamicList, 'reputation_allow', _('Trusted addresses'),
			_('Never blocked by reputation.'));
		o.datatype = 'or(ipaddr,cidr)';
		ldep(o, 'reputation', '1');

		o = lo('inspection', form.Flag, 'reputation_scan_local', _('Check private addresses'),
			_('Also apply the lists to RFC 1918 addresses.'));
		o.default = '0';
		ldep(o, 'reputation', '1');

		o = lo('inspection', form.Flag, 'builtin_rules', _('Decoder and inspector alerts'),
			_('Report all built-in events (malformed packets, protocol anomalies, stream issues, …). Useful for analysis, but can be very noisy.'));
		o.default = '0';

		/* --- Advanced (performance & logging) ------------------------------ */

		o = lo('advanced', form.Flag, 'perfmon', _('Performance monitoring'),
			_('Record throughput, packet drops and CPU usage (perf_monitor) for the Statistics page.'));
		o.default = '1';
		o.rmempty = false;

		o = lo('advanced', form.ListValue, 'perfmon_interval', _('Sample interval'));
		[ [ '30', _('30 seconds') ], [ '60', _('1 minute') ], [ '300', _('5 minutes') ] ].forEach((v) => o.value(v[0], v[1]));
		o.default = '60';
		ldep(o, 'perfmon', '1');

		o = lo('advanced', form.Value, 'alert_limit', _('Maximum alert log size'),
			_('In MB. When reached Snort starts a new file and only one older file is kept, so RAM usage stays bounded. 0 = unlimited.'));
		o.datatype = 'range(0,1024)';
		o.placeholder = '10';

		o = lo('advanced', form.Flag, 'checksum_eval', _('Verify checksums'),
			_('Disable when the router uses checksum offloading and Snort sees locally generated packets with invalid checksums (these are otherwise ignored).'));
		o.default = '1';
		o.rmempty = false;

		o = lo('advanced', form.Flag, 'latency_suspend', _('Suspend slow rules'),
			_('Temporarily disable rules that repeatedly exceed the time limit, protecting throughput on slow CPUs.'));
		o.default = '0';

		o = lo('advanced', form.Value, 'latency_rule_max', _('Rule time limit'),
			_('Microseconds per packet.'));
		o.datatype = 'range(50,1000000)';
		o.placeholder = '500';
		ldep(o, 'latency_suspend', '1');

		o = s.taboption('advanced', form.Button, '_show_config', _('Generated configuration'));
		o.inputtitle = _('Show snort.lua');
		o.inputstyle = 'neutral';
		o.onclick = () => common.showGenerated('snort');
		o.depends('manual', '0');

		return m.render();
	}
});
