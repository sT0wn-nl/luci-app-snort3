#!/bin/sh
# LuCI Snort3 Module - Uninstall Script for OpenWrt 25
# Removes all files installed by install.sh

set -e

echo "Removing LuCI Snort3 module..."

rm -f /usr/libexec/rpcd/luci.snort3
rm -f /usr/share/rpcd/acl.d/luci-app-snort3.json
rm -f /usr/share/luci/menu.d/luci-app-snort3.json
rm -rf /www/luci-static/resources/view/snort3

echo "Restarting rpcd..."
/etc/init.d/rpcd restart

echo "Done. UCI config (/etc/config/snort) was preserved."
echo "Remove it manually if no longer needed: rm /etc/config/snort"
