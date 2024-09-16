# # Created by Zap installer
# [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/zap/zap.zsh" ] && source "${XDG_DATA_HOME:-$HOME/.local/share}/zap/zap.zsh"
# plug "zsh-users/zsh-autosuggestions"
# plug "zap-zsh/supercharge"
# plug "zap-zsh/zap-prompt"
# plug "zsh-users/zsh-syntax-highlighting"

# # Load and initialise completion system
# autoload -Uz compinit
# compinit
#!/bin/sh
# some useful options (man zshoptions)
# [ -f "$HOME/.local/share/zap/zap.zsh" ] && source "$HOME/.local/share/zap/zap.zsh"
[ -f "${XDG_DATA_HOME:-$HOME/.local/share}/zap/zap.zsh" ] && source "${XDG_DATA_HOME:-$HOME/.local/share}/zap/zap.zsh"

# if [[ -z $DISPLAY && $TTY = /dev/tty1 ]]; then
#     export SDL_VIDEODRIVER=wayland
#     export _JAVA_AWT_WM_NONREPARENTING=1
#     export QT_QPA_PLATFORM=wayland
#     export XDG_CURRENT_DESKTOP=sway
#     export MOZ_ENABLE_WAYLAND=1
#     export XDG_SESSION_DESKTOP=sway
#     exec env XDG_CURRENT_DESKTOP=sway dbus-run-session sway
# fi

setopt autocd extendedglob nomatch menucomplete
setopt interactive_comments
stty stop undef		# Disable ctrl-s to freeze terminal.
zle_highlight=('paste:none')

# beeping is annoying
unsetopt BEEP

autoload -U up-line-or-beginning-search
autoload -U down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search

# Colors
autoload -Uz colors && colors
# export ZDOTDIR=~/.config/zsh

# Plugins
plug "zsh-users/zsh-autosuggestions"
plug "hlissner/zsh-autopair"
plug "greymd/docker-zsh-completion"
# plug "sroze/docker-compose-zsh-plugin"
# plug "zap-zsh/supercharge"
# plug "zap-zsh/zap-prompt"
plug "zap-zsh/fnm"
plug "zap-zsh/fzf"
plug "zap-zsh/exa"
plug "zsh-users/zsh-syntax-highlighting"


autoload -Uz compinit
zstyle ':completion:*' menu select
# zstyle ':completion::complete:lsof:*' menu yes select
zmodload zsh/complist
compinit

source <(kubectl completion zsh)

# Source
plug "$HOME/.config/zsh/zsh-aliases.zsh"
plug "$HOME/.config/zsh/zsh-exports.zsh"
plug "$HOME/.config/zsh/zsh-vim-mode.zsh"
plug "$HOME/.config/zsh/zsh-binds.zsh"
plug "$HOME/.config/zsh/zsh-prompt.zsh"


# Edit line in vim with ctrl-e:
autoload edit-command-line; zle -N edit-command-line
# bindkey '^e' edit-command-line

pfetch

# <<< fnm
eval "$(fnm env --use-on-cd)"
