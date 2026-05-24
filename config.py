import os
from pathlib import Path

# Base Directory
BASE_DIR = Path(__file__).resolve().parent

# Bot Configuration
# The Telegram Bot Token provided by the user
BOT_TOKEN = os.getenv("BOT_TOKEN", "8603545111:AAEzEkr-BYGyrWe5H6slycIqSm_7JIcl6Z0")

# Admin IDs - Add your Telegram User ID here (e.g. [123456789, 987654321])
# You can find your Telegram ID by starting a chat with @userinfobot or @missrose_bot
ADMINS = [
    # Replace or add your Telegram user ID here:
    7208882987,  # Default placeholder - user can change this
]

# Database Settings
DATABASE_PATH = os.getenv("DATABASE_URL") or os.getenv("DATABASE_PATH", str(BASE_DIR / "bot_database.db"))

# TMDB API Configuration (Optional)
# Get a free API key from https://www.themoviedb.org/ if you want auto-populating details
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")

# Default force subscription channel (can be edited by admins via the bot later)
# Set as @channel_username or channel ID (e.g. -100123456789)
DEFAULT_FORCE_SUB_CHANNEL = os.getenv("FORCE_SUB_CHANNEL", "")

# Link Shortener Configuration (Optional, can be modified via /admin settings)
DEFAULT_SHORTENER_API_KEY = os.getenv("SHORTENER_API_KEY", "d3a6c313d893910a1b4860b284826b8a2b56bab1")
DEFAULT_SHORTENER_API_URL = os.getenv("SHORTENER_API_URL", "https://gplinks.in/api?api={api_key}&url={url}")
