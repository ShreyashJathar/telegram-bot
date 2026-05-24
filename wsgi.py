import os
import sys
import asyncio
from flask import Flask, request, jsonify
from aiogram import Bot, Dispatcher
from aiogram.types import Update

# Add project path to sys.path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import BOT_TOKEN, DATABASE_PATH
from database import Database
from handlers import start, admin, files, search

# Initialize Flask app
app = Flask(__name__)

# Initialize Bot, Database and Dispatcher
bot = Bot(token=BOT_TOKEN)
db = Database(DATABASE_PATH)
dp = Dispatcher()

# Register handlers and dependencies
dp["db"] = db
dp.include_router(start.router)
dp.include_router(admin.router)
dp.include_router(files.router)
dp.include_router(search.router)

# Manage the event loop for async operations inside Flask threads
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
loop.run_until_complete(db.connect())

@app.route("/webhook", methods=["POST"])
def webhook_handler():
    """Receives POST updates from Telegram and feeds them to the bot dispatcher."""
    if request.headers.get("content-type") == "application/json":
        json_string = request.get_data().decode("utf-8")
        update = Update.model_validate_json(json_string)
        
        # Feed the update to aiogram asynchronously
        loop.run_until_complete(dp.feed_update(bot, update))
        return "OK", 200
    return "Forbidden", 403

@app.route("/", methods=["GET"])
def index():
    return "Bot is running on Webhook mode!", 200
