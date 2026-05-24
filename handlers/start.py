from aiogram import Router, types, F
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database import Database
from config import ADMINS
import re

router = Router(name="start")

async def check_membership(bot, channel: str, user_id: int) -> bool:
    """Checks if a user is a member of the force-subscribe channel."""
    if not channel:
        return True
    
    # Format channel username if necessary
    chat_id = channel
    if not str(channel).startswith("-100") and not str(channel).startswith("@"):
        chat_id = f"@{channel}"
        
    try:
        member = await bot.get_chat_member(chat_id=chat_id, user_id=user_id)
        return member.status in ["creator", "administrator", "member"]
    except Exception as e:
        # If bot is not in the channel or cannot access it, don't lock out users. Log the error.
        print(f"Force sub check error for channel {chat_id}: {e}")
        return True

@router.message(Command("start"))
async def start_cmd(message: types.Message, db: Database):
    user_id = message.from_user.id
    username = message.from_user.username
    full_name = message.from_user.full_name

    # 1. Register User
    await db.add_user(user_id, username, full_name)

    # 2. Check Banned Status
    if await db.is_user_banned(user_id):
        await message.answer("❌ You are banned from using this bot.")
        return

    # 3. Parse Deep-link Payload (if any)
    payload = "empty"
    command_parts = message.text.split(" ", 1)
    if len(command_parts) > 1:
        payload = command_parts[1]

    # 4. Check Force Subscription
    force_sub_channel = await db.get_setting("force_sub_channel", "")
    
    # Admin users bypass force subscription check
    if force_sub_channel and user_id not in ADMINS:
        is_member = await check_membership(message.bot, force_sub_channel, user_id)
        if not is_member:
            # Build channel join keyboard
            builder = InlineKeyboardBuilder()
            channel_url = force_sub_channel.replace("@", "")
            if str(force_sub_channel).startswith("-100"):
                # If channel ID, admin should set custom invite link.
                # If not set, we look for a saved setting or use a placeholder.
                invite_link = await db.get_setting("channel_invite_link", "https://t.me/telegram")
                builder.button(text="📢 Join Channel", url=invite_link)
            else:
                builder.button(text="📢 Join Channel", url=f"https://t.me/{channel_url}")
            
            builder.button(text="🔄 Verify Membership", callback_data=f"verify_sub:{payload}")
            builder.adjust(1)

            # Send subscribe message
            welcome_text = await db.get_setting("force_sub_text", 
                "⚠️ **Access Denied!**\n\nYou must join our updates channel first to use this bot.")
            
            await message.answer(welcome_text, reply_markup=builder.as_markup(), parse_mode="Markdown")
            return

    # 5. Process Deep-link payload or show default start message
    await handle_start_payload(message, payload, db)

@router.callback_query(F.data.startswith("verify_sub:"))
async def verify_subscription(callback: types.CallbackQuery, db: Database):
    user_id = callback.from_user.id
    payload = callback.data.split(":", 1)[1]

    force_sub_channel = await db.get_setting("force_sub_channel", "")
    
    if force_sub_channel:
        is_member = await check_membership(callback.bot, force_sub_channel, user_id)
        if not is_member:
            await callback.answer("❌ You haven't joined yet! Please join and try again.", show_alert=True)
            return

    # If verified, edit/delete message and proceed
    await callback.answer("✅ Thank you for joining!", show_alert=False)
    
    # Try deleting the verification block message
    try:
        await callback.message.delete()
    except Exception:
        pass

    # Process original intent
    await handle_start_payload(callback.message, payload, db, user=callback.from_user)

