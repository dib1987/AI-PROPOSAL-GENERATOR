# Harness hook — PreToolCall
# Blocks Claude from editing any .env file in this project.
# Runs automatically before every Edit or Write tool call.
# Exit 1 = block the tool call. Exit 0 = allow it through.

$toolInput = $env:CLAUDE_TOOL_INPUT

if ($toolInput -match '\.env') {
    Write-Host "HARNESS BLOCKED: .env files are protected. Edit .env manually outside Claude." -ForegroundColor Red
    exit 1
}

exit 0
