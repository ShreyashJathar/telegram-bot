from aiogram import Router, types, F
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database import Database
import secrets
import aiohttp
from typing import Optional
import re

router = Router(name="search")

# Formatting utility for file sizes
def format_size(bytes_size: int) -> str:
    if not bytes_size:
        return "Unknown size"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024:
            return f"{round(bytes_size, 1)} {unit}"
        bytes_size /= 1024
    return f"{round(bytes_size, 1)} TB"

async def shorten_url(destination_url: str, api_url: str, api_key: str) -> Optional[str]:
    """Helper to shorten a URL using the configured API."""
    if not api_url or not api_key:
        return None
        
    url = api_url
    if "{api_key}" in api_url or "{url}" in api_url:
        url = api_url.replace("{api_key}", api_key).replace("{url}", destination_url)
    else:
        connector = "&" if "?" in api_url else "?"
        url = f"{api_url}{connector}api={api_key}&url={destination_url}"
        
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10) as r:
                if r.status == 200:
                    try:
                        data = await r.json()
                        # Try to extract the shortened link from typical JSON keys
                        for key in ["shortenedUrl", "shortened_url", "short_url", "url", "shortLink"]:
                            if key in data:
                                return data[key]
                    except Exception:
                        pass
                    # If it's plain text (some API returns raw link), return text
                    try:
                        text = await r.text()
                        if text.strip().startswith("http"):
                            return text.strip()
                    except Exception:
                        pass
    except Exception as e:
        print(f"Error shortening URL: {e}")
    return None

