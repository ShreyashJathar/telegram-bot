import aiosqlite
import datetime
from typing import List, Dict, Any, Optional

class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.is_postgres = db_path.startswith("postgres://") or db_path.startswith("postgresql://")
        self.conn = None

    def _format_query(self, query: str) -> str:
        if self.is_postgres:
            # Replace SQLite placeholders (?) with PostgreSQL placeholders (%s)
            query = query.replace("?", "%s")
            # Replace SQLite autoincrement
            query = query.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
            # Remove SQLite NOCASE collation
            query = query.replace("COLLATE NOCASE", "")
        return query

    async def get_postgres_conn(self):
        import psycopg
        if not self.conn or self.conn.closed:
            url = self.db_path
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)
            self.conn = await psycopg.AsyncConnection.connect(url)
            self.conn.autocommit = True
        return self.conn

    async def execute_ddl(self, query: str):
        """Executes table creation DDLs."""
        formatted_query = self._format_query(query)
        if self.is_postgres:
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query)
        else:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(formatted_query)
                await db.commit()

    async def connect(self):
        """Initializes the database and creates tables if they do not exist."""
        if self.is_postgres:
            try:
                import psycopg
            except ImportError:
                raise ImportError("PostgreSQL driver 'psycopg' is required for Render hosting. Make sure 'psycopg[binary]' is installed.")
        
        # Users Table (BIGINT prevents overflow for modern Telegram IDs)
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS users (
                user_id BIGINT PRIMARY KEY,
                username TEXT,
                full_name TEXT,
                joined_date TIMESTAMP,
                is_banned INTEGER DEFAULT 0,
                premium_expiry TEXT DEFAULT NULL
            )
        """)

        # Migration for existing database files
        try:
            await self.execute_ddl("ALTER TABLE users ADD COLUMN premium_expiry TEXT DEFAULT NULL")
        except Exception:
            pass

        # Movies Table (covers both movies and web series)
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tmdb_id INTEGER UNIQUE,
                title TEXT NOT NULL,
                type TEXT NOT NULL, -- 'movie' or 'series'
                description TEXT,
                poster_url TEXT,
                year INTEGER,
                rating REAL,
                genres TEXT
            )
        """)

        # Files Table
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                movie_id INTEGER,
                file_id TEXT NOT NULL,
                file_name TEXT,
                file_size BIGINT,
                quality TEXT, -- '480p', '720p', etc.
                season INTEGER,
                episode INTEGER
            )
        """)

        # Settings Table
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # User Verifications Table (keeps track of who verified and when)
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS user_verifications (
                user_id BIGINT PRIMARY KEY,
                verified_at TEXT
            )
        """)

        # Pending Verifications Table (temporary tokens for shortlinks)
        await self.execute_ddl("""
            CREATE TABLE IF NOT EXISTS pending_verifications (
                token TEXT PRIMARY KEY,
                user_id BIGINT,
                file_id INTEGER,
                created_at TEXT
            )
        """)

        # Auto-upgrade special VIP usernames if they exist in the DB
        try:
            expiry_str = (datetime.datetime.now() + datetime.timedelta(days=36500)).isoformat()
            await self.execute(
                "UPDATE users SET premium_expiry = ? WHERE LOWER(username) IN ('jatharpatil', 'shreyash_jathar')",
                (expiry_str,)
            )
        except Exception as e:
            print(f"Error running VIP auto-upgrade migration: {e}")

    async def execute(self, query: str, params: tuple = ()):
        """Runs a write command (INSERT, UPDATE, DELETE)."""
        formatted_query = self._format_query(query)
        if self.is_postgres:
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query, params)
        else:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(formatted_query, params)
                await db.commit()

    async def fetchone(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Fetches a single row as a dictionary."""
        formatted_query = self._format_query(query)
        if self.is_postgres:
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query, params)
                row = await cur.fetchone()
                if row:
                    colnames = [desc[0] for desc in cur.description]
                    return dict(zip(colnames, row))
                return None
        else:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(formatted_query, params) as cursor:
                    row = await cursor.fetchone()
                    return dict(row) if row else None

    async def fetchall(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Fetches all matching rows as a list of dictionaries."""
        formatted_query = self._format_query(query)
        if self.is_postgres:
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query, params)
                rows = await cur.fetchall()
                colnames = [desc[0] for desc in cur.description]
                return [dict(zip(colnames, row)) for row in rows]
        else:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(formatted_query, params) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]

    # --- User Operations ---

    async def add_user(self, user_id: int, username: Optional[str], full_name: str) -> bool:
        """Adds a new user to the database. Returns True if added, False if already exists."""
        user = await self.get_user(user_id)
        if user:
            await self.execute(
                "UPDATE users SET username = ?, full_name = ? WHERE user_id = ?",
                (username, full_name, user_id)
            )
            # Auto-upgrade to VIP if they change their username to one of our special VIPs
            if username and username.strip().lstrip("@").lower() in ["jatharpatil", "shreyash_jathar"]:
                expiry_str = (datetime.datetime.now() + datetime.timedelta(days=36500)).isoformat()
                await self.execute("UPDATE users SET premium_expiry = ? WHERE user_id = ?", (expiry_str, user_id))
            return False
        
        # New user VIP check
        expiry_str = None
        if username and username.strip().lstrip("@").lower() in ["jatharpatil", "shreyash_jathar"]:
            expiry_str = (datetime.datetime.now() + datetime.timedelta(days=36500)).isoformat()
            
        await self.execute(
            "INSERT INTO users (user_id, username, full_name, joined_date, premium_expiry) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, full_name, datetime.datetime.now(), expiry_str)
        )
        return True

    async def get_user(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves user details."""
        return await self.fetchone("SELECT * FROM users WHERE user_id = ?", (user_id,))

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Retrieves user details by username (case-insensitive)."""
        clean_username = username.strip().lstrip("@")
        # LOWER makes it compatible across both SQLite and PostgreSQL
        return await self.fetchone("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (clean_username,))

    async def ban_user(self, user_id: int, ban: bool = True):
        """Bans or unbans a user."""
        await self.execute("UPDATE users SET is_banned = ? WHERE user_id = ?", (1 if ban else 0, user_id))

    async def is_user_banned(self, user_id: int) -> bool:
        """Checks if a user is banned."""
        row = await self.fetchone("SELECT is_banned FROM users WHERE user_id = ?", (user_id,))
        return bool(row["is_banned"]) if row else False

    async def get_all_users_count(self) -> int:
        """Returns the total number of users."""
        row = await self.fetchone("SELECT COUNT(*) FROM users")
        if row:
            return list(row.values())[0]
        return 0

    async def get_all_users(self) -> List[int]:
        """Returns a list of all user IDs."""
        rows = await self.fetchall("SELECT user_id FROM users WHERE is_banned = 0")
        return [row["user_id"] for row in rows]

    # --- Movie Operations ---

    async def add_movie(self, title: str, type_val: str, description: Optional[str], 
                        poster_url: Optional[str], year: Optional[int], rating: Optional[float], 
                        genres: Optional[str], tmdb_id: Optional[int] = None) -> int:
        """Adds a movie/series and returns its database ID."""
        if tmdb_id:
            movie = await self.get_movie_by_tmdb(tmdb_id)
            if movie:
                return movie['id']
        
        query = """INSERT INTO movies (title, type, description, poster_url, year, rating, genres, tmdb_id) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
                   
        if self.is_postgres:
            formatted_query = self._format_query(query) + " RETURNING id"
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query, (title, type_val, description, poster_url, year, rating, genres, tmdb_id))
                row = await cur.fetchone()
                return row[0]
        else:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(query, (title, type_val, description, poster_url, year, rating, genres, tmdb_id))
                await db.commit()
                return cursor.lastrowid

    async def get_movie(self, movie_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves a movie's details."""
        return await self.fetchone("SELECT * FROM movies WHERE id = ?", (movie_id,))

    async def get_movie_by_tmdb(self, tmdb_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves a movie's details by TMDB ID."""
        return await self.fetchone("SELECT * FROM movies WHERE tmdb_id = ?", (tmdb_id,))

    async def search_movies(self, query: str) -> List[Dict[str, Any]]:
        """Searches movies/series by title."""
        return await self.fetchall("SELECT * FROM movies WHERE title LIKE ? ORDER BY id DESC LIMIT 50", (f"%{query}%",))

    async def get_all_movie_titles(self) -> List[Dict[str, Any]]:
        """Returns all movie IDs, titles, types, and years for spelling check matching."""
        return await self.fetchall("SELECT id, title, year, type FROM movies")

    async def delete_movie(self, movie_id: int):
        """Deletes a movie and cascades deletes on associated files."""
        await self.execute("DELETE FROM movies WHERE id = ?", (movie_id,))
        await self.execute("DELETE FROM files WHERE movie_id = ?", (movie_id,))

    # --- File Operations ---

    async def add_file(self, movie_id: int, file_id: str, file_name: str, file_size: int, 
                       quality: str, season: Optional[int] = None, episode: Optional[int] = None) -> int:
        """Adds a file associated with a movie/series."""
        query = """INSERT INTO files (movie_id, file_id, file_name, file_size, quality, season, episode) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)"""
                   
        if self.is_postgres:
            formatted_query = self._format_query(query) + " RETURNING id"
            conn = await self.get_postgres_conn()
            async with conn.cursor() as cur:
                await cur.execute(formatted_query, (movie_id, file_id, file_name, file_size, quality, season, episode))
                row = await cur.fetchone()
                return row[0]
        else:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(query, (movie_id, file_id, file_name, file_size, quality, season, episode))
                await db.commit()
                return cursor.lastrowid

    async def get_file(self, file_db_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves a file details by its database ID."""
        return await self.fetchone("SELECT * FROM files WHERE id = ?", (file_db_id,))

    async def get_files_for_movie_no_episodes(self, movie_id: int) -> List[Dict[str, Any]]:
        """Returns files for a movie (where season and episode are NULL)."""
        return await self.fetchall("SELECT * FROM files WHERE movie_id = ? AND season IS NULL AND episode IS NULL ORDER BY quality ASC", (movie_id,))

    async def get_seasons(self, movie_id: int) -> List[int]:
        """Returns a list of distinct season numbers for a web series."""
        rows = await self.fetchall("SELECT DISTINCT season FROM files WHERE movie_id = ? AND season IS NOT NULL ORDER BY season ASC", (movie_id,))
        return [row["season"] for row in rows]

    async def get_episodes(self, movie_id: int, season: int) -> List[int]:
        """Returns a list of distinct episode numbers for a season."""
        rows = await self.fetchall("SELECT DISTINCT episode FROM files WHERE movie_id = ? AND season = ? AND episode IS NOT NULL ORDER BY episode ASC", (movie_id, season))
        return [row["episode"] for row in rows]

    async def get_files_for_episode(self, movie_id: int, season: int, episode: int) -> List[Dict[str, Any]]:
        """Returns files for a specific episode of a series."""
        return await self.fetchall("SELECT * FROM files WHERE movie_id = ? AND season = ? AND episode = ? ORDER BY quality ASC", (movie_id, season, episode))

    async def delete_file(self, file_db_id: int):
        """Deletes a file by its database record ID."""
        await self.execute("DELETE FROM files WHERE id = ?", (file_db_id,))

    # --- Settings Operations ---

    async def set_setting(self, key: str, value: str):
        """Sets a system setting."""
        if self.is_postgres:
            await self.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                (key, value)
            )
        else:
            await self.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value)
            )

    async def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Retrieves a system setting."""
        row = await self.fetchone("SELECT value FROM settings WHERE key = ?", (key,))
        return row["value"] if row else default

    # --- Shortener Verification Operations ---

    async def is_user_verified(self, user_id: int, expiry_hours: int) -> bool:
        """Checks if a user has verified within the last `expiry_hours` hours."""
        if expiry_hours <= 0:
            return False
        row = await self.fetchone("SELECT verified_at FROM user_verifications WHERE user_id = ?", (user_id,))
        if not row:
            return False
        verified_at_str = row["verified_at"]
        try:
            verified_at = datetime.datetime.fromisoformat(verified_at_str)
            now = datetime.datetime.now()
            diff = now - verified_at
            return diff.total_seconds() < (expiry_hours * 3600)
        except Exception:
            return False

    async def set_user_verified(self, user_id: int):
        """Marks the user as verified as of the current time."""
        now_str = datetime.datetime.now().isoformat()
        if self.is_postgres:
            await self.execute(
                "INSERT INTO user_verifications (user_id, verified_at) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET verified_at = EXCLUDED.verified_at",
                (user_id, now_str)
            )
        else:
            await self.execute(
                "INSERT INTO user_verifications (user_id, verified_at) VALUES (?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET verified_at = excluded.verified_at",
                (user_id, now_str)
            )

    async def create_pending_verification(self, token: str, user_id: int, file_db_id: int):
        """Creates a pending single-use verification entry."""
        now_str = datetime.datetime.now().isoformat()
        await self.execute(
            "INSERT INTO pending_verifications (token, user_id, file_id, created_at) VALUES (?, ?, ?, ?)",
            (token, user_id, file_db_id, now_str)
        )

    async def get_pending_verification(self, token: str) -> Optional[Dict[str, Any]]:
        """Retrieves and immediately deletes a pending verification entry (single-use)."""
        row = await self.fetchone("SELECT * FROM pending_verifications WHERE token = ?", (token,))
        if row:
            await self.execute("DELETE FROM pending_verifications WHERE token = ?", (token,))
            return row
        return None

    # --- Premium / Subscription Operations ---

    async def set_premium(self, user_id: int, days: int):
        """Sets or extends a user's premium subscription by a number of days."""
        row = await self.get_user(user_id)
        expiry = None
        now = datetime.datetime.now()
        
        if row and row['premium_expiry']:
            try:
                current_expiry = datetime.datetime.fromisoformat(row['premium_expiry'])
                if current_expiry > now:
                    expiry = current_expiry + datetime.timedelta(days=days)
            except Exception:
                pass
        
        if not expiry:
            expiry = now + datetime.timedelta(days=days)
            
        expiry_str = expiry.isoformat()
        await self.execute(
            "UPDATE users SET premium_expiry = ? WHERE user_id = ?",
            (expiry_str, user_id)
        )

    async def remove_premium(self, user_id: int):
        """Removes premium status from a user."""
        await self.execute("UPDATE users SET premium_expiry = NULL WHERE user_id = ?", (user_id,))

    async def get_premium_expiry(self, user_id: int) -> Optional[datetime.datetime]:
        """Returns the premium expiry date of a user, or None if not premium."""
        row = await self.fetchone("SELECT premium_expiry FROM users WHERE user_id = ?", (user_id,))
        if row and row["premium_expiry"]:
            try:
                return datetime.datetime.fromisoformat(row["premium_expiry"])
            except Exception:
                return None
        return None

    async def is_premium(self, user_id: int) -> bool:
        """Checks if a user has an active premium subscription."""
        from config import ADMINS
        if user_id in ADMINS:
            return True
            
        expiry = await self.get_premium_expiry(user_id)
        if expiry:
            return expiry > datetime.datetime.now()
        return False

    # --- Global Stats Operations ---

    async def get_stats(self) -> Dict[str, Any]:
        """Returns statistics for movies, files, and storage size."""
        row_movies = await self.fetchone("SELECT COUNT(*) FROM movies")
        row_files = await self.fetchone("SELECT COUNT(*), SUM(file_size) FROM files")
        
        t_movies = 0
        if row_movies:
            t_movies = list(row_movies.values())[0] or 0
            
        t_files = 0
        t_size = 0
        if row_files:
            keys = list(row_files.keys())
            t_files = row_files[keys[0]] or 0
            t_size = row_files[keys[1]] or 0
            
        return {
            "total_movies": t_movies,
            "total_files": t_files,
            "total_size_bytes": t_size
        }
