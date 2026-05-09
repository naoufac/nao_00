#!/bin/bash
# @reboot helper — ensures the 'anouf' tmux session exists after host boot.
# Naoufal can `tmux attach -t anouf` to find a fresh shell ready to run claude.
# Without sudo + linger, this is the cleanest way to survive reboots.

set -u
SOCK_DIR="/tmp/tmux-1001"  # naoclaw uid
mkdir -p "$SOCK_DIR" 2>/dev/null

if tmux -L default has-session -t anouf 2>/dev/null; then
  exit 0
fi

tmux -L default new-session -d -s anouf -c "$HOME/nao00"
tmux -L default send-keys -t anouf "echo '🪐 anouf tmux restored after reboot — run \`source /root/secrets/all-keys.env\` then \`claude --resume\` or start a fresh session'; date" C-m
echo "$(date -Iseconds) tmux session 'anouf' created" >> "$HOME/nao00/audit/tmux-restore.log"
