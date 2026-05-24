import asyncio
import sys
from aiogram import Bot
from config import BOT_TOKEN

async def main():
    if not BOT_TOKEN:
        print("❌ Error: BOT_TOKEN is not set in config.py!")
        return

    print("--- Telegram Webhook Setup ---")
    print("Choose your hosting platform:")
    print("1. PythonAnywhere")
    print("2. Render / Custom Domain")
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        username = input("Enter your PythonAnywhere username: ").strip().lower()
        if not username:
            print("❌ Username cannot be empty.")
            return
        webhook_url = f"https://{username}.pythonanywhere.com/webhook"
    elif choice == "2":
        url = input("Enter your Render/Custom App URL (e.g. https://my-bot.onrender.com): ").strip()
        if not url:
            print("❌ URL cannot be empty.")
            return
        if not url.startswith("http"):
            url = f"https://{url}"
        url = url.rstrip("/")
        if not url.endswith("/webhook"):
            webhook_url = f"{url}/webhook"
        else:
            webhook_url = url
    else:
        print("❌ Invalid choice.")
        return
    
    bot = Bot(token=BOT_TOKEN)
    print(f"⏳ Registering webhook: {webhook_url} ...")
    
    try:
        # Delete old webhooks/polls and set new one
        await bot.delete_webhook(drop_pending_updates=True)
        success = await bot.set_webhook(url=webhook_url)
        if success:
            print(f"✅ Webhook successfully set to: {webhook_url}")
            print("Telegram will now forward all user messages to your app!")
        else:
            print("❌ Failed to set webhook.")
    except Exception as e:
        print(f"❌ Error setting webhook: {e}")
    finally:
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
