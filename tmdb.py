import aiohttp
from typing import Dict, Any, Optional, List

class TMDBClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.themoviedb.org/3"
        self.image_base_url = "https://image.tmdb.org/t/p/w500"

    async def search(self, query: str, type_val: str = "movie") -> List[Dict[str, Any]]:
        """
        Searches for a movie or TV show.
        type_val should be 'movie' or 'tv'.
        """
        if not self.api_key:
            return []

        endpoint = f"{self.base_url}/search/{type_val}"
        params = {
            "api_key": self.api_key,
            "query": query,
            "language": "en-US",
            "page": 1
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(endpoint, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = data.get("results", [])
                        parsed_results = []
                        for item in results:
                            # Format details
                            title = item.get("title") if type_val == "movie" else item.get("name")
                            date_key = "release_date" if type_val == "movie" else "first_air_date"
                            release_date = item.get(date_key, "")
                            year = int(release_date.split("-")[0]) if release_date else None
                            
                            poster_path = item.get("poster_path")
                            poster_url = f"{self.image_base_url}{poster_path}" if poster_path else None

                            parsed_results.append({
                                "tmdb_id": item.get("id"),
                                "title": title,
                                "type": "movie" if type_val == "movie" else "series",
                                "description": item.get("overview", ""),
                                "poster_url": poster_url,
                                "year": year,
                                "rating": round(item.get("vote_average", 0.0), 1),
                                "genres": ""  # Detailed fetch needed for genres
                            })
                        return parsed_results
        except Exception as e:
            print(f"Error searching TMDB: {e}")
        return []

    async def get_details(self, tmdb_id: int, type_val: str = "movie") -> Optional[Dict[str, Any]]:
        """
        Fetches detailed information for a specific movie or TV show by its TMDB ID.
        type_val should be 'movie' or 'tv'.
        """
        if not self.api_key:
            return None

        endpoint = f"{self.base_url}/{type_val}/{tmdb_id}"
        params = {
            "api_key": self.api_key,
            "language": "en-US"
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(endpoint, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        # Extract title
                        title = data.get("title") if type_val == "movie" else data.get("name")
                        
                        # Extract year
                        date_key = "release_date" if type_val == "movie" else "first_air_date"
                        release_date = data.get(date_key, "")
                        year = int(release_date.split("-")[0]) if release_date else None
                        
                        # Extract poster
                        poster_path = data.get("poster_path")
                        poster_url = f"{self.image_base_url}{poster_path}" if poster_path else None
                        
                        # Extract genres
                        genres_list = [genre.get("name") for genre in data.get("genres", [])]
                        genres = ", ".join(genres_list) if genres_list else ""
                        
                        return {
                            "tmdb_id": tmdb_id,
                            "title": title,
                            "type": "movie" if type_val == "movie" else "series",
                            "description": data.get("overview", ""),
                            "poster_url": poster_url,
                            "year": year,
                            "rating": round(data.get("vote_average", 0.0), 1),
                            "genres": genres
                        }
        except Exception as e:
            print(f"Error fetching details from TMDB: {e}")
        return None
