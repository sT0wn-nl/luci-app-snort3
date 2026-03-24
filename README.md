# luci-app-snort3

LuCI web interface for managing **Snort3 IDS/IPS** on **OpenWrt 25**.

This is a modern JavaScript-based LuCI application that provides a full web GUI for configuring, monitoring, and controlling Snort3 on your OpenWrt router.

![OpenWrt 25](https://img.shields.io/badge/OpenWrt-25.12-blue)
![License](https://img.shields.io/badge/License-GPL--2.0-green)
![LuCI](https://img.shields.io/badge/LuCI-JavaScript-yellow)

## Features

- **Dashboard** with real-time service status, memory usage, and alert count
- **Configuration** for interface, mode (IDS/IPS), DAQ method, network ranges, logging, and more
- **Alert viewer** with recent alerts and system logs
- **Service controls** (start, stop, restart, enable/disable at boot)
- **Rules management** with background update, symlink repair, and Oinkcode support
- **Bilingual** (English and French)

## Requirements

- OpenWrt 25.12 or later
- Snort3 installed (`apk add snort3`)
- Snort3 DAQ module for your chosen method (`apk add snort3-daq-pcap` for PCAP, `snort3-daq-afpacket` for AF_PACKET, or `snort3-daq-nfq` for NFQ/IPS)
- LuCI web interface (`luci-base`)

## Installation

### Quick install (recommended)

SSH into your router and run:

```sh
wget -O /tmp/install.sh https://raw.githubusercontent.com/sT0wn-nl/luci-app-snort3/main/install.sh
sh /tmp/install.sh
```

The script will:
1. Install the rpcd backend, ACL, menu, and JavaScript view files
2. Create a default UCI configuration if none exists
3. Create `/etc/snort/local.lua` if missing (required by Snort3)
4. Install the required DAQ module (e.g. `snort3-daq-pcap`)
5. Set up the rules symlink if applicable
6. Restart rpcd

After installation, navigate to **Services > Snort IDS/IPS** in LuCI.

> **Tip:** Clear your browser cache or log out and back into LuCI if the menu doesn't appear immediately.

### Manual install

Copy the files to your router manually:

```sh
# rpcd backend
scp root/usr/libexec/rpcd/luci.snort3 root@router:/usr/libexec/rpcd/
ssh root@router chmod +x /usr/libexec/rpcd/luci.snort3

# ACL and menu
scp root/usr/share/rpcd/acl.d/luci-app-snort3.json root@router:/usr/share/rpcd/acl.d/
scp root/usr/share/luci/menu.d/luci-app-snort3.json root@router:/usr/share/luci/menu.d/

# JavaScript views
ssh root@router mkdir -p /www/luci-static/resources/view/snort3
scp htdocs/luci-static/resources/view/snort3/*.js root@router:/www/luci-static/resources/view/snort3/

# Restart rpcd
ssh root@router /etc/init.d/rpcd restart
```

### OpenWrt build system

To include this package in a custom OpenWrt firmware build:

1. Place this directory as `luci-app-snort3` inside the `applications/` folder of your LuCI feed
2. Update feeds and select the package:

```sh
./scripts/feeds update -a
./scripts/feeds install luci-app-snort3
make menuconfig  # Select LuCI > Applications > luci-app-snort3
make package/luci-app-snort3/compile
```

## Uninstall

```sh
wget -O /tmp/uninstall.sh https://raw.githubusercontent.com/sT0wn-nl/luci-app-snort3/main/uninstall.sh
sh /tmp/uninstall.sh
```

Or manually:

```sh
rm -f /usr/libexec/rpcd/luci.snort3
rm -f /usr/share/rpcd/acl.d/luci-app-snort3.json
rm -f /usr/share/luci/menu.d/luci-app-snort3.json
rm -rf /www/luci-static/resources/view/snort3
/etc/init.d/rpcd restart
```

## File structure

```
luci-app-snort3/
├── Makefile                                    # OpenWrt build system
├── htdocs/luci-static/resources/view/snort3/
│   ├── config.js                               # Configuration form + status widget
│   ├── status.js                               # Live status dashboard
│   └── alerts.js                               # Alert and log viewer
├── root/
│   ├── etc/uci-defaults/luci-app-snort3        # First-boot UCI defaults
│   ├── usr/libexec/rpcd/luci.snort3            # rpcd backend (shell)
│   └── usr/share/
│       ├── luci/menu.d/luci-app-snort3.json    # Navigation menu
│       └── rpcd/acl.d/luci-app-snort3.json     # Access control
├── po/
│   ├── en/snort3.po                            # English translations
│   └── fr/snort3.po                            # French translations
├── install.sh                                  # Quick install script
└── uninstall.sh                                # Uninstall script
```

## Architecture

This app uses the modern LuCI JavaScript framework (no Lua runtime required):

- **Frontend**: Client-side JavaScript views using `form.Map`, `rpc.declare`, and `poll.add` from the LuCI JS API
- **Backend**: Shell-based rpcd plugin (`luci.snort3`) exposing status, service control, alerts, and rules management via ubus
- **Config**: Standard UCI configuration (`/etc/config/snort`)

This means **no `luci-compat` or `luci-lua-runtime` dependency** — the app runs entirely in the browser with minimal router overhead.

## Troubleshooting

### `cannot open ./local.lua: No such file or directory`

Snort3's main config (`/etc/snort/snort.lua`) includes `local.lua` for local overrides. Create it if missing:

```sh
echo '-- Local Snort3 configuration overrides' > /etc/snort/local.lua
```

The install script creates this file automatically.

### `Could not find requested DAQ module: pcap`

The DAQ (Data Acquisition) module for your chosen packet capture method is not installed. Install the correct one:

```sh
apk add snort3-daq-pcap      # for PCAP (default)
apk add snort3-daq-afpacket  # for AF_PACKET
apk add snort3-daq-nfq       # for NFQ (IPS mode)
```

The install script detects your configured method and installs the matching DAQ module automatically.

### Menu not visible after installation

Clear your browser cache or log out and back into LuCI. You can also try a hard refresh (Ctrl+Shift+R).

## Credits

This project is a port of [dddavid51/luci-snort3-openwrt](https://github.com/dddavid51/luci-snort3-openwrt) to the modern JavaScript-based LuCI framework for OpenWrt 25. The original Lua/CBI source code and design were created by **David Dzieciol**.

## License

GNU General Public License v2.0 — see [LICENSE](LICENSE).
