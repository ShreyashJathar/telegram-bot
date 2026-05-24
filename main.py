import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from config import BOT_TOKEN, DATABASE_PATH
from database import Database

# Import routers
from handlers import start, admin, files, search

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("bot")

async def on_startup(dispatcher: Dispatcher, bot: Bot, db: Database):
    logger.info("Initializing database...")
    await db.connect()
    logger.info("Database initialized successfully.")
    
    # Get bot info to display startup message
    bot_info = await bot.get_me()
    logger.info(f"Bot @{bot_info.username} started successfully!")

async def main():
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN is not configured! Please check config.py or environment variables.")
        return

    # Initialize bot and database
    bot = Bot(token=BOT_TOKEN)
    db = Database(DATABASE_PATH)
    
    # Initialize dispatcher
    dp = Dispatcher()
    
    # Inject database dependency into handler arguments
    dp["db"] = db
    
    # Register routers in correct order (start/admin/files before general text search)
    dp.include_router(start.router)
    dp.include_router(admin.router)
    dp.include_router(files.router)
    dp.include_router(search.router) # General text search router should be last
    
    # Register startup hooks
    dp.startup.register(lambda dp_instance, bot_instance: on_startup(dp_instance, bot_instance, db))

    try:
        # Start bot polling
        # skip_updates=True ignores messages sent while bot was offline
        await dp.start_polling(bot, skip_updates=True)
    except Exception as e:
        logger.error(f"Critical error during bot execution: {e}")
    finally:
        await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user.")
