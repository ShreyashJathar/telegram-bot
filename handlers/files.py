from aiogram import Router, types, F
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database import Database
from handlers.admin import is_admin
import re

router = Router(name="files")

class FileStates(StatesGroup):
    waiting_for_movie_id = State()
    waiting_for_season = State()
    waiting_for_episode = State()
    waiting_for_quality = State()

def get_quality_keyboard():
    builder = InlineKeyboardBuilder()
    builder.button(text="480p", callback_data="qual:480p")
    builder.button(text="720p", callback_data="qual:720p")
    builder.button(text="1080p", callback_data="qual:1080p")
    builder.button(text="Original / HD", callback_data="qual:Original")
    builder.button(text="❌ Cancel", callback_data="cancel_file")
    builder.adjust(2, 2, 1)
    return builder.as_markup()

# --- 1. Quick Command-based Link System ---
@router.message(Command("link"))
async def link_file_command(message: types.Message, db: Database):
    if not await is_admin(message.from_user.id):
        return

    # Check if this is a reply to a document or video
    reply = message.reply_to_message
    if not reply or (not reply.document and not reply.video):
        await message.answer(
            "❌ **How to use:**\n"
            "Reply to a video or document message with one of these commands:\n\n"
            "• **For Movies:** `/link <movie_id> <quality>`\n"
            "  *Example: `/link 1 1080p`*\n\n"
            "• **For Web Series:** `/link <movie_id> <season> <episode> <quality>`\n"
            "  *Example: `/link 2 1 5 720p`*",
            parse_mode="Markdown"
        )
        return

    # Extract file details
    file_id = reply.document.file_id if reply.document else reply.video.file_id
    file_name = reply.document.file_name if reply.document else (reply.video.file_name or "video.mp4")
    file_size = reply.document.file_size if reply.document else reply.video.file_size

    command_parts = message.text.strip().split(" ")
    if len(command_parts) < 2:
        await message.answer("❌ Missing arguments. Provide movie_id and other details.")
        return

    try:
        movie_id = int(command_parts[1])
        movie = await db.get_movie(movie_id)
        if not movie:
            await message.answer(f"❌ No movie/series found in database with ID: `{movie_id}`")
            return

        if movie['type'] == 'movie':
            # Movie format: /link <movie_id> <quality>
            quality = command_parts[2] if len(command_parts) > 2 else "Original"
            await db.add_file(
                movie_id=movie_id,
                file_id=file_id,
                file_name=file_name,
                file_size=file_size,
                quality=quality
            )
            await message.answer(
                f"✅ **Linked to Movie!**\n"
                f"🎬 **Title:** {movie['title']} ({movie['year']})\n"
                f"📁 **File:** `{file_name}`\n"
                f"🏷️ **Quality:** {quality}",
                parse_mode="Markdown"
            )
        else:
            # Series format: /link <movie_id> <season> <episode> <quality>
            if len(command_parts) < 5:
                await message.answer(
                    "❌ This is a web series. Use:\n"
                    "`/link <movie_id> <season> <episode> <quality>`\n"
                    "Example: `/link 2 1 5 720p`"
                )
                return
            season = int(command_parts[2])
            episode = int(command_parts[3])
            quality = command_parts[4]
            
            await db.add_file(
                movie_id=movie_id,
                file_id=file_id,
                file_name=file_name,
                file_size=file_size,
                quality=quality,
                season=season,
                episode=episode
            )
            await message.answer(
                f"✅ **Linked to Web Series!**\n"
                f"📺 **Title:** {movie['title']}\n"
                f"🎬 **Season:** {season} | **Episode:** {episode}\n"
                f"📁 **File:** `{file_name}`\n"
                f"🏷️ **Quality:** {quality}",
                parse_mode="Markdown"
            )
    except ValueError:
        await message.answer("❌ Invalid arguments. Ensure IDs, Seasons, and Episodes are integers.")
    except Exception as e:
        await message.answer(f"❌ An error occurred: {e}")

