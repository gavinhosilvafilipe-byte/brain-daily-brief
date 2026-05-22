#!/bin/zsh
# Launched by com.filipe.brain-triage.plist 3x daily. Runs inbox triage.
cd /Users/filipegavinhodasilva/Desktop/BRAIN/brain-daily-brief || exit 1
mkdir -p STATE
echo "=== triage run $(date) ===" >> STATE/triage.log
/usr/local/bin/node src/jobs/triage.js >> STATE/triage.log 2>&1
code=$?
if [ $code -ne 0 ]; then
  osascript -e 'display notification "Inbox triage failed — check STATE/triage.log" with title "BRAIN ⚠️" sound name "Basso"'
fi
exit $code
