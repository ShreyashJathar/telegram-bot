from aiogram import Router, types, F
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database import Database
from config import ADMINS, TMDB_API_KEY
from tmdb import TMDBClient
import asyncio

router = Router(name="admin")

class AdminStates(StatesGroup):
    waiting_for_broadcast = State()
    waiting_for_force_sub = State()
    waiting_for_invite_link = State()
    waiting_for_welcome_msg = State()
    waiting_for_force_sub_text = State()
    waiting_for_tmdb_search = State()
    waiting_for_shortener_api = State()
    waiting_for_shortener_key = State()
    waiting_for_shortener_expiry = State()

def get_admin_keyboard():
    builder = InlineKeyboardBuilder()
    builder.button(text="📊 Statistics", callback_data="admin_stats")
    builder.button(text="📢 Broadcast Message", callback_data="admin_broadcast")
    builder.button(text="⚙️ Edit Settings", callback_data="admin_settings")
    builder.button(text="🎬 Add Content (TMDB)", callback_data="admin_add_tmdb")
    builder.button(text="❌ Close Panel", callback_data="admin_close")
    builder.adjust(2, 2, 1)
    return builder.as_markup()

def get_settings_keyboard(current_sub: str, invite_link: str):
    builder = InlineKeyboardBuilder()
    builder.button(text=f"📢 Force Sub: {current_sub or 'Disabled'}", callback_data="set_force_sub")
    builder.button(text=f"🔗 Invite Link: {'Set' if invite_link else 'Not Set'}", callback_data="set_invite_link")
    builder.button(text="👋 Edit Welcome Message", callback_data="set_welcome")
    builder.button(text="⚠️ Edit Force Sub Text", callback_data="set_sub_text")
    builder.button(text="🔗 Shortener Settings", callback_data="admin_shortener")
    builder.button(text="🔙 Back to Menu", callback_data="admin_back")
    builder.adjust(1)
    return builder.as_markup()

def get_shortener_keyboard(status: bool):
    builder = InlineKeyboardBuilder()
    builder.button(text=f"Toggle Status: {'🟢 Enabled' if status else '🔴 Disabled'}", callback_data="toggle_shortener")
    builder.button(text="✏️ Edit API URL", callback_data="edit_shortener_api")
    builder.button(text="✏️ Edit API Key", callback_data="edit_shortener_key")
    builder.button(text="✏️ Edit Expiry Time (Hrs)", callback_data="edit_shortener_expiry")
    builder.button(text="🔙 Back to Settings", callback_data="admin_settings")
    builder.adjust(1)
    return builder.as_markup()

# --- Admin Filter Middleware Helper ---
async def is_admin(user_id: int) -> bool:
    return user_id in ADMINS

@router.message(Command("admin"))
async def admin_panel(message: types.Message):
    if not await is_admin(message.from_user.id):
        return
    await message.answer("🛠️ **Welcome to the Admin Control Panel**\nChoose an action from the options below:", 
                         reply_markup=get_admin_keyboard(), parse_mode="Markdown")

