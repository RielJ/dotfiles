#!/bin/sh
alias j='z'
alias f='zi'
alias zsh-update-plugins="find "$ZDOTDIR/plugins" -type d -exec test -e '{}/.git' ';' -print0 | xargs -I {} -0 git -C {} pull -q"

# get fastest mirrors
# alias mirror="sudo reflector -f 30 -l 30 --number 10 --verbose --save /etc/pacman.d/mirrorlist"
# alias mirrord="sudo reflector --latest 50 --number 20 --sort delay --save /etc/pacman.d/mirrorlist"
# alias mirrors="sudo reflector --latest 50 --number 20 --sort score --save /etc/pacman.d/mirrorlist"
# alias mirrora="sudo reflector --latest 50 --number 20 --sort age --save /etc/pacman.d/mirrorlist"

# Colorize grep output (good for log files)
alias grep='grep --color=auto'
alias egrep='egrep --color=auto'
alias fgrep='fgrep --color=auto'
alias hotspot_lock='sudo rm /tmp/create_ap.all.lock'
alias hotspot='sudo create_ap --daemon wlp3s0 enp2s0 PLDTHOMEFIBR21a25 RielJ213'
alias unbt='sudo rfkill unblock bluetooth && bluetoothctl'
alias useconda='export PATH=$HOME/.miniconda/bin:$PATH'

# GIT
alias glog='git log --oneline --decorate --graph --all'
# format:%C(yellow)%h %Cblue%>(12)%ad %Cgreen%<(7)%aN%Cred%d %Creset%s
# glog --pretty=format:"%C(yellow)%h %Cblue%>(12)%ad %Cgreen%<(7)%aN%Cred%d %Creset%s" --date=short
alias glogp='git log --oneline --decorate --graph --all --pretty=format:"%C(yellow)%h %Cblue%>(12)%ad %Cgreen%<(7)%aN%Cred%d %Creset%s" --date=short'
alias gspp='git stash && git pull --rebase && git stash pop'

# confirm before overwriting something
alias cp="cp -i"
alias mv='mv -i'
alias rm='rm -i'

# easier to read disk
alias df='df -h'     # human-readable sizes
alias free='free -m' # show sizes in MB

# get top process eating memory
alias psmem='ps auxf | sort -nr -k 4 | head -5'

# get top process eating cpu ##
alias pscpu='ps auxf | sort -nr -k 3 | head -5'

# alias tms='bash ~/.tmux-sessions'
alias work='bash ~/.tmux-sessions'

# gpg encryption
# verify signature for isos
alias gpg-check="gpg2 --keyserver-options auto-key-retrieve --verify"
# receive the key of a developer
alias gpg-retrieve="gpg2 --keyserver-options auto-key-retrieve --receive-keys"

# For when keys break
# alias archlinx-fix-keys="sudo pacman-key --init && sudo pacman-key --populate archlinux && sudo pacman-key --refresh-keys"

# systemd
alias list_systemctl="systemctl list-unit-files --state=enabled"

alias ls="exa --icons --group-directories-first"
alias ll="exa -l -g --icons"
alias lla="ll -a"

# COLORS
alias rshift="redshift -l 7.59:123.584033"
alias gstep="gammastep -l 7.59:123.584033"

# yt-dlp
alias yta-aac="yt-dlp --paths ~/Music/ --extract-audio --audio-format aac "
alias yta-best="yt-dlp --paths ~/Music/ --extract-audio --audio-format best "
alias _yta-flac="yt-dlp --extract-audio --audio-format flac "
alias yta-flac="_yta-flac --paths ~/Music/ "
alias yta-flac-chill="yt-dlp --paths ~/Music/ --extract-audio --audio-format flac "
alias yta-mp3="yt-dlp --paths ~/Videos/ --extract-audio --audio-format mp3 "
alias ytv-best="yt-dlp --paths ~/Videos/ -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio' --merge-output-format mp4 --write-subs --write-auto-subs"
alias ytv-playlist="yt-dlp -o '%(playlist)s/%(playlist_index)s - %(title)s.%(ext)s' --paths ~/Videos/ -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio' --merge-output-format mp4 --write-subs --write-auto-subs "

alias ram='rate-mirrors --allow-root arch | sudo tee /etc/pacman.d/mirrorlist'
alias ua-drop-caches='sudo paccache -rk3; yay -Sc --aur --noconfirm'
alias ua-update-all='export TMPFILE="$(mktemp)"; \
    sudo true; \
    rate-mirrors --save=$TMPFILE arch --max-delay=21600 \
      && sudo mv /etc/pacman.d/mirrorlist /etc/pacman.d/mirrorlist-backup \
      && sudo mv $TMPFILE /etc/pacman.d/mirrorlist \
      && ua-drop-caches \
      && yay -Syyu --noconfirm'eza

alias display_ports='ss -lntu'
alias kill_port="fuser -k -n tcp "

alias sk='wshowkeys -a right -a bottom -m 150 -F MesloLGS 14 -t 1'

alias _dbeaver="env GDK_BACKEND=x11 dbeaver"

alias scrcpy_record="sudo modprobe v4l2loopback && scrcpy --v4l2-sink=/dev/video4"
alias nwmr="sudo systemctl restart NetworkManager"

alias vi="nvim"
alias vim="nvim"
# alias realvim="vim"
# it

alias nvm='echo "(╯°□°)╯︵ɯʌu, did you mean fnm?"'
alias bluetooth_send="/usr/lib/bluetooth/obexd -n"
alias video_screenshare="sudo modprobe -r v4l2loopback && sudo modprobe v4l2loopback exclusive_caps=1 card_label=VirtualVideoDevice && wf-recorder --muxer=v4l2 --codec=rawvideo --file=/dev/video2 -x yuv420p"
alias reflector-fast="reflector --sort rate --save /etc/pacman.d/mirrorlist -a 6 -c 'Hong Kong,Singapore,Japan' --verbose --download-timeout 10"
alias hbrnt="sudo systemctl hibernate"
