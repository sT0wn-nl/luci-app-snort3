#!/bin/sh
# LuCI Snort3 Module - Installation Script for OpenWrt 25
# Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
#
# This is free software, licensed under the GNU General Public License v2.
#
# Manual installation script for OpenWrt 25.x (JavaScript-based LuCI)
# Download and execute:
#   wget -O install.sh https://raw.githubusercontent.com/sT0wn-nl/luci-app-snort3/main/install.sh && sh install.sh

set -e

echo "================================================"
echo "LuCI Snort3 - OpenWrt 25 Installation"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check root privileges
if [ "$(id -u)" -ne 0 ]; then
	printf "${RED}ERROR: This script must be run as root${NC}\n"
	exit 1
fi

# Check Snort installation
if ! command -v snort >/dev/null 2>&1; then
	printf "${RED}ERROR: Snort3 is not installed${NC}\n"
	echo "Please install Snort3 first:"
	echo "  apk add snort3"
	exit 1
fi

# Get versions
SNORT_VERSION=$(snort -V 2>&1 | awk '/Version/ {for(i=1;i<=NF;i++) if($i~/[0-9]+\.[0-9]+/) {print $i; exit}}' || echo "Unknown")
echo "Detected Snort version: ${SNORT_VERSION}"

OPENWRT_VERSION=$(cat /etc/openwrt_release 2>/dev/null | grep DISTRIB_RELEASE | cut -d"'" -f2 || echo "Unknown")
echo "OpenWrt version: ${OPENWRT_VERSION}"
echo ""

# Determine base URL for downloading files
REPO_BASE="https://raw.githubusercontent.com/sT0wn-nl/luci-app-snort3/main"

echo "Installing rpcd backend..."
mkdir -p /usr/libexec/rpcd
wget -q -O /usr/libexec/rpcd/luci.snort3 "${REPO_BASE}/root/usr/libexec/rpcd/luci.snort3"
chmod +x /usr/libexec/rpcd/luci.snort3

echo "Installing ACL configuration..."
mkdir -p /usr/share/rpcd/acl.d
wget -q -O /usr/share/rpcd/acl.d/luci-app-snort3.json "${REPO_BASE}/root/usr/share/rpcd/acl.d/luci-app-snort3.json"

echo "Installing menu configuration..."
mkdir -p /usr/share/luci/menu.d
wget -q -O /usr/share/luci/menu.d/luci-app-snort3.json "${REPO_BASE}/root/usr/share/luci/menu.d/luci-app-snort3.json"

echo "Installing JavaScript views..."
mkdir -p /www/luci-static/resources/view/snort3
wget -q -O /www/luci-static/resources/view/snort3/config.js "${REPO_BASE}/htdocs/luci-static/resources/view/snort3/config.js"
wget -q -O /www/luci-static/resources/view/snort3/status.js "${REPO_BASE}/htdocs/luci-static/resources/view/snort3/status.js"
wget -q -O /www/luci-static/resources/view/snort3/alerts.js "${REPO_BASE}/htdocs/luci-static/resources/view/snort3/alerts.js"

echo "Configuring UCI defaults..."
if [ ! -f /etc/config/snort ]; then
	touch /etc/config/snort
	uci set snort.snort=snort
	uci set snort.snort.enabled='0'
	uci set snort.snort.manual='0'
	uci set snort.snort.interface='br-lan'
	uci set snort.snort.home_net='192.168.1.0/24'
	uci set snort.snort.external_net='any'
	uci set snort.snort.mode='ids'
	uci set snort.snort.method='pcap'
	uci set snort.snort.snaplen='1518'
	uci set snort.snort.logging='1'
	uci set snort.snort.log_dir='/var/log'
	uci set snort.snort.config_dir='/etc/snort'
	uci set snort.snort.temp_dir='/var/snort.d'
	uci set snort.snort.action='default'
	uci commit snort
	printf "${GREEN}UCI config created${NC}\n"
else
	echo "UCI config already exists, skipping"
fi

# Ensure local.lua exists with DAQ config (required for manual mode with --tweaks local)
if [ -d /etc/snort ] && [ ! -f /etc/snort/local.lua ]; then
	cat > /etc/snort/local.lua << 'LOCALEOF'
-- Local Snort3 configuration overrides
-- DAQ module path (required for manual mode)
daq = {
    module_dirs = { '/usr/lib/daq' }
}
LOCALEOF
	printf "${GREEN}Created /etc/snort/local.lua${NC}\n"
fi

# Ensure nfq chain_type is set to forward (snort-mgr only supports input by default)
if [ "$(uci -q get snort.nfq)" = "nfq" ]; then
	uci set snort.nfq.chain_type='forward'
	uci commit snort
fi

# Run snort-mgr setup for non-manual mode
MANUAL=$(uci -q get snort.snort.manual || echo "0")
if [ "$MANUAL" = "0" ] && command -v snort-mgr >/dev/null 2>&1; then
	echo "Running snort-mgr setup..."
	snort-mgr setup >/dev/null 2>&1 && \
		printf "${GREEN}snort-mgr setup completed${NC}\n" || \
		printf "${YELLOW}WARNING: snort-mgr setup failed. Check with 'snort-mgr check'${NC}\n"
fi

# Setup nft forward queue rules for IPS mode
MODE=$(uci -q get snort.snort.mode || echo "ids")
METHOD=$(uci -q get snort.snort.method || echo "pcap")
if [ "$MODE" = "ips" ] && [ "$METHOD" = "nfq" ]; then
	echo "Setting up NFQ forward chain for IPS mode..."
	QUEUE_START=$(uci -q get snort.nfq.queue_start || echo 4)
	QUEUE_COUNT=$(uci -q get snort.nfq.queue_count || echo 4)
	QUEUE_END=$((QUEUE_START + QUEUE_COUNT - 1))
	# Create nft rules
	nft list tables 2>/dev/null | grep -q 'inet snort' && nft delete table inet snort 2>/dev/null
	nft add table inet snort
	nft add chain inet snort forward_ips '{ type filter hook forward priority filter; policy accept; }'
	nft add rule inet snort forward_ips counter queue flags bypass to "${QUEUE_START}-${QUEUE_END}"
	# Make persistent
	mkdir -p /etc/nftables.d
	cat > /etc/nftables.d/snort-ips.nft << NFTEOF
table inet snort {
    chain forward_ips {
        type filter hook forward priority filter; policy accept;
        counter queue flags bypass to ${QUEUE_START}-${QUEUE_END}
    }
}
NFTEOF
	printf "${GREEN}NFQ forward chain created${NC}\n"
fi

# Setup rules symlink
if [ -d /var/snort.d/rules ]; then
	if [ -d /etc/snort/rules ] && [ ! -L /etc/snort/rules ]; then
		mv /etc/snort/rules /etc/snort/rules.backup
		echo "Old rules directory backed up"
	elif [ -L /etc/snort/rules ]; then
		rm /etc/snort/rules
	fi
	ln -sf /var/snort.d/rules /etc/snort/rules
	printf "${GREEN}Rules symlink created${NC}\n"
fi

echo ""
echo "Restarting rpcd..."
/etc/init.d/rpcd restart

echo ""
printf "${GREEN}================================================${NC}\n"
printf "${GREEN}Installation completed!${NC}\n"
printf "${GREEN}================================================${NC}\n"
echo ""
echo "Access the Snort3 interface at:"
echo "  Services > Snort IDS/IPS"
echo ""
echo "NOTE: You may need to clear your browser cache"
echo "or log out and back into LuCI."
