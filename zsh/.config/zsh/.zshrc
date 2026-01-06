## Homebrew (Apple Silicon)
/opt/homebrew/bin/brew shellenv &>/dev/null && eval "$(/opt/homebrew/bin/brew shellenv)"

if [[ -d /opt/homebrew/bin ]]; then
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
  export TMPDIR="$HOME/.tmp"
fi

### Added by Zinit's installer
if [[ ! -f $HOME/.config/local/share/zinit/zinit.git/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "$HOME/.config/local/share/zinit" && command chmod g-rwX "$HOME/.config/local/share/zinit"
    command git clone https://github.com/zdharma-continuum/zinit "$HOME/.config/local/share/zinit/zinit.git" && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source "$HOME/.config/local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Load a few important annexes, without Turbo
# (this is currently required for annexes)
zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust


zinit light zdharma-continuum/fast-syntax-highlighting
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-syntax-highlighting
# zinit light Aloxaf/fzf-tab

# beeping is annoying
unsetopt BEEP

# Load and initialise completion system
autoload -Uz compinit
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
# zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
# zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'
zmodload zsh/complist
compinit


# Local plugins (sourced directly to avoid zinit caching)
source "$HOME/.config/zsh/zsh-exports.zsh"
source "$HOME/.config/zsh/zsh-aliases.zsh"
source "$HOME/.config/zsh/zsh-vim-mode.zsh"
source "$HOME/.config/zsh/zsh-binds.zsh"
source "$HOME/.config/zsh/zsh-prompt.zsh"

zinit cdreplay -q

# History
HISTFILE="$HOME/.config/zsh/.zsh_history"
HISTSIZE=1000000
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

setopt autocd extendedglob nomatch menucomplete
setopt interactive_comments
stty stop undef		# Disable ctrl-s to freeze terminal.
zle_highlight=('paste:none')

# Colors
autoload -Uz colors && colors

eval "$(zoxide init zsh)"
# Bind ctrl-r but not up arrow
eval "$(atuin init zsh --disable-up-arrow)"

pfetch

### End of Zinit's installer chunk
