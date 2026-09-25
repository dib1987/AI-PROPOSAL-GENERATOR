# Harness hook — Stop
# Appends a timestamped entry to .claude/session-log.txt every time
# Claude finishes a response turn in this project.
# Gives you a lightweight audit trail of when Claude was active.

$logFile = ".\.claude\session-log.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "$timestamp : Claude session turn ended"
