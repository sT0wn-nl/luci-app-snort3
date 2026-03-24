# Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
# Licensed under GNU General Public License v2

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Support for Snort3 IDS/IPS
LUCI_DESCRIPTION:=Web interface for managing Snort3 intrusion detection and prevention system
LUCI_DEPENDS:=+luci-base +snort3

PKG_LICENSE:=GPL-2.0

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
