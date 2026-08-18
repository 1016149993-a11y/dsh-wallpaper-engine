# Start the we-wallpaper-dsh media server (keeps running; Ctrl+C to stop)
# Optionally override: $env:WE_WALLPAPER_PORT = '8899'; $env:WE_WALLPAPER_ROOT = '...'
node "$PSScriptRoot\server.js"