@router.callback_query(F.data == "admin_back")
async def back_to_admin(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    await state.clear()
    await callback.message.edit_text("🛠️ **Welcome to the Admin Control Panel**\nChoose an action from the options below:", 
                                     reply_markup=get_admin_keyboard(), parse_mode="Markdown")

@router.callback_query(F.data == "admin_close")
async def close_admin(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    await state.clear()
    await callback.message.delete()

# --- Stats Handler ---
@router.callback_query(F.data == "admin_stats")
async def admin_stats(callback: types.CallbackQuery, db: Database):
    if not await is_admin(callback.from_user.id):
        return
    
    total_users = await db.get_all_users_count()
    
    # Get unified statistics (supports both SQLite and PostgreSQL)
    stats = await db.get_stats()
    total_movies = stats["total_movies"]
    total_files = stats["total_files"]
    total_size_bytes = stats["total_size_bytes"]
            
    total_size_gb = round(total_size_bytes / (1024 * 1024 * 1024), 2)
    
    stats_text = (
        "📊 **Bot Analytics & Statistics**\n\n"
        f"👥 **Total Users:** {total_users}\n"
        f"🎬 **Total Movies & Series:** {total_movies}\n"
        f"📁 **Total Saved Files:** {total_files}\n"
        f"💾 **Storage Managed:** {total_size_gb} GB\n"
    )
    
    builder = InlineKeyboardBuilder()
    builder.button(text="🔙 Back to Menu", callback_data="admin_back")
    
    await callback.message.edit_text(stats_text, reply_markup=builder.as_markup(), parse_mode="Markdown")

# --- Broadcast Handlers ---
@router.callback_query(F.data == "admin_broadcast")
async def start_broadcast(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_broadcast)
    
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_back")
    
    await callback.message.edit_text(
        "📢 **Global Broadcast**\n\n"
        "Send the message you want to broadcast to all users. "
        "It can contain text, formatting, links, photos, videos, or files.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_broadcast)
async def process_broadcast(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    await state.clear()
    users = await db.get_all_users()
    
    status_msg = await message.answer(f"⏳ Broadcasting message to {len(users)} users... Please wait.")
    
    success = 0
    failed = 0
    
    for user_id in users:
        try:
            # We copy the message to preserve formatting, attachments, and caption
            await message.copy_to(chat_id=user_id)
            success += 1
            # Add small delay to prevent Telegram rate limit limits (30 messages per second limit)
            await asyncio.sleep(0.05)
        except Exception:
            failed += 1
            
    await status_msg.edit_text(
        "📢 **Broadcast Completed!**\n\n"
        f"✅ **Successfully Sent:** {success}\n"
        f"❌ **Failed/Blocked:** {failed}\n"
        f"👥 **Total Target Users:** {len(users)}",
        reply_markup=get_admin_keyboard(),
        parse_mode="Markdown"
    )

# --- Settings Handlers ---
@router.callback_query(F.data == "admin_settings")
async def show_settings(callback: types.CallbackQuery, db: Database):
    if not await is_admin(callback.from_user.id):
        return
    
    current_sub = await db.get_setting("force_sub_channel", "")
    invite_link = await db.get_setting("channel_invite_link", "")
    
    await callback.message.edit_text(
        "⚙️ **System Settings Dashboard**\n\n"
        "Configure force subscription, welcome texts, and other global configurations.",
        reply_markup=get_settings_keyboard(current_sub, invite_link),
        parse_mode="Markdown"
    )

# Force Sub Edit
@router.callback_query(F.data == "set_force_sub")
async def set_force_sub_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_force_sub)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Disable Sub Check", callback_data="disable_force_sub")
    builder.button(text="❌ Cancel", callback_data="admin_settings")
    builder.adjust(1)
    
    await callback.message.edit_text(
        "📢 **Edit Force Subscription Channel**\n\n"
        "Send the channel username (e.g. `@MyChannel`) or channel ID (e.g. `-100123456789`).\n\n"
        "⚠️ **CRITICAL:** The bot MUST be added to that channel as an **Administrator** with 'Invite Users via Link' and 'Post Messages' permissions.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.callback_query(F.data == "disable_force_sub")
async def disable_force_sub(callback: types.CallbackQuery, db: Database, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.clear()
    await db.set_setting("force_sub_channel", "")
    await callback.answer("✅ Force subscription has been disabled.")
    
    current_sub = ""
    invite_link = await db.get_setting("channel_invite_link", "")
    await callback.message.edit_text("⚙️ **System Settings Dashboard**\n\nConfigure force subscription, welcome texts, and other configurations.",
                                     reply_markup=get_settings_keyboard(current_sub, invite_link), parse_mode="Markdown")

@router.message(AdminStates.waiting_for_force_sub)
async def process_force_sub(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    channel = message.text.strip()
    await db.set_setting("force_sub_channel", channel)
    await state.clear()
    
    await message.answer(f"✅ Force subscription channel set to: `{channel}`\n\nPlease make sure the bot is an admin in this channel.", parse_mode="Markdown", reply_markup=get_admin_keyboard())

# Invite Link Edit
@router.callback_query(F.data == "set_invite_link")
async def set_invite_link_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_invite_link)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_settings")
    
    await callback.message.edit_text(
        "🔗 **Edit Invite Link**\n\n"
        "Send the private channel invite link (e.g. `https://t.me/+AbCdEf...`).\n"
        "This link is used for private channels where the bot cannot generate invite links dynamically.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_invite_link)
async def process_invite_link(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    link = message.text.strip()
    if not link.startswith("http"):
        await message.answer("❌ Invalid URL. Please send a valid Telegram invite link.")
        return
        
    await db.set_setting("channel_invite_link", link)
    await state.clear()
    
    await message.answer(f"✅ Channel invite link updated.", reply_markup=get_admin_keyboard())

# Welcome Message Edit
@router.callback_query(F.data == "set_welcome")
async def set_welcome_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_welcome_msg)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_settings")
    
    await callback.message.edit_text(
        "👋 **Edit Welcome Message**\n\n"
        "Send the new text for the `/start` welcome message. You can use markdown formatting.\n"
        "Use `{name}` placeholder to dynamically mention the user's first name.\n\n"
        "Example:\n`Hello {name}! Search any movie here.`",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_welcome_msg)
async def process_welcome_msg(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    text = message.text
    # We replace python brace formatting safely at runtime, convert to standard format
    text_to_save = text.replace("{name}", "{target_user.first_name}")
    
    await db.set_setting("welcome_message", text_to_save)
    await state.clear()
    
    await message.answer("✅ Welcome message updated successfully.", reply_markup=get_admin_keyboard())

# Force Sub Alert Text Edit
@router.callback_query(F.data == "set_sub_text")
async def set_sub_text_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_force_sub_text)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_settings")
    
    await callback.message.edit_text(
        "⚠️ **Edit Force Subscription Denied Text**\n\n"
        "Send the text displayed when a user attempts to search but hasn't joined the required channel yet.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_force_sub_text)
async def process_sub_text(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    await db.set_setting("force_sub_text", message.text)
    await state.clear()
    
@router.callback_query(F.data == "admin_shortener")
async def show_shortener_settings(callback: types.CallbackQuery, db: Database):
    if not await is_admin(callback.from_user.id):
        return
    
    from config import DEFAULT_SHORTENER_API_KEY, DEFAULT_SHORTENER_API_URL
    enabled_val = await db.get_setting("shortener_enabled", "1")
    enabled = enabled_val == "1"
    api_url = await db.get_setting("shortener_api_url", DEFAULT_SHORTENER_API_URL)
    api_key = await db.get_setting("shortener_api_key", DEFAULT_SHORTENER_API_KEY)
    expiry = await db.get_setting("shortener_expiry_hours", "24")
    
    text = (
        "🔗 **Link Shortener Settings**\n\n"
        f"🟢 **Status:** {'Enabled' if enabled else 'Disabled'}\n"
        f"🔗 **API URL:** `{api_url}`\n"
        f"🔑 **API Key:** `{api_key or 'Not Set'}`\n"
        f"⏱️ **Verification Expiry:** `{expiry} Hours`\n\n"
        "Configure these settings to monetize your bot downloads using services like GPLinks."
    )
    
    await callback.message.edit_text(text, reply_markup=get_shortener_keyboard(enabled), parse_mode="Markdown")

@router.callback_query(F.data == "toggle_shortener")
async def toggle_shortener(callback: types.CallbackQuery, db: Database):
    if not await is_admin(callback.from_user.id):
        return
    
    current_val = await db.get_setting("shortener_enabled", "1")
    new_val = "1" if current_val == "0" else "0"
    await db.set_setting("shortener_enabled", new_val)
    
    await callback.answer(f"✅ Shortener {'Enabled' if new_val == '1' else 'Disabled'}")
    await show_shortener_settings(callback, db)

@router.callback_query(F.data == "edit_shortener_api")
async def edit_shortener_api_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_shortener_api)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_shortener")
    
    await callback.message.edit_text(
        "🔗 **Edit Shortener API URL**\n\n"
        "Send the Shortener API endpoint. Use `{api_key}` and `{url}` placeholders.\n\n"
        "Example (GPLinks):\n`https://gplinks.in/api?api={api_key}&url={url}`\n\n"
        "Example (Shareus):\n`https://api.shareus.in/api?api={api_key}&url={url}`",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_shortener_api)
async def process_shortener_api(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    api_url = message.text.strip()
    await db.set_setting("shortener_api_url", api_url)
    await state.clear()
    await message.answer("✅ Shortener API URL updated.", reply_markup=get_admin_keyboard())

@router.callback_query(F.data == "edit_shortener_key")
async def edit_shortener_key_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_shortener_key)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_shortener")
    
    await callback.message.edit_text(
        "🔑 **Edit Shortener API Key**\n\n"
        "Send your API key/token provided by the link shortener website.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_shortener_key)
async def process_shortener_key(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    api_key = message.text.strip()
    await db.set_setting("shortener_api_key", api_key)
    await state.clear()
    await message.answer("✅ Shortener API Key updated.", reply_markup=get_admin_keyboard())

@router.callback_query(F.data == "edit_shortener_expiry")
async def edit_shortener_expiry_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    await state.set_state(AdminStates.waiting_for_shortener_expiry)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_shortener")
    
    await callback.message.edit_text(
        "⏱️ **Edit Verification Expiry Time**\n\n"
        "Send the number of hours the human verification remains valid for a user (e.g. `24` for 24 hours).",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_shortener_expiry)
async def process_shortener_expiry(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return
    
    val = message.text.strip()
    if not val.isdigit():
        await message.answer("❌ Invalid value. Please send a valid number of hours (integer).")
        return
        
    await db.set_setting("shortener_expiry_hours", val)
    await state.clear()
    await message.answer(f"✅ Verification expiry set to `{val}` hours.", reply_markup=get_admin_keyboard())

# --- TMDB Content Add Handlers ---
@router.callback_query(F.data == "admin_add_tmdb")
async def add_tmdb_prompt(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    
    if not TMDB_API_KEY:
        await callback.answer("❌ TMDB API Key is not set in config.py! Configure it to use this feature.", show_alert=True)
        return
        
    await state.set_state(AdminStates.waiting_for_tmdb_search)
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Cancel", callback_data="admin_back")
    
    await callback.message.edit_text(
        "🎬 **Search TMDB to Add Content**\n\n"
        "Send the name of the movie or web series you want to search on TMDB.",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(AdminStates.waiting_for_tmdb_search)
async def process_tmdb_search(message: types.Message, state: FSMContext):
    if not await is_admin(message.from_user.id):
        return
    
    query = message.text.strip()
    await state.clear()
    
    status_msg = await message.answer("🔍 Searching TMDB...")
    
    client = TMDBClient(TMDB_API_KEY)
    movies = await client.search(query, "movie")
    tv_shows = await client.search(query, "tv")
    
    results = movies[:4] + tv_shows[:4]
    
    if not results:
        await status_msg.edit_text("❌ No results found on TMDB for your query.", reply_markup=get_admin_keyboard())
        return
        
    await status_msg.delete()
    
    await message.answer("🔍 **TMDB Search Results:**\nSelect the item you want to add to the bot catalog:")
    
    for idx, item in enumerate(results):
        type_lbl = "🎬 Movie" if item['type'] == 'movie' else "📺 TV Show"
        year_lbl = f"({item['year']})" if item['year'] else ""
        
        info_text = (
            f"**{idx + 1}. {item['title']}** {year_lbl}\n"
            f"Type: {type_lbl}\n"
            f"Rating: ⭐ {item['rating']}\n"
            f"Description: {item['description'][:140]}..."
        )
        
        builder = InlineKeyboardBuilder()
        builder.button(text="➕ Add to Bot", callback_data=f"add_item:{item['type']}:{item['tmdb_id']}")
        
        if item['poster_url']:
            await message.answer_photo(photo=item['poster_url'], caption=info_text, reply_markup=builder.as_markup(), parse_mode="Markdown")
        else:
            await message.answer(info_text, reply_markup=builder.as_markup(), parse_mode="Markdown")

@router.callback_query(F.data.startswith("add_item:"))
async def process_add_item(callback: types.CallbackQuery, db: Database):
    if not await is_admin(callback.from_user.id):
        return
    
    parts = callback.data.split(":")
    type_val = parts[1]
    tmdb_id = int(parts[2])
    
    client = TMDBClient(TMDB_API_KEY)
    details = await client.get_details(tmdb_id, "movie" if type_val == "movie" else "tv")
    
    if not details:
        await callback.answer("❌ Error fetching full details from TMDB.", show_alert=True)
        return
        
    # Check if already exists
    movie_id = await db.add_movie(
        title=details['title'],
        type_val=details['type'],
        description=details['description'],
        poster_url=details['poster_url'],
        year=details['year'],
        rating=details['rating'],
        genres=details['genres'],
        tmdb_id=details['tmdb_id']
    )
    
    await callback.answer("✅ Successfully Added to Database!")
    
    type_lbl = "Movie" if details['type'] == 'movie' else "Web Series"
    await callback.message.answer(
        f"🎉 **Content Added Successfully!**\n\n"
        f"🏷️ **ID:** `{movie_id}`\n"
        f"🎬 **Title:** {details['title']}\n"
        f"📌 **Type:** {type_lbl}\n\n"
        f"📁 **How to link files:**\n"
        f"Forward/send files (documents/videos) to this bot and use the ID `{movie_id}` to map them.",
        parse_mode="Markdown"
    )
    await callback.message.delete()

# --- Ban / Unban Command Handlers ---
@router.message(Command("ban"))
async def ban_user_cmd(message: types.Message, db: Database):
    if not await is_admin(message.from_user.id):
        return
        
    command_parts = message.text.split(" ")
    if len(command_parts) < 2:
        await message.answer("Usage: `/ban <user_id>`", parse_mode="Markdown")
        return
        
    try:
        user_id = int(command_parts[1])
        user = await db.get_user(user_id)
        if not user:
            await message.answer("❌ User not found in database.")
            return
            
        await db.ban_user(user_id, ban=True)
        await message.answer(f"✅ User `{user_id}` has been banned.", parse_mode="Markdown")
    except ValueError:
        await message.answer("❌ Invalid User ID. Must be an integer.")

@router.message(Command("unban"))
async def unban_user_cmd(message: types.Message, db: Database):
    if not await is_admin(message.from_user.id):
        return
        
    command_parts = message.text.split(" ")
    if len(command_parts) < 2:
        await message.answer("Usage: `/unban <user_id>`", parse_mode="Markdown")
        return
        
    try:
        user_id = int(command_parts[1])
        user = await db.get_user(user_id)
        if not user:
            await message.answer("❌ User not found in database.")
            return
            
        await db.ban_user(user_id, ban=False)
        await message.answer(f"✅ User `{user_id}` has been unbanned.", parse_mode="Markdown")
    except ValueError:
        await message.answer("❌ Invalid User ID. Must be an integer.")

# --- Premium / Subscription Admin Handlers ---

@router.message(Command("addpremium"))
async def add_premium_cmd(message: types.Message, db: Database):
    if not await is_admin(message.from_user.id):
        return
        
    command_parts = message.text.split(" ")
    if len(command_parts) < 3:
        await message.answer(
            "Usage: `/addpremium <user_id_or_username> <days>`\n"
            "Examples:\n"
            "• `/addpremium @username 30`\n"
            "• `/addpremium 1234567 30`",
            parse_mode="Markdown"
        )
        return
        
    target_input = command_parts[1]
    days_str = command_parts[2]
    
    # Validate days
    if not days_str.isdigit():
        await message.answer("❌ Invalid arguments. Days must be an integer (e.g. `30`).")
        return
    days = int(days_str)
    
    # Resolve user
    user = None
    if target_input.startswith("@") or not target_input.isdigit():
        # Treat as username
        user = await db.get_user_by_username(target_input)
        if not user:
            await message.answer(
                f"❌ User with username `{target_input}` not found in bot database.\n\n"
                f"⚠️ **Note:** The user must start the bot by running `/start` at least once before they can be set as VIP.",
                parse_mode="Markdown"
            )
            return
        user_id = user['user_id']
    else:
        # Treat as numeric user_id
        user_id = int(target_input)
        user = await db.get_user(user_id)
        if not user:
            await message.answer(f"❌ User with ID `{user_id}` not found in database.")
            return

    await db.set_premium(user_id, days)
    expiry = await db.get_premium_expiry(user_id)
    expiry_str = expiry.strftime("%Y-%m-%d %H:%M:%S") if expiry else "Error"
    
    name_display = f"@{user['username']}" if user.get('username') else user['full_name']
    
    await message.answer(
        f"✅ **Premium Added Successfully!**\n\n"
        f"👤 **User:** {name_display} (`{user_id}`)\n"
        f"📅 **New Expiry:** `{expiry_str}`",
        parse_mode="Markdown"
    )
    
    # Notify the user they got premium!
    try:
        await message.bot.send_message(
            chat_id=user_id,
            text=f"🎉 **Congratulations!**\n\nYour account has been upgraded to **Premium Subscription** for `{days}` days!\n"
                 f"📅 **Expiry Date:** `{expiry_str}`\n\nYou now have unlimited access to all high-quality downloads (720p, 1080p, 2K, 4K)!",
            parse_mode="Markdown"
        )
    except Exception:
        pass # Ignore if user blocked the bot

@router.message(Command("removepremium"))
async def remove_premium_cmd(message: types.Message, db: Database):
    if not await is_admin(message.from_user.id):
        return
        
    command_parts = message.text.split(" ")
    if len(command_parts) < 2:
        await message.answer(
            "Usage: `/removepremium <user_id_or_username>`\n"
            "Examples:\n"
            "• `/removepremium @username`\n"
            "• `/removepremium 1234567`",
            parse_mode="Markdown"
        )
        return
        
    target_input = command_parts[1]
    
    # Resolve user
    user = None
    if target_input.startswith("@") or not target_input.isdigit():
        # Treat as username
        user = await db.get_user_by_username(target_input)
        if not user:
            await message.answer(f"❌ User with username `{target_input}` not found in database.")
            return
        user_id = user['user_id']
    else:
        # Treat as numeric user_id
        user_id = int(target_input)
        user = await db.get_user(user_id)
        if not user:
            await message.answer(f"❌ User with ID `{user_id}` not found in database.")
            return

    await db.remove_premium(user_id)
    name_display = f"@{user['username']}" if user.get('username') else user['full_name']
    
    await message.answer(f"✅ Premium status has been removed from user {name_display} (`{user_id}`).", parse_mode="Markdown")
    
    try:
        await message.bot.send_message(
            chat_id=user_id,
            text="⚠️ Your **Premium Subscription** has been removed by the administrator. "
                 "You have been downgraded back to the free plan.",
            parse_mode="Markdown"
        )
    except Exception:
        pass
