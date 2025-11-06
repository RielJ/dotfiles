compressvideo() {
  input="$1"
  output="${input%.*}-compressed.mp4"
  ffmpeg -i "$input" -vf "scale=1280:-2" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 128k -movflags +faststart "$output"
}
