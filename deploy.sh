#!/bin/bash
# Deploy conrado.cloud. Run this yourself:  ./deploy.sh
# The password is typed by you, held in a 600-perm temp file, and deleted on exit.
# It is never stored, never echoed, and never appears in your shell history or in ps.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${FTP_HOST:-conrado.cloud}"
USER="${FTP_USER:-Claude@conrado.cloud}"

echo "Rebuilding dist/ from scratch..."
rm -rf dist
python3 build.py | tail -n 6
echo

read -r -s -p "FTP password for $USER: " PASS; echo
NETRC="$(mktemp)"; chmod 600 "$NETRC"
trap 'rm -f "$NETRC"' EXIT
printf 'machine %s login %s password %s\n' "$HOST" "$USER" "$PASS" > "$NETRC"
unset PASS

echo
echo "What is already in the FTP root:"
curl -sS --ftp-ssl --insecure --netrc-file "$NETRC" "ftp://$HOST/" | sed 's/^/   /'
echo
echo "The site must land where the web server serves from — often public_html/ or httpdocs/,"
echo "but if this FTP account is already scoped to the site root, leave it empty."
read -r -p "Remote folder (blank = the root shown above): " REMOTE
[ -n "$REMOTE" ] && REMOTE="${REMOTE%/}/"

echo
read -r -p "Upload $(find dist -type f | wc -l | tr -d ' ') files to ftp://$HOST/${REMOTE}? [y/N] " OK
[ "$OK" = "y" ] || { echo "Cancelled."; exit 0; }

cd dist
n=0
while IFS= read -r f; do
  rel="${f#./}"
  curl -sS --ftp-ssl --ftp-create-dirs --netrc-file "$NETRC" \
       -T "$f" "ftp://$HOST/${REMOTE}${rel}" \
    || { echo; echo "FAILED on $rel"; exit 1; }
  n=$((n+1)); printf '\r  uploaded %d files' "$n"
done < <(find . -type f ! -name '.DS_Store')
echo; echo
echo "Done — $n files."
echo "Now check:  https://conrado.cloud/   and   https://conrado.cloud/sitemap.xml"
