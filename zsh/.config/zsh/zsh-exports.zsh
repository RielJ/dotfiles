#!/bin/sh
HISTFILE="$XDG_DATA_HOME"/zsh/history
HISTSIZE=1000000
SAVEHIST=1000000
export PATH="$HOME/.local/bin":$PATH
export GOPATH="$HOME/go"
export PATH=$PATH:$GOPATH/bin
export MANPAGER='nvim +Man!'
export MANWIDTH=999
export PATH=$HOME/.cargo/bin:$PATH
export PATH=$HOME/.local/share/gem/ruby/3.0.0/bin:$PATH
export EDITOR=nvim
export LD_PRELOAD=/usr/lib/libv4l/v4l2convert.so
eval "$(zoxide init zsh)"
# eval "`pip completion --zsh`"

export MOZ_WEBRENDER=1
export MOZ_ENABLE_WAYLAND=1

export QT_AUTO_SCREEN_SCALE_FACTOR=1
export QT_QPA_PLATFORM=wayland
export QT_WAYLAND_DISABLE_WINDOWDECORATION=1
export WLR_NO_HARDWARE_CURSORS=1
export _JAVA_AWT_WM_NONREPARENTING=1

export XDG_CURRENT_DESKTOP=sway
# export XDG_CONFIG_HOME=/home/rielj/
export XDG_SESSION_TYPE=wayland
export GDK_BACKEND=wayland
export GBM_BACKEND=nvidia-drm
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export WLR_RENDERER=vulkan
export XWAYLAND_NO_GLAMOR=1
export LIBVA_DRIVER_NAME=nvidia
export __GL_VRR_ALLOWED=0
export __NV_PRIME_RENDER_OFFLOAD=1
export __NV_PRIME_RENDER_OFFLOAD_PROVIDER=NVIDIA-G0
export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __VK_LAYER_NV_optimus=NVIDIA_only