async def send_movie_details(message: types.Message, movie: dict, db: Database, user_id: int):
    """Sends a rich information card for a movie or TV show, with download/season menus."""
    title_type = "🎬 Movie" if movie['type'] == 'movie' else "📺 Web Series"
    
    # Detail Text Card
    caption = (
        f"**{title_type}: {movie['title']}**\n\n"
        f"📅 **Year:** {movie['year'] or 'N/A'}\n"
        f"⭐ **Rating:** {movie['rating'] or 'N/A'}/10\n"
        f"🏷️ **Genres:** {movie['genres'] or 'N/A'}\n\n"
        f"📝 **Plot:**\n{movie['description'] or 'No description available.'}"
    )

    builder = InlineKeyboardBuilder()

    if movie['type'] == 'movie':
        # List movie qualities
        files = await db.get_files_for_movie_no_episodes(movie['id'])
        if not files:
            builder.button(text="⚠️ No download links available", callback_data="none")
        else:
            for f in files:
                size_str = format_size(f['file_size'])
                builder.button(text=f"💾 Download {f['quality']} ({size_str})", callback_data=f"get_file:{f['id']}")
    else:
        # Web Series: show seasons
        seasons = await db.get_seasons(movie['id'])
        if not seasons:
            builder.button(text="⚠️ No seasons available yet", callback_data="none")
        else:
            for s in seasons:
                builder.button(text=f"📂 Season {s}", callback_data=f"view_season:{movie['id']}:{s}")

    builder.adjust(1)

    try:
        if movie['poster_url'] and movie['poster_url'].startswith("http"):
            await message.bot.send_photo(
                chat_id=user_id,
                photo=movie['poster_url'],
                caption=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
        else:
            await message.bot.send_message(
                chat_id=user_id,
                text=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
    except Exception as e:
        # Fallback if image fails to load
        print(f"Error sending photo card: {e}")
        try:
            await message.bot.send_message(
                chat_id=user_id,
                text=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
        except Exception:
            pass

# --- Send Specific Episode Details Card ---
async def send_episode_details(message: types.Message, movie: dict, season: int, episode: int, db: Database, user_id: int):
    """Sends a rich information card for a specific episode of a TV show with download links."""
    files = await db.get_files_for_episode(movie['id'], season, episode)
    
    builder = InlineKeyboardBuilder()
    if not files:
        builder.button(text="⚠️ No download links for this episode", callback_data="none")
    else:
        for f in files:
            size_str = format_size(f['file_size'])
            builder.button(text=f"💾 Download {f['quality']} ({size_str})", callback_data=f"get_file:{f['id']}")
            
    # Allow going back to see all seasons
    builder.button(text="📂 View All Seasons", callback_data=f"back_seasons:{movie['id']}")
    builder.adjust(1)
    
    caption = (
        f"📺 **Web Series: {movie['title']}**\n"
        f"📅 **Year:** {movie['year'] or 'N/A'}\n"
        f"📂 **Season {season} | Episode {episode}**\n"
        f"⭐ **Rating:** {movie['rating'] or 'N/A'}/10\n"
        f"🏷️ **Genres:** {movie['genres'] or 'N/A'}\n\n"
        f"📝 **Plot:**\n{movie['description'] or 'No description available.'}"
    )
    
    try:
        if movie['poster_url'] and movie['poster_url'].startswith("http"):
            await message.bot.send_photo(
                chat_id=user_id,
                photo=movie['poster_url'],
                caption=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
        else:
            await message.bot.send_message(
                chat_id=user_id,
                text=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
    except Exception as e:
        print(f"Error sending photo card for episode: {e}")
        try:
            await message.bot.send_message(
                chat_id=user_id,
                text=caption,
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
        except Exception:
            pass

# --- User Text Search ---
@router.message(F.text & ~F.text.startswith("/"))
async def text_search_handler(message: types.Message, db: Database):
    query = message.text.strip()
    user_id = message.from_user.id
    
    # Check if user is banned
    if await db.is_user_banned(user_id):
        return

    # Parse query for Season and Episode details (e.g. S01 E01, Season 1 Episode 5, 1x05)
    match = re.search(r'(?i)\b(?:S(?:eason)?\s*(\d+)\s*(?:E(?:pisode)?|x)\s*(\d+)|(\d+)x(\d+))\b', query)
    
    has_season_episode = False
    season = None
    episode = None
    search_query = query
    
    if match:
        has_season_episode = True
        season = int(match.group(1) or match.group(3))
        episode = int(match.group(2) or match.group(4))
        # Remove the season/episode portion from the search query
        search_query = query[:match.start()].strip() + " " + query[match.end():].strip()
        search_query = search_query.strip()
        
    results = await db.search_movies(search_query)
    
    # If no results found, perform spelling check
    if not results:
        import difflib
        all_movies = await db.get_all_movie_titles()
        
        # Build mapping of title -> movie details
        title_map = {}
        for m in all_movies:
            label = f"{m['title']}"
            if m['year']:
                label += f" ({m['year']})"
            label += " - Movie" if m['type'] == 'movie' else " - Series"
            title_map[m['title']] = (m['id'], label)
            
        # Get close matches for the movie titles in our database
        close_titles = difflib.get_close_matches(search_query, list(title_map.keys()), n=8, cutoff=0.45)
        
        if close_titles:
            builder = InlineKeyboardBuilder()
            for title in close_titles:
                movie_id, label = title_map[title]
                builder.button(text=label, callback_data=f"view_movie:{movie_id}")
            builder.adjust(1)
            
            await message.answer(
                f"🔍 **Search Results for:** `{query}`\n\n"
                f"❌ No exact match found.\n"
                f"🙋 **Did you mean?** Select a suggestion below:",
                reply_markup=builder.as_markup(),
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                f"🔍 **Search Results for:** `{query}`\n\n"
                f"❌ Sorry, no matches found.\n"
                f"Please verify the spelling and try again.",
                parse_mode="Markdown"
            )
        return

    # If matches are found:
    # Check if we parsed season and episode, and if the single match is a TV series
    if has_season_episode:
        series_results = [r for r in results if r['type'] == 'series']
        if series_results:
            series = series_results[0]
            files = await db.get_files_for_episode(series['id'], season, episode)
            if files:
                await send_episode_details(message, series, season, episode, db, user_id)
                return
            else:
                await message.answer(
                    f"⚠️ **Season {season} Episode {episode}** is not available yet for **{series['title']}**.\n"
                    "Showing all available seasons below instead.",
                    parse_mode="Markdown"
                )
                await send_movie_details(message, series, db, user_id)
                return

    # Regular single match or multiple matches flow
    if len(results) == 1:
        # Single result - skip list and show details directly
        await send_movie_details(message, results[0], db, user_id)
    else:
        # Multiple results - show inline search results
        builder = InlineKeyboardBuilder()
        for movie in results:
            label = f"{movie['title']}"
            if movie['year']:
                label += f" ({movie['year']})"
            label += " - Movie" if movie['type'] == 'movie' else " - Series"
            
            builder.button(text=label, callback_data=f"view_movie:{movie['id']}")
            
        builder.adjust(1)
        await message.answer(
            f"🔍 **Search Results for:** `{query}`\n"
            f"Select a title below to view options:",
            reply_markup=builder.as_markup(),
            parse_mode="Markdown"
        )

# --- View Movie/Series Callback ---
@router.callback_query(F.data.startswith("view_movie:"))
async def view_movie_callback(callback: types.CallbackQuery, db: Database):
    movie_id = int(callback.data.split(":")[1])
    movie = await db.get_movie(movie_id)
    if not movie:
        await callback.answer("❌ Movie not found.")
        return
        
    await callback.answer()
    # Delete the search list message to keep chat clean
    try:
        await callback.message.delete()
    except Exception:
        pass
        
    await send_movie_details(callback.message, movie, db, callback.from_user.id)

# --- View Season Callback ---
@router.callback_query(F.data.startswith("view_season:"))
async def view_season_callback(callback: types.CallbackQuery, db: Database):
    parts = callback.data.split(":")
    movie_id = int(parts[1])
    season = int(parts[2])
    
    movie = await db.get_movie(movie_id)
    if not movie:
        await callback.answer("❌ Series not found.")
        return
        
    episodes = await db.get_episodes(movie_id, season)
    
    builder = InlineKeyboardBuilder()
    if not episodes:
        builder.button(text="⚠️ No episodes linked to this season", callback_data="none")
    else:
        for ep in episodes:
            builder.button(text=f"🎞️ Episode {ep}", callback_data=f"view_ep:{movie_id}:{season}:{ep}")
            
    builder.button(text="🔙 Back to Seasons", callback_data=f"back_seasons:{movie_id}")
    builder.adjust(2)
    
    new_caption = f"📺 **{movie['title']}**\n📂 **Season {season}**\n\nSelect an episode below:"
    
    await callback.answer()
    
    try:
        # Check if message has photo
        if callback.message.photo:
            await callback.message.edit_caption(caption=new_caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
        else:
            await callback.message.edit_text(text=new_caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except Exception as e:
        print(f"Error editing to season view: {e}")

# --- View Episode Callback ---
@router.callback_query(F.data.startswith("view_ep:"))
async def view_episode_callback(callback: types.CallbackQuery, db: Database):
    parts = callback.data.split(":")
    movie_id = int(parts[1])
    season = int(parts[2])
    episode = int(parts[3])
    
    movie = await db.get_movie(movie_id)
    if not movie:
        await callback.answer("❌ Series not found.")
        return
        
    files = await db.get_files_for_episode(movie_id, season, episode)
    
    builder = InlineKeyboardBuilder()
    if not files:
        builder.button(text="⚠️ No download links for this episode", callback_data="none")
    else:
        for f in files:
            size_str = format_size(f['file_size'])
            builder.button(text=f"💾 {f['quality']} ({size_str})", callback_data=f"get_file:{f['id']}")
            
    builder.button(text="🔙 Back to Season Episodes", callback_data=f"view_season:{movie_id}:{season}")
    builder.adjust(1)
    
    new_caption = (
        f"📺 **{movie['title']}**\n"
        f"📂 **Season {season} | Episode {episode}**\n\n"
        f"Select a download quality below:"
    )
    
    await callback.answer()
    
    try:
        if callback.message.photo:
            await callback.message.edit_caption(caption=new_caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
        else:
            await callback.message.edit_text(text=new_caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except Exception as e:
        print(f"Error editing to episode view: {e}")

# --- Back to Seasons Callback ---
@router.callback_query(F.data.startswith("back_seasons:"))
async def back_to_seasons_callback(callback: types.CallbackQuery, db: Database):
    movie_id = int(callback.data.split(":")[1])
    movie = await db.get_movie(movie_id)
    if not movie:
        await callback.answer("❌ Series not found.")
        return
        
    seasons = await db.get_seasons(movie_id)
    
    builder = InlineKeyboardBuilder()
    for s in seasons:
        builder.button(text=f"📂 Season {s}", callback_data=f"view_season:{movie_id}:{s}")
    builder.adjust(2)
    
    title_type = "📺 Web Series"
    caption = (
        f"**{title_type}: {movie['title']}**\n\n"
        f"📅 **Year:** {movie['year'] or 'N/A'}\n"
        f"⭐ **Rating:** {movie['rating'] or 'N/A'}/10\n"
        f"🏷️ **Genres:** {movie['genres'] or 'N/A'}\n\n"
        f"📝 **Plot:**\n{movie['description'] or 'No description available.'}"
    )
    
    await callback.answer()
    
    try:
        if callback.message.photo:
            await callback.message.edit_caption(caption=caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
        else:
            await callback.message.edit_text(text=caption, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except Exception as e:
        print(f"Error editing back to seasons: {e}")

# --- Get File Callback (Sends file directly or redirects to shortener) ---
@router.callback_query(F.data.startswith("get_file:"))
async def get_file_callback(callback: types.CallbackQuery, db: Database):
    user_id = callback.from_user.id

    # Check if user is banned
    if await db.is_user_banned(user_id):
        await callback.answer("❌ You are banned from using this bot.", show_alert=True)
        return

    # Check subscription again just to make sure they didn't leave after starting
    force_sub_channel = await db.get_setting("force_sub_channel", "")
    if force_sub_channel:
        from config import ADMINS
        if user_id not in ADMINS:
            from handlers.start import check_membership
            is_member = await check_membership(callback.bot, force_sub_channel, user_id)
            if not is_member:
                await callback.answer("⚠️ You have left our channel! Please join to download files.", show_alert=True)
                return

    file_db_id = int(callback.data.split(":")[1])
    
    # Look up the file in the database (supports SQLite and PostgreSQL)
    file_rec = await db.get_file(file_db_id)

    if not file_rec:
        await callback.answer("❌ File not found or has been deleted by an administrator.", show_alert=True)
        return

    # --- Subscription (VIP) Quality Check ---
    quality_lower = str(file_rec['quality']).lower()
    is_high_quality = any(q in quality_lower for q in ["720", "1080", "2k", "4k"])
    is_premium_user = await db.is_premium(user_id)
    
    if is_high_quality and not is_premium_user:
        await callback.answer("👑 VIP resolution content restricted!", show_alert=True)
        buy_contact = await db.get_setting("premium_buy_contact", "@JatharPatil")
        await callback.bot.send_message(
            chat_id=user_id,
            text=(
                "👑 **VIP Content Restricted**\n\n"
                f"The requested quality (`{file_rec['quality']}`) is restricted to **Premium VIP Subscribers**.\n"
                "Free users can only download lower quality files (e.g. 480p).\n\n"
                "⭐ **Why Upgrade to Premium?**\n"
                "✅ Access 720p, 1080p, 2K, and 4K resolutions\n"
                "✅ Completely ad-free (No link shortener checks)\n"
                "✅ Direct downloads with one click\n\n"
                f"📥 **To purchase a subscription, contact:** {buy_contact}\n"
                "💡 Type `/premium` to check status and benefits."
            ),
            parse_mode="Markdown"
        )
        return

    # --- Shortener Link Verification Check ---
    shortener_enabled = await db.get_setting("shortener_enabled", "1") == "1"
    
    # Premium users bypass shortener checks
    if shortener_enabled and not is_premium_user:
        expiry_hours = int(await db.get_setting("shortener_expiry_hours", "24"))
        is_verified = await db.is_user_verified(user_id, expiry_hours)
        
        if not is_verified:
            # Generate temporary token
            token = secrets.token_hex(8)
            await db.create_pending_verification(token, user_id, file_db_id)
            
            # Fetch bot username
            bot_info = await callback.bot.get_me()
            bot_username = bot_info.username
            destination_url = f"https://t.me/{bot_username}?start=token_{token}"
            
            # Shorten URL
            from config import DEFAULT_SHORTENER_API_KEY, DEFAULT_SHORTENER_API_URL
            api_url = await db.get_setting("shortener_api_url", DEFAULT_SHORTENER_API_URL)
            api_key = await db.get_setting("shortener_api_key", DEFAULT_SHORTENER_API_KEY)
            
            await callback.answer("⏳ Generating secure download link...")
            short_link = await shorten_url(destination_url, api_url, api_key)
            
            if short_link:
                # Ask user to verify
                builder = InlineKeyboardBuilder()
                builder.button(text="🔗 Verify & Download", url=short_link)
                
                await callback.bot.send_message(
                    chat_id=user_id,
                    text=(
                        "🔐 **Human Verification Required**\n\n"
                        "To download the file, you must complete a human verification step. "
                        "Click the link below, solve the captcha, and you will be redirected back to the bot to receive your file.\n\n"
                        f"⏱️ *Verification will remain valid for `{expiry_hours}` hours.*"
                    ),
                    reply_markup=builder.as_markup(),
                    parse_mode="Markdown"
                )
                return
            else:
                print("Failed to shorten link, falling back to direct delivery.")

    # Proceed to send file directly
    await callback.answer("⏳ Sending file... Please check your chat.")
    
    try:
        await callback.bot.send_document(
            chat_id=user_id,
            document=file_rec['file_id'],
            caption=f"🎬 **Here is your file:**\n📂 `{file_rec['file_name']}` ({file_rec['quality']})",
            parse_mode="Markdown"
        )
    except Exception as e:
        await callback.bot.send_message(
            chat_id=user_id,
            text=f"❌ **Failed to send file:**\n{e}\n\nPlease contact bot administrator.",
            parse_mode="Markdown"
        )
