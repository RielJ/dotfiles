#!/bin/sh
#
## Ensure system and Homebrew paths are available
if [[ -d /opt/homebrew/bin ]]; then
  export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
fi

export TMPDIR="$HOME/.tmp"
export PATH="$HOME/.local/bin":$PATH
export GOPATH="$HOME/go"
export PATH=$PATH:$GOPATH/bin
export MANPAGER='nvim +Man!'
export MANWIDTH=999
export PATH=$HOME/.cargo/bin:$PATH
export PATH=$HOME/.local/share/gem/ruby/3.0.0/bin:$PATH
export PATH=$HOME/.local/share/solana/install/active_release/bin:$PATH
export EDITOR=nvim
export VISUAL=nvim
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
