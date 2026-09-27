#!/bin/bash
cd "$(dirname "$0")" || exit 1
H="ftp://conrado.cloud/"
LOG="retire.log"; : > "$LOG"
q(){ curl -sS --ftp-ssl-control --insecure --netrc --connect-timeout 30 "$@" "$H" -o /dev/null; }

q -Q "MKD _retired-wordpress" 2>>"$LOG" && echo "MKD _retired-wordpress" >> "$LOG"

ITEMS=(
".htaccess.phpupgrader.8875bb5a" ".htaccess.phpupgrader.initial"
"Conrado_Demo.pptx" "error_log" "index.php" "license.txt" "readme.html"
"wp-activate.php" "wp-admin" "wp-blog-header.php" "wp-comments-post.php"
"wp-config-sample.php" "wp-config.php" "wp-content" "wp-cron.php"
"wp-includes" "wp-links-opml.php" "wp-load.php" "wp-login.php" "wp-mail.php"
"wp-settings.php" "wp-signup.php" "wp-trackback.php" "xmlrpc.php"
)
for it in "${ITEMS[@]}"; do
  if q -Q "RNFR public_html/$it" -Q "RNTO _retired-wordpress/$it" 2>>"$LOG"; then
    echo "MOVED $it" >> "$LOG"
  else
    echo "SKIP  $it" >> "$LOG"
  fi
done
echo "DONE" >> "$LOG"
