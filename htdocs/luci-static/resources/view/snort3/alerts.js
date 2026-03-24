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

var callDeleteAlerts = rpc.declare({
	object: 'luci.snort3',
	method: 'deleteAlerts',
	params: ['lines']
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

function buildDetailRow(a, color) {
	var details = [];

	if (a.gid || a.sid) {
		details.push(E('div', { 'style': 'margin-bottom:6px' }, [
			E('strong', {}, 'SID: '),
			E('code', {}, (a.gid || '1') + ':' + (a.sid || '-') + ':' + (a.rev || '0')),
			' ',
			a.sid ? E('a', {
				'href': 'https://snort.org/rule_docs/' + (a.gid || '1') + '-' + a.sid,
				'target': '_blank',
				'style': 'margin-left:8px'
			}, _('View rule on snort.org') + ' \u2197') : ''
		]));
	}

	var fields = [
		['pkt_num', _('Packet number')],
		['pkt_len', _('Packet length')],
		['pkt_gen', _('Generator')],
		['dir', _('Direction')]
	];

	var infoItems = [];
	fields.forEach(function(f) {
		if (a[f[0]] !== undefined) {
			infoItems.push(E('span', { 'style': 'margin-right:16px' }, [
				E('strong', {}, f[1] + ': '),
				E('code', {}, String(a[f[0]]))
			]));
		}
	});

	if (infoItems.length > 0) {
		details.push(E('div', { 'style': 'margin-bottom:6px' }, infoItems));
	}

	details.push(E('div', { 'style': 'margin-bottom:4px' }, [
		E('strong', {}, _('Source') + ': '),
		E('code', {}, a.src_addr + (a.src_port ? ':' + a.src_port : '')),
		E('strong', { 'style': 'margin-left:16px' }, _('Destination') + ': '),
		E('code', {}, a.dst_addr + (a.dst_port ? ':' + a.dst_port : ''))
	]));

	details.push(E('div', {}, [
		E('strong', {}, _('Message') + ': '),
		E('span', { 'style': 'color:' + color }, a.msg || '-')
	]));

	return E('tr', {
		'class': 'tr alert-detail-row',
		'style': 'display:none'
	}, [
		E('td', { 'class': 'td', 'colspan': '7',
			'style': 'padding:12px 16px;border-left:4px solid ' + color + ';font-size:0.9em'
		}, details)
	]);
}

function renderAlertTable(text, totalLines) {
	var lines = (text || '').split('\n').filter(function(l) { return l.trim() !== ''; });

	if (lines.length === 0) {
		return E('div', { 'style': 'text-align:center;opacity:0.5;padding:30px' },
			_('No alerts recorded'));
	}

	var displayed = lines.length;

	var selectAll = E('input', {
		'type': 'checkbox',
		'id': 'select-all',
		'click': function(ev) {
			var boxes = document.querySelectorAll('.alert-checkbox');
			for (var i = 0; i < boxes.length; i++) {
				boxes[i].checked = ev.target.checked;
			}
			updateDeleteBtn();
		}
	});

	var headerRow = E('tr', { 'class': 'tr table-titles' }, [
		E('th', { 'class': 'th', 'style': 'width:30px' }, selectAll),
		E('th', { 'class': 'th' }, _('Time')),
		E('th', { 'class': 'th' }, _('Action')),
		E('th', { 'class': 'th' }, _('Protocol')),
		E('th', { 'class': 'th' }, _('Source')),
		E('th', { 'class': 'th' }, _('Destination')),
		E('th', { 'class': 'th' }, _('Message'))
	]);

	var rows = [headerRow];

	lines.forEach(function(line, idx) {
		var fileLine = totalLines - idx;
		var a = parseAlertLine(line);

		if (a) {
			var color = actionColors[a.action] || '#6c757d';
			var src = a.src_addr + (a.src_port ? ':' + a.src_port : '');
			var dst = a.dst_addr + (a.dst_port ? ':' + a.dst_port : '');
			var detailId = 'detail-' + idx;

			var mainRow = E('tr', {
				'class': 'tr',
				'style': 'cursor:pointer',
				'data-detail': detailId,
				'click': function(ev) {
					if (ev.target.type === 'checkbox') return;
					var detail = document.getElementById(this.getAttribute('data-detail'));
					if (detail) {
						detail.style.display = detail.style.display === 'none' ? '' : 'none';
					}
				}
			}, [
				E('td', { 'class': 'td' },
					E('input', {
						'type': 'checkbox',
						'class': 'alert-checkbox',
						'data-line': String(fileLine),
						'click': function(ev) {
							ev.stopPropagation();
							updateDeleteBtn();
						}
					})),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap;font-size:0.85em' },
					a.timestamp || '-'),
				E('td', { 'class': 'td' },
					E('span', {
						'style': 'padding:2px 6px;border-radius:8px;font-size:0.8em;font-weight:bold;color:white;background:' + color
					}, (a.action || '-').toUpperCase())),
				E('td', { 'class': 'td' }, a.proto || '-'),
				E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:0.85em' }, src),
				E('td', { 'class': 'td', 'style': 'font-family:monospace;font-size:0.85em' }, dst),
				E('td', { 'class': 'td', 'style': 'font-weight:bold;color:' + color },
					[a.msg || '-', ' ', E('span', { 'style': 'opacity:0.4;font-weight:normal;font-size:0.8em' }, '\u25BC')])
			]);

			var detailRow = buildDetailRow(a, color);
			detailRow.id = detailId;

			rows.push(mainRow);
			rows.push(detailRow);
		} else {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' },
					E('input', {
						'type': 'checkbox',
						'class': 'alert-checkbox',
						'data-line': String(fileLine),
						'click': function(ev) {
							ev.stopPropagation();
							updateDeleteBtn();
						}
					})),
				E('td', { 'class': 'td', 'colspan': '6' }, line)
			]));
		}
	});

	return E('table', { 'class': 'table', 'id': 'alerts-table' }, rows);
}

