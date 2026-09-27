#!/bin/bash
cd "$(dirname "$0")" || exit 1
R="ftp://conrado.cloud/public_html/"
: > retry.log
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if curl -sS --ftp-ssl-control --insecure --netrc --ftp-create-dirs \
       --retry 4 --retry-delay 3 --connect-timeout 30 \
       -T "dist/$rel" "${R}${rel}" 2>>retry.log; then
    echo "OK   $rel" >> retry.log
  else
    echo "FAIL $rel" >> retry.log
  fi
  sleep 1
done < retry.txt
echo "DONE" >> retry.log
