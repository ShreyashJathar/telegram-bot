from .start import router as start_router
from .admin import router as admin_router
from .files import router as files_router
from .search import router as search_router

__all__ = ["start_router", "admin_router", "files_router", "search_router"]