async def handle_start_payload(message: types.Message, payload: str, db: Database, user: types.User = None):
    """Processes bot launch payloads or prints default greeting."""
    target_user = user or message.from_user
    
    if payload == "empty":
        # Default Welcome Message
        welcome = await db.get_setting("welcome_message", 
            f"🎬 **Welcome to the Movie world Bot! By Shreyash Jathar** 🎬\n\n"
            f"Just type the movie or web series name, then you will get the movie!\n\n"
            f"First you have to verify then you get the movie.\n"
            f"[📺 Watch How to Verify](https://t.me/how_to_Verify_Movie)\n\n"
            f"🌟 **VIP Feature**\n"
            f"Want to skip the verification link? Become a VIP member and get movies instantly without any wait!\n"
            f"Contact the admin (@JatharPatil) to get VIP access.\n\n"
            f"**Example:**\n"
            f"• Dhurander 2026 1080p\n"
            f"• Mirzapur S01 E01"
        )
        await message.answer(welcome, parse_mode="Markdown")
    elif payload.startswith("token_"):
        # Link Shortener Verification Callback
        token = payload.replace("token_", "")
        token_data = await db.get_pending_verification(token)
        
        if token_data:
            if token_data['user_id'] == target_user.id:
                # Mark verified
                await db.set_user_verified(target_user.id)
                
                # Fetch and send file
                file_rec = await db.get_file(token_data['file_id'])
                
                if file_rec:
                    # VIP quality check (extra security bypass block)
                    quality_lower = str(file_rec['quality']).lower()
                    is_high_quality = any(q in quality_lower for q in ["720", "1080", "2k", "4k"])
                    is_premium = await db.is_premium(target_user.id)
                    
                    if is_high_quality and not is_premium:
                        await message.bot.send_message(
                            chat_id=target_user.id,
                            text="⚠️ **Access Denied!**\n\nThis high-resolution file is restricted to Premium VIP Subscribers. Please upgrade your plan to access it."
                        )
                        return

                    await message.bot.send_message(
                        chat_id=target_user.id,
                        text="✅ **Human Verification Completed Successfully!**\n\nYour file is sending below..."
                    )
                    try:
                        await message.bot.send_document(
                            chat_id=target_user.id,
                            document=file_rec['file_id'],
                            caption=f"🎬 **Here is your file:**\n📂 `{file_rec['file_name']}` ({file_rec['quality']})",
                            parse_mode="Markdown"
                        )
                    except Exception as e:
                        await message.bot.send_message(
                            chat_id=target_user.id,
                            text=f"❌ **Failed to send file:**\n{e}"
                        )
                else:
                    await message.bot.send_message(
                        chat_id=target_user.id,
                        text="❌ The file you verified for was not found or has been deleted."
                    )
            else:
                await message.bot.send_message(
                    chat_id=target_user.id,
                    text="❌ Verification session mismatch. Please generate a new link."
                )
        else:
            await message.bot.send_message(
                chat_id=target_user.id,
                text="❌ **Invalid or Expired Verification Link**\n\nPlease go back and click the download button again to generate a new verification link."
            )
    else:
        # Payload exists - format: "movie_{movie_id}"
        # We trigger a search or show details directly
        match = re.match(r"^movie_(\d+)$", payload)
        if match:
            movie_id = int(match.group(1))
            movie = await db.get_movie(movie_id)
            if movie:
                # Import search module internally to avoid circular dependencies
                from handlers.search import send_movie_details
                await send_movie_details(message, movie, db, target_user.id)
            else:
                await message.answer("❌ Movie or web series not found. It might have been deleted.")
        else:
            await message.answer("👋 Welcome back! Please type a search query to find movies or series.")

@router.message(Command("premium"))
async def check_user_premium(message: types.Message, db: Database):
    user_id = message.from_user.id
    
    # Check ban
    if await db.is_user_banned(user_id):
        return
        
    is_vip = await db.is_premium(user_id)
    
    if is_vip:
        from config import ADMINS
        if user_id in ADMINS:
            await message.answer("👑 **Premium Status:** `Active` (Administrator - Lifetime VIP Access)")
            return
            
        expiry = await db.get_premium_expiry(user_id)
        expiry_str = expiry.strftime("%Y-%m-%d %H:%M:%S") if expiry else "Lifetime"
        await message.answer(
            f"👑 **Premium Subscription: Active**\n\n"
            f"📅 **Expiry Date:** `{expiry_str}`\n\n"
            f"Thank you for supporting us! You have unlocked all high resolutions (720p, 1080p, 2K, 4K) without verification steps.",
            parse_mode="Markdown"
        )
    else:
        buy_contact = await db.get_setting("premium_buy_contact", "@JatharPatil")
        caption_text = (
            "💎 **VIP Subscription Plans** 💎\n\n"
            "🥉 **Basic Plan** – ₹49/month\n"
            "**Features:**\n"
            "• Access to trending movie recommendations\n"
            "• 5 movie searches per day\n"
            "• Basic chatbot support\n"
            "• Watchlist creation\n"
            "• Movie ratings and reviews\n\n"
            "🥇 **Standard Plan** – ₹99/month\n"
            "**Features:**\n"
            "• Unlimited movie searches\n"
            "• Personalized movie recommendations\n"
            "• HD trailer access\n"
            "• Priority chatbot response\n"
            "• Weekly new-release alerts\n\n"
            f"📲 **Scan QR Code & Pay. After payment, send screenshot to:** {buy_contact}\n"
            "UPI ID: `shreyashjathar1@pingpay`"
        )
        
        from config import BASE_DIR
        from aiogram.types import FSInputFile
        import os
        
        qr_path = os.path.join(BASE_DIR, "payment_qr.jpg")
        if os.path.exists(qr_path):
            photo = FSInputFile(qr_path)
            await message.answer_photo(
                photo=photo,
                caption=caption_text,
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                text=caption_text,
                parse_mode="Markdown"
            )