function updateDeleteBtn() {
	var btn = document.getElementById('delete-selected-btn');
	if (!btn) return;
	var checked = document.querySelectorAll('.alert-checkbox:checked');
	btn.disabled = checked.length === 0;
	btn.textContent = checked.length > 0
		? _('Delete selected') + ' (' + checked.length + ')'
		: _('Delete selected');
}

function getSelectedLines() {
	var checked = document.querySelectorAll('.alert-checkbox:checked');
	var lines = [];
	for (var i = 0; i < checked.length; i++) {
		lines.push(checked[i].getAttribute('data-line'));
	}
	return lines.join(',');
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
			box.appendChild(renderAlertTable(data ? data.alerts : '', data ? data.total_lines : 0));
		}
		var logBox = document.getElementById('logs-box');
		if (logBox) {
			logBox.innerHTML = '';
			logBox.appendChild(renderLogLines(data ? data.logs : ''));
		}
		updateDeleteBtn();
	});
}

return view.extend({
	load: function() {
		return callGetAlerts();
	},

	render: function(data) {
		var alerts = data ? data.alerts : '';
		var logs = data ? data.logs : '';
		var totalLines = data ? data.total_lines : 0;

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
						'id': 'delete-selected-btn',
						'class': 'cbi-button cbi-button-remove',
						'style': 'margin-right:10px',
						'disabled': true,
						'click': function() {
							var lines = getSelectedLines();
							if (!lines) return;
							return callDeleteAlerts(lines).then(function(result) {
								if (result && result.success) {
									ui.addNotification(null, E('p', {}, _('Selected alerts deleted')), 'info');
									refreshAlerts();
								} else {
									ui.addNotification(null, E('p', {}, result ? result.message : _('Error')), 'danger');
								}
							});
						}
					}, _('Delete selected')),
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
					}, _('Clear all'))
				]),
				E('div', { 'style': 'opacity:0.6;font-size:0.85em;margin-bottom:10px' },
					_('Click on a row to expand alert details and view rule documentation.')),
				E('div', {
					'id': 'alerts-box',
					'style': 'max-height:600px;overflow-y:auto'
				}, renderAlertTable(alerts, totalLines))
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
