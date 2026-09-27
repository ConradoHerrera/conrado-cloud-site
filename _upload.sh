#!/bin/bash
cd "$(dirname "$0")/dist" || exit 1
R="ftp://conrado.cloud/public_html/"
n=0; fail=0
while IFS= read -r f; do
  rel="${f#./}"
  if curl -sS --ftp-ssl-control --insecure --netrc --ftp-create-dirs --retry 4 --retry-delay 3 --connect-timeout 30 \
       -T "$f" "${R}${rel}" 2>>../upload.log; then
    n=$((n+1)); echo "OK   $rel" >> ../upload.log
  else
    fail=$((fail+1)); echo "FAIL $rel" >> ../upload.log
  fi
  sleep 0.4
done < <(find . -type f ! -name '.DS_Store')
echo "DONE uploaded=$n failed=$fail" >> ../upload.log
