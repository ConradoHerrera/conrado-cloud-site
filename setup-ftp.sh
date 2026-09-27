#!/bin/bash
# Tests the FTP login first, and only writes ~/.netrc if it actually works.
# The password is read silently, never echoed, never written to your shell history.
set -uo pipefail

read -r -p "FTP host [conrado.cloud]: " HOST;  HOST="${HOST:-conrado.cloud}"
read -r -p "FTP username [Claude@conrado.cloud]: " USER; USER="${USER:-Claude@conrado.cloud}"
read -r -s -p "FTP password (nothing will appear as you type): " PASS; echo
echo

echo "Testing login to $HOST as $USER ..."
OUT="$(curl -sS --ftp-ssl --insecure --connect-timeout 25 \
        --user "$USER:$PASS" "ftp://$HOST/" 2>&1)" && RC=0 || RC=$?

if [ "$RC" -eq 0 ]; then
  echo "Login OK. The FTP root contains:"
  echo "$OUT" | sed 's/^/   /'
  umask 077
  printf 'machine %s login %s password %s\n' "$HOST" "$USER" "$PASS" > ~/.netrc
  chmod 600 ~/.netrc
  unset PASS
  echo
  echo "Saved to ~/.netrc. Tell Claude it worked."
else
  unset PASS
  case "$OUT" in
    *530*) echo "REJECTED (530): the server did not accept that username/password pair."
           echo "  - In cPanel > FTP Accounts, check the account is listed and copy the"
           echo "    username exactly as shown there."
           echo "  - If you just changed the password, make sure the change was saved."
           echo "  - Nothing was written to ~/.netrc." ;;
    *) echo "Failed: $OUT" ;;
  esac
  exit 1
fi
