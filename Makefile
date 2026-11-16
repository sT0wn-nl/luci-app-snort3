# SPDX-License-Identifier: Apache-2.0
#
# LuCI support for the Snort 3 IDS/IPS (OpenWrt package "snort3").

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-snort3
PKG_VERSION:=0.1
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=sT0wn-nl

LUCI_TITLE:=LuCI support for Snort 3 IDS/IPS
LUCI_DESCRIPTION:=Web interface for Snort 3: status, configuration, rule set and \
	category management, custom rules, tuning (suppressions, event and rate \
	filters), alert browser and statistics.
LUCI_DEPENDS:=+luci-base +snort3 +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-ubus
LUCI_PKGARCH:=all

define Package/luci-app-snort3/conffiles
/etc/snort/local.rules
endef

define Package/luci-app-snort3/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/usr/libexec/luci-snort/helper uninstall
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