# --- 2. Interactive Guided Upload Flow ---
@router.message(F.video | F.document)
async def handle_direct_file(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return

    # If the admin replied to something else, ignore direct flow
    if message.reply_to_message:
        return

    # Extract metadata
    file_id = message.document.file_id if message.document else message.video.file_id
    file_name = message.document.file_name if message.document else (message.video.file_name or "video.mp4")
    file_size = message.document.file_size if message.document else message.video.file_size

    # Save to FSM state
    await state.set_state(FileStates.waiting_for_movie_id)
    await state.update_data(
        file_id=file_id,
        file_name=file_name,
        file_size=file_size
    )

    # Automatically clean file name to search for potential database matches
    clean_name = re.sub(r'\.[a-zA-Z0-9]+$', '', file_name)  # Remove extension
    clean_name = re.sub(r'[\._\-]', ' ', clean_name)       # Replace dots, underscores, dashes with space
    # Remove resolution tags to get cleaner search
    clean_name = re.sub(r'(?i)(480p|720p|1080p|2k|4k|webrip|web-dl|x264|h264|x265|h265|hevc|dd5\.1|bluray|hdrip|dual|audio|hindi|english|org)', '', clean_name)
    clean_name = ' '.join(clean_name.split()).strip()      # Normalize spaces
    
    matches = []
    if len(clean_name) >= 3:
        matches = await db.search_movies(clean_name[:30])

    builder = InlineKeyboardBuilder()
    if matches:
        for movie in matches[:5]: # Show up to 5 matching movies
            year_str = f" ({movie['year']})" if movie['year'] else ""
            type_icon = "🎬" if movie['type'] == 'movie' else "📺"
            builder.button(
                text=f"{type_icon} {movie['title']}{year_str}",
                callback_data=f"select_movie:{movie['id']}"
            )
            
    builder.button(text="❌ Cancel", callback_data="cancel_file")
    builder.adjust(1)

    intro_text = (
        f"📥 **File Received!**\n"
        f"📄 **Name:** `{file_name}`\n"
        f"💾 **Size:** {round(file_size / (1024 * 1024), 2)} MB\n\n"
    )
    
    if matches:
        intro_text += (
            "🔍 **Automatic Matches Found:**\n"
            "We found some potential matches in your database. Click one below to link, or **reply with a different title/name** to search, or reply with the **numeric Database ID**."
        )
    else:
        intro_text += (
            "💬 **Please reply with the title/name of the Movie/Series to search, or enter its numeric Database ID.**\n"
            "*(Use /admin panel or search TMDB if you need to create the record first)*"
        )

    await message.answer(
        intro_text,
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.callback_query(F.data == "cancel_file")
async def cancel_file_linking(callback: types.CallbackQuery, state: FSMContext):
    if not await is_admin(callback.from_user.id):
        return
    await state.clear()
    await callback.message.edit_text("❌ File linking process cancelled.")

async def proceed_with_movie_by_id(movie_id: int, message_or_callback, state: FSMContext, db: Database):
    movie = await db.get_movie(movie_id)
    if not movie:
        if isinstance(message_or_callback, types.Message):
            await message_or_callback.answer("❌ Movie not found.")
        else:
            await message_or_callback.answer("❌ Movie not found.", show_alert=True)
        return

    # Update state data
    await state.update_data(movie_id=movie_id, movie_type=movie['type'], movie_title=movie['title'])
    
    if isinstance(message_or_callback, types.Message):
        if movie['type'] == 'movie':
            await state.set_state(FileStates.waiting_for_quality)
            await message_or_callback.answer(
                f"🎬 **Movie Found:** `{movie['title']} ({movie['year']})`\n"
                f"Please select the video resolution/quality:",
                reply_markup=get_quality_keyboard()
            )
        else:
            await state.set_state(FileStates.waiting_for_season)
            await message_or_callback.answer(
                f"📺 **Web Series Found:** `{movie['title']}`\n"
                f"💬 Please enter the **Season number** (e.g. `1`):"
            )
    else:
        if movie['type'] == 'movie':
            await state.set_state(FileStates.waiting_for_quality)
            await message_or_callback.message.edit_text(
                f"🎬 **Movie Found:** `{movie['title']} ({movie['year']})`\n"
                f"Please select the video resolution/quality:",
                reply_markup=get_quality_keyboard()
            )
        else:
            await state.set_state(FileStates.waiting_for_season)
            await message_or_callback.message.edit_text(
                f"📺 **Web Series Found:** `{movie['title']}`\n"
                f"💬 Please enter the **Season number** (e.g. `1`):"
            )

@router.callback_query(F.data.startswith("select_movie:"))
async def process_select_movie_callback(callback: types.CallbackQuery, state: FSMContext, db: Database):
    if not await is_admin(callback.from_user.id):
        return
        
    data = await state.get_data()
    if not data or 'file_id' not in data:
        await callback.answer("❌ Session expired. Please send/forward the file again.", show_alert=True)
        return
        
    movie_id = int(callback.data.split(":")[1])
    await callback.answer()
    
    await proceed_with_movie_by_id(movie_id, callback, state, db)

@router.message(FileStates.waiting_for_movie_id)
async def process_movie_id(message: types.Message, state: FSMContext, db: Database):
    if not await is_admin(message.from_user.id):
        return

    text = message.text.strip()
    
    # If a numeric Database ID is sent
    if text.isdigit():
        movie_id = int(text)
        await proceed_with_movie_by_id(movie_id, message, state, db)
        return

    # If a search term is sent
    matches = await db.search_movies(text)
    if not matches:
        await message.answer(
            f"❌ No movie or series found matching `{text}`.\n\n"
            "Please try searching with another title, or send the numeric Database ID, or cancel."
        )
        return

    # Display matches as inline buttons
    builder = InlineKeyboardBuilder()
    for movie in matches[:8]: # Show up to 8 matching movies
        year_str = f" ({movie['year']})" if movie['year'] else ""
        type_icon = "🎬" if movie['type'] == 'movie' else "📺"
        builder.button(
            text=f"{type_icon} {movie['title']}{year_str}",
            callback_data=f"select_movie:{movie['id']}"
        )
    builder.button(text="❌ Cancel", callback_data="cancel_file")
    builder.adjust(1)

    await message.answer(
        f"🔍 **Search Results for** `{text}`:\n"
        "Click a movie or web series below to link this file to it:",
        reply_markup=builder.as_markup(),
        parse_mode="Markdown"
    )

@router.message(FileStates.waiting_for_season)
async def process_season(message: types.Message, state: FSMContext):
    if not await is_admin(message.from_user.id):
        return

    text = message.text.strip()
    if not text.isdigit():
        await message.answer("❌ Invalid Season. Please enter a valid number.")
        return

    await state.update_data(season=int(text))
    await state.set_state(FileStates.waiting_for_episode)
    await message.answer("💬 Please enter the **Episode number** (e.g. `3`):")

@router.message(FileStates.waiting_for_episode)
async def process_episode(message: types.Message, state: FSMContext):
    if not await is_admin(message.from_user.id):
        return

    text = message.text.strip()
    if not text.isdigit():
        await message.answer("❌ Invalid Episode. Please enter a valid number.")
        return

    await state.update_data(episode=int(text))
    await state.set_state(FileStates.waiting_for_quality)
    await message.answer(
        "Please select the video resolution/quality:",
        reply_markup=get_quality_keyboard()
    )

@router.callback_query(FileStates.waiting_for_quality, F.data.startswith("qual:"))
async def process_quality(callback: types.CallbackQuery, state: FSMContext, db: Database):
    if not await is_admin(callback.from_user.id):
        return

    quality = callback.data.split(":")[1]
    data = await state.get_data()
    await state.clear()

    try:
        if data['movie_type'] == 'movie':
            await db.add_file(
                movie_id=data['movie_id'],
                file_id=data['file_id'],
                file_name=data['file_name'],
                file_size=data['file_size'],
                quality=quality
            )
            await callback.message.edit_text(
                f"✅ **File Linked Successfully!**\n\n"
                f"🎬 **Movie:** {data['movie_title']}\n"
                f"📁 **File:** `{data['file_name']}`\n"
                f"🏷️ **Quality:** {quality}",
                parse_mode="Markdown"
            )
        else:
            await db.add_file(
                movie_id=data['movie_id'],
                file_id=data['file_id'],
                file_name=data['file_name'],
                file_size=data['file_size'],
                quality=quality,
                season=data['season'],
                episode=data['episode']
            )
            await callback.message.edit_text(
                f"✅ **File Linked Successfully!**\n\n"
                f"📺 **Web Series:** {data['movie_title']}\n"
                f"🎬 **Season:** {data['season']} | **Episode:** {data['episode']}\n"
                f"📁 **File:** `{data['file_name']}`\n"
                f"🏷️ **Quality:** {quality}",
                parse_mode="Markdown"
            )
    except Exception as e:
        await callback.message.edit_text(f"❌ Error saving file details: {e}")
