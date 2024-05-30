killport(){ 
  sudo kill -9 $(sudo fuser -n tcp $1 2> /dev/null);
}
