'use strict';
'require view';
'require form';
'require snort.common as common';

function validateIpList(section_id, value) {
	if (!value)
		return _('An address is required when tracking by source or destination');
	if (!/^[\][0-9A-Fa-f:.\/!, ]+$/.test(value))
		return _('Expecting an address, prefix or [list, of, addresses]');
	return true;
}

return view.extend({
	load() {
		return common.callStatus();
	},

	render(st) {
		let m, s, o;

		m = new form.Map('snort', _('Snort IDS – Tuning'),
			_('Reduce noise without editing the rule set. <strong>Suppressions</strong> silence a rule completely or for certain addresses (false positives). <strong>Event filters</strong> limit how often an alert is logged. <strong>Rate filters</strong> (IPS) switch a rule to another action when it fires too often, e.g. to block brute-force attempts. Rules that are not needed at all can be disabled on the Rules page.'));

		if (st.manual || st.luci_include === false) {
			s = m.section(form.NamedSection, 'snort', 'snort');
			s.render = () => E('div', {}, common.notices(st, 'suppress'));
		}

		s = m.section(form.GridSection, 'suppress', _('Suppression list'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add suppression');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.editable = true;
		o.rmempty = false;

		o = s.option(form.Value, 'gid', _('GID'), _('Generator ID, 1 for normal text rules.'));
		o.datatype = 'range(0,8129)';
		o.placeholder = '1';
		o.default = '1';
		o.width = '6em';

		o = s.option(form.Value, 'sid', _('SID'), _('Signature ID of the rule.'));
		o.datatype = 'uinteger';
		o.rmempty = false;
		o.width = '8em';
		o.textvalue = function(section_id) {
			const sid = this.cfgvalue(section_id);
			const gid = this.section.cfgvalue(section_id, 'gid') ?? this.map.data.get('snort', section_id, 'gid') ?? 1;
			return sid ? common.ruleLink(gid, sid) : '-';
		};

		o = s.option(form.ListValue, 'track', _('Scope'));
		o.value('', _('all traffic'));
		o.value('by_src', _('only from source address'));
		o.value('by_dst', _('only to destination address'));
		o.textvalue = function(section_id) {
			const v = this.cfgvalue(section_id) ?? '';
			const ip = this.map.data.get('snort', section_id, 'ip');
			if (v === 'by_src') return _('source %s').format(ip ?? '?');
			if (v === 'by_dst') return _('destination %s').format(ip ?? '?');
			return _('all traffic');
		};

		o = s.option(form.Value, 'ip', _('Address'), _('IP address, prefix or a list like [10.0.0.1, 10.0.0.2].'));
		o.depends('track', 'by_src');
		o.depends('track', 'by_dst');
		o.validate = validateIpList;
		o.modalonly = true;

		o = s.option(form.Value, 'comment', _('Comment'));
		o.placeholder = _('e.g. rule message or reason');

		/* --- Event filters (thresholds) --------------------------------------- */
		s = m.section(form.GridSection, 'event_filter', _('Event filters'),
			_('<em>limit</em>: log at most <em>count</em> alerts per interval · <em>threshold</em>: log every <em>count</em>-th alert · <em>both</em>: log once per interval after <em>count</em> alerts. The rule is still evaluated (and can still block in IPS mode).'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add event filter');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.editable = true;
		o.rmempty = false;

		o = s.option(form.Value, 'gid', _('GID'));
		o.datatype = 'range(0,8129)';
		o.placeholder = '1';
		o.default = '1';
		o.width = '5em';

		o = s.option(form.Value, 'sid', _('SID'), _('0 applies the filter to all rules of the generator.'));
		o.datatype = 'uinteger';
		o.rmempty = false;
		o.width = '7em';

		o = s.option(form.ListValue, 'type', _('Type'));
		o.value('limit', _('limit'));
		o.value('threshold', _('threshold'));
		o.value('both', _('both'));
		o.default = 'limit';

		o = s.option(form.ListValue, 'track', _('Count per'));
		o.value('by_src', _('source address'));
		o.value('by_dst', _('destination address'));
		o.default = 'by_src';

		o = s.option(form.Value, 'count', _('Count'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.width = '5em';

		o = s.option(form.Value, 'seconds', _('Interval (s)'));
		o.datatype = 'uinteger';
		o.default = '60';
		o.width = '6em';

		o = s.option(form.Value, 'ip', _('Only for address'));
		o.validate = (sid, v) => !v || validateIpList(sid, v);
		o.modalonly = true;

		o = s.option(form.Value, 'comment', _('Comment'));

		/* --- Rate filters (IPS) ------------------------------------------------- */
		s = m.section(form.GridSection, 'rate_filter', _('Rate filters'),
			_('When a rule fires more than <em>count</em> times within the interval, use the new action for the timeout period. Blocking actions only have effect in IPS mode.'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add rate filter');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.editable = true;
		o.rmempty = false;

		o = s.option(form.Value, 'gid', _('GID'));
		o.datatype = 'range(0,8129)';
		o.placeholder = '1';
		o.default = '1';
		o.width = '5em';

		o = s.option(form.Value, 'sid', _('SID'));
		o.datatype = 'uinteger';
		o.rmempty = false;
		o.width = '7em';

		o = s.option(form.ListValue, 'track', _('Count per'));
		o.value('by_src', _('source address'));
		o.value('by_dst', _('destination address'));
		o.value('by_rule', _('rule'));
		o.default = 'by_src';

		o = s.option(form.Value, 'count', _('Count'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.width = '5em';

		o = s.option(form.Value, 'seconds', _('Interval (s)'));
		o.datatype = 'uinteger';
		o.default = '60';
		o.width = '6em';

		o = s.option(form.ListValue, 'new_action', _('New action'));
		[ 'drop', 'block', 'reject', 'alert', 'log', 'pass' ].forEach((a) => o.value(a, a));
		o.default = 'drop';

		o = s.option(form.Value, 'timeout', _('Timeout (s)'));
		o.datatype = 'uinteger';
		o.default = '300';
		o.width = '6em';

		o = s.option(form.Value, 'apply_to', _('Only for address'));
		o.validate = (sid, v) => !v || validateIpList(sid, v);
		o.modalonly = true;

		o = s.option(form.Value, 'comment', _('Comment'));

		return m.render();
	}
});
