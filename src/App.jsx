import React, { useState, useEffect } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import TripSidebar from "./components/TripSidebar";
import TripHero from "./components/TripHero";
import SupportModal from "./components/SupportModal";
import FindBookingModal from "./components/FindBookingModal";
import TicketVoucherModal from "./components/TicketVoucherModal";
import { CurrencyProvider } from "./context/CurrencyContext";
import TourCard from "./components/TourCard";
import HotelCard from "./components/HotelCard";
import TourDetailsModal from "./components/TourDetailsModal";
import HotelDetailsModal from "./components/HotelDetailsModal";
import PlaceDetailsModal from "./components/PlaceDetailsModal";
import PlacesExplorer from "./components/PlacesExplorer";
import FlightsExplorer from "./components/FlightsExplorer";
import BookingWizard from "./components/BookingWizard";
import Dashboard from "./components/Dashboard";
import AdminPanel from "./components/AdminPanel";
import AuthModal from "./components/AuthModal";
import LoginPage from "./components/LoginPage";
import ErrorBoundary from "./components/ErrorBoundary";
import CommunityStories from "./components/CommunityStories";
import { initialTours } from "./data/tours";
import { initialHotels } from "./data/hotels";
import { initialPlaces } from "./data/places";
import { initialFlights } from "./data/flights";
import { subscribeToAuthChanges, logOut } from "./firebase";
import {
  checkDatabaseHealth,
  fetchToursFromDb,
  createTourInDb,
  updateTourInDb,
  deleteTourFromDb,
  addTourReviewInDb,
  fetchHotelsFromDb,
  createHotelInDb,
  updateHotelInDb,
  deleteHotelFromDb,
  addHotelReviewInDb,
  fetchPlacesFromDb,
  addPlaceReviewInDb,
  fetchFlightsFromDb,
  fetchAllBookingsFromDb,
  createBookingInDb,
  updateBookingStatusInDb,
  cancelBookingInDb,
  fetchUserWishlistFromDb,
  toggleWishlistInDb,
  triggerDbReseed
} from "./services/api";

export default function App() {
  // Global States
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem("currentUser");
    return saved ? JSON.parse(saved) : null;
  });

  const [tours, setTours] = useState(() => {
    const saved = localStorage.getItem("tours");
    const initialMap = new Map(initialTours.map(t => [t.id, t]));
    if (saved) {
      const parsed = JSON.parse(saved);
      const existingIds = new Set(parsed.map(t => t.id));
      const missingInitial = initialTours.filter(t => !existingIds.has(t.id));
      const merged = [...parsed, ...missingInitial];
      return merged.map(t => {
        const fresh = initialMap.get(t.id);
        if (fresh && fresh.image) {
          return { ...t, image: fresh.image };
        }
        return t;
      });
    }
    return initialTours;
  });

  const [hotels, setHotels] = useState(() => {
    const saved = localStorage.getItem("hotels");
    const initialMap = new Map(initialHotels.map(h => [h.id, h]));
    if (saved) {
      const parsed = JSON.parse(saved);
      const existingIds = new Set(parsed.map(h => h.id));
      const missingInitial = initialHotels.filter(h => !existingIds.has(h.id));
      const merged = [...parsed, ...missingInitial];
      return merged.map(h => {
        const fresh = initialMap.get(h.id);
        if (fresh && fresh.image) {
          return { ...h, image: fresh.image };
        }
        return h;
      });
    }
    return initialHotels;
  });

  const [places, setPlaces] = useState(() => {
    const saved = localStorage.getItem("places");
    return saved ? JSON.parse(saved) : initialPlaces;
  });

  const [flights, setFlights] = useState(() => {
    const saved = localStorage.getItem("flights");
    return saved ? JSON.parse(saved) : initialFlights;
  });

  const [bookings, setBookings] = useState(() => {
    const saved = localStorage.getItem("bookings");
    return saved ? JSON.parse(saved) : [];
  });

  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem("wishlist");
    return saved ? JSON.parse(saved) : [];
  });

  // Database Connection State
  const [dbStatus, setDbStatus] = useState({
    connected: false,
    database: "safar_db",
    host: "localhost",
    port: 3306,
    stats: {}
  });

  // UI States
  const [currentView, setCurrentView] = useState("explore"); // explore, explore-hotels, explore-places, explore-flights, travel-guides, dashboard, admin
  const [selectedTour, setSelectedTour] = useState(null);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeBookingData, setActiveBookingData] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [findBookingModalOpen, setFindBookingModalOpen] = useState(false);
  const [activeVoucherBooking, setActiveVoucherBooking] = useState(null);
  
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : true;
  });

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Nature");
  
  // Dynamic Max Price slider limits
  const maxTourPriceLimit = Math.max(...tours.map(t => t.price), 3000);
  const maxHotelPriceLimit = Math.max(...hotels.map(h => h.price), 500);
  const [maxPrice, setMaxPrice] = useState(3000);

  // Admin Quick Editing states
  const [initialEditingTour, setInitialEditingTour] = useState(null);
  const [initialEditingHotel, setInitialEditingHotel] = useState(null);

  const handleEditTourFromCardOrModal = (tourToEdit) => {
    setSelectedTour(null);
    setInitialEditingTour(tourToEdit);
    setInitialEditingHotel(null);
    setCurrentView("admin");
  };

  const handleEditHotelFromCardOrModal = (hotelToEdit) => {
    setSelectedHotel(null);
    setInitialEditingHotel(hotelToEdit);
    setInitialEditingTour(null);
    setCurrentView("admin");
  };

  // Hotel search states
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestsCount, setGuestsCount] = useState(1);

  // Toast Notifications State
  const [toasts, setToasts] = useState([]);

  // Error simulation states
  const [shouldCrash, setShouldCrash] = useState(false);

  // Database Synchronization Helper
  const refreshDatabaseState = async () => {
    try {
      const health = await checkDatabaseHealth();
      if (health && health.database) {
        setDbStatus(health.database);
        if (health.database.connected) {
          const [dbTours, dbHotels, dbPlaces, dbFlights, dbBookings] = await Promise.allSettled([
            fetchToursFromDb(),
            fetchHotelsFromDb(),
            fetchPlacesFromDb(),
            fetchFlightsFromDb(),
            fetchAllBookingsFromDb()
          ]);
          if (dbTours.status === 'fulfilled' && dbTours.value?.length > 0) setTours(dbTours.value);
          if (dbHotels.status === 'fulfilled' && dbHotels.value?.length > 0) setHotels(dbHotels.value);
          if (dbPlaces.status === 'fulfilled' && dbPlaces.value?.length > 0) setPlaces(dbPlaces.value);
          if (dbFlights.status === 'fulfilled' && dbFlights.value?.length > 0) setFlights(dbFlights.value);
          if (dbBookings.status === 'fulfilled' && dbBookings.value?.length > 0) setBookings(dbBookings.value);
        }
      }
      return health;
    } catch (err) {
      console.warn("[Database Sync]", err.message);
    }
  };

  // Initial Sync and Periodic Health Polling
  useEffect(() => {
    refreshDatabaseState();
    const interval = setInterval(refreshDatabaseState, 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Wishlist from Database for Authenticated User
  useEffect(() => {
    if (currentUser?.email) {
      fetchUserWishlistFromDb(currentUser.email)
        .then((dbList) => {
          if (dbList && dbList.length > 0) setWishlist(dbList);
        })
        .catch(() => {});
    }
  }, [currentUser]);

  // Sync state to local storage (for fallback)
  useEffect(() => {
    localStorage.setItem("tours", JSON.stringify(tours));
  }, [tours]);

  useEffect(() => {
    localStorage.setItem("hotels", JSON.stringify(hotels));
  }, [hotels]);

  useEffect(() => {
    localStorage.setItem("places", JSON.stringify(places));
  }, [places]);

  useEffect(() => {
    localStorage.setItem("flights", JSON.stringify(flights));
  }, [flights]);

  useEffect(() => {
    localStorage.setItem("bookings", JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem("wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Adjust max budget slider when switching views
  useEffect(() => {
    if (currentView === "explore-hotels") {
      setMaxPrice(maxHotelPriceLimit);
    }
    setSearchQuery(""); // Clear search query when changing tabs
  }, [currentView]);

  // Toast Helper
  const addToast = (message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Error crash simulator helper
  const handleResetAfterCrash = () => {
    setShouldCrash(false);
    setCurrentView("explore");
    addToast("Application state recovered safely.", "info");
  };

  // Wishlist actions
  const handleToggleWishlist = async (id) => {
    if (!currentUser) {
      setCurrentView("login");
      return;
    }
    
    const willRemove = wishlist.includes(id);
    setWishlist((prev) => {
      if (willRemove) {
        addToast("Removed from saved wishlist.", "info");
        return prev.filter(item => item !== id);
      } else {
        addToast("Added to saved wishlist!");
        return [...prev, id];
      }
    });

    try {
      if (currentUser?.email) {
        await toggleWishlistInDb(currentUser.email, id, "tour");
      }
    } catch (err) {
      console.warn("[Wishlist Sync Error]", err.message);
    }
  };

  // Firebase Auth state listener effect
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        localStorage.setItem("currentUser", JSON.stringify(firebaseUser));
      }
    });
    return () => unsubscribe();
  }, []);

  // Auth actions
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    addToast(`Signed in successfully as ${user.fullName}.`);
    if (user.role === "Admin") {
      setCurrentView("admin");
    } else {
      setCurrentView("explore");
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();
    } catch (err) {
      console.error("Firebase logout error:", err);
    }
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    setCurrentView("explore");
    addToast("Logged out successfully.", "info");
  };

  // Booking actions
  const handleStartBooking = (bookingRequest) => {
    if (!currentUser) {
      setCurrentView("login");
      return;
    }
    setActiveBookingData(bookingRequest);
  };

  const handleCompleteBooking = async (newBooking) => {
    setBookings((prev) => [newBooking, ...prev]);
    setActiveBookingData(null);
    setSelectedTour(null);
    setSelectedHotel(null);
    addToast(
      newBooking.bookingType === "hotel" 
        ? "Hotel stay reservation confirmed successfully!" 
        : "Tour transaction confirmed successfully!"
    );
    
    // Automatically redirect travelers to dashboard to view ticket
    setCurrentView("dashboard");

    try {
      const savedInDb = await createBookingInDb(newBooking);
      if (savedInDb) {
        setBookings((prev) => prev.map(b => b.bookingId === newBooking.bookingId ? savedInDb : b));
        refreshDatabaseState();
      }
    } catch (dbErr) {
      console.warn("[Booking Database Persistence]:", dbErr.message);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (confirm("Are you sure you want to cancel this booking? This action cannot be undone.")) {
      setBookings((prev) =>
        prev.map(b => b.bookingId === bookingId ? { ...b, status: "Cancelled" } : b)
      );
      addToast("Reservation cancelled successfully.", "info");

      try {
        await cancelBookingInDb(bookingId);
        refreshDatabaseState();
      } catch (err) {
        console.warn("[Booking Cancel Error]:", err.message);
      }
    }
  };

  // Admin Actions for Tours
  const handleAddTour = async (tourPayload) => {
    const newId = tours.length > 0 ? Math.max(...tours.map(t => t.id)) + 1 : 1;
    const newTour = {
      ...tourPayload,
      id: newId,
      rating: 5.0,
      reviewsCount: 0,
      reviews: []
    };
    setTours((prev) => [newTour, ...prev]);
    addToast("New tour package published successfully!");

    try {
      const dbRes = await createTourInDb(tourPayload);
      if (dbRes) {
        setTours((prev) => prev.map(t => t.id === newId ? dbRes : t));
        refreshDatabaseState();
      }
    } catch (err) {
      console.warn("[Tour Create DB Error]:", err.message);
    }
  };

  const handleUpdateTour = async (updatedTour) => {
    setTours((prev) =>
      prev.map(t => t.id === updatedTour.id ? updatedTour : t)
    );
    addToast("Tour package modifications saved.");

    try {
      await updateTourInDb(updatedTour.id, updatedTour);
      refreshDatabaseState();
    } catch (err) {
      console.warn("[Tour Update DB Error]:", err.message);
    }
  };

  const handleDeleteTour = async (tourId) => {
    setTours((prev) => prev.filter(t => t.id !== tourId));
    setWishlist((prev) => prev.filter(id => id !== tourId));
    addToast("Tour package removed from active list.", "info");

    try {
      await deleteTourFromDb(tourId);
      refreshDatabaseState();
    } catch (err) {
      console.warn("[Tour Delete DB Error]:", err.message);
    }
  };

  // Admin Actions for Hotels
  const handleAddHotel = async (hotelPayload) => {
    const newId = hotels.length > 0 ? Math.max(...hotels.map(h => h.id)) + 1 : 101;
    const newHotel = {
      ...hotelPayload,
      id: newId,
      rating: 5.0,
      reviewsCount: 0,
      reviews: []
    };
    setHotels((prev) => [newHotel, ...prev]);
    addToast("New hotel property published successfully!");

    try {
      const dbRes = await createHotelInDb(hotelPayload);
      if (dbRes) {
        setHotels((prev) => prev.map(h => h.id === newId ? dbRes : h));
        refreshDatabaseState();
      }
    } catch (err) {
      console.warn("[Hotel Create DB Error]:", err.message);
    }
  };

  const handleUpdateHotel = async (updatedHotel) => {
    setHotels((prev) =>
      prev.map(h => h.id === updatedHotel.id ? updatedHotel : h)
    );
    addToast("Hotel property modifications saved.");

    try {
      await updateHotelInDb(updatedHotel.id, updatedHotel);
      refreshDatabaseState();
    } catch (err) {
      console.warn("[Hotel Update DB Error]:", err.message);
    }
  };

  const handleDeleteHotel = async (hotelId) => {
    setHotels((prev) => prev.filter(h => h.id !== hotelId));
    setWishlist((prev) => prev.filter(id => id !== hotelId));
    addToast("Hotel property removed from active database.", "info");

    try {
      await deleteHotelFromDb(hotelId);
      refreshDatabaseState();
    } catch (err) {
      console.warn("[Hotel Delete DB Error]:", err.message);
    }
  };

  const handleUpdateBookingStatus = async (bookingId, status) => {
    setBookings((prev) =>
      prev.map(b => b.bookingId === bookingId ? { ...b, status: status } : b)
    );
    addToast(`Reservation status updated to: ${status}.`);

    try {
      await updateBookingStatusInDb(bookingId, status);
      refreshDatabaseState();
    } catch (err) {
      console.warn("[Booking Status DB Error]:", err.message);
    }
  };

  const handleReseedDatabase = async () => {
    try {
      await triggerDbReseed();
      await refreshDatabaseState();
      addToast("Database tables re-seeded and synchronized successfully!");
    } catch (err) {
      addToast(`Reseed error: ${err.message}`, "error");
    }
  };

  // Reviews actions
  const handleAddReview = async (id, param2, param3) => {
    if (typeof param2 === "string") {
      // Called as: handleAddReview(placeId, "place", reviewObj)
      const itemType = param2;
      const reviewObj = param3;
      if (itemType === "place") {
        setPlaces((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, reviews: [reviewObj, ...(p.reviews || [])] } : p
          )
        );
        addPlaceReviewInDb(id, reviewObj).catch(() => {});
      } else if (itemType === "tour") {
        setTours((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, reviews: [reviewObj, ...(t.reviews || [])] } : t
          )
        );
        addTourReviewInDb(id, reviewObj).catch(() => {});
      } else if (itemType === "hotel") {
        setHotels((prev) =>
          prev.map((h) =>
            h.id === id ? { ...h, reviews: [reviewObj, ...(h.reviews || [])] } : h
          )
        );
        addHotelReviewInDb(id, reviewObj).catch(() => {});
      }
    } else {
      // Called as: handleAddReview(id, reviewObj, isHotel)
      const reviewObj = param2;
      const isHotel = param3;
      if (!isHotel) {
        setTours((prevTours) => {
          return prevTours.map((t) => {
            if (t.id === id) {
              const updatedReviews = [reviewObj, ...(t.reviews || [])];
              const newCount = updatedReviews.length;
              const newRating = Number((updatedReviews.reduce((sum, r) => sum + r.rating, 0) / newCount).toFixed(1));
              return { ...t, reviews: updatedReviews, reviewsCount: newCount, rating: newRating };
            }
            return t;
          });
        });
        addTourReviewInDb(id, reviewObj).catch(() => {});
      } else {
        setHotels((prevHotels) => {
          return prevHotels.map((h) => {
            if (h.id === id) {
              const updatedReviews = [reviewObj, ...(h.reviews || [])];
              const newCount = updatedReviews.length;
              const newRating = Number((updatedReviews.reduce((sum, r) => sum + r.rating, 0) / newCount).toFixed(1));
              return { ...h, reviews: updatedReviews, reviewsCount: newCount, rating: newRating };
            }
            return h;
          });
        });
        addHotelReviewInDb(id, reviewObj).catch(() => {});
      }
    }
    addToast("Your review was posted successfully!");
  };

  // Filter tours based on search inputs
  const filteredTours = tours.filter((tour) => {
    const matchesQuery = 
      tour.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tour.location.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = 
      selectedCategory === "All" || 
      tour.category.toLowerCase() === selectedCategory.toLowerCase();

    const matchesPrice = tour.price <= maxPrice;

    return matchesQuery && matchesCategory && matchesPrice;
  });

  // Filter hotels based on search inputs
  const filteredHotels = hotels.filter((hotel) => {
    const matchesQuery = 
      hotel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hotel.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPrice = hotel.price <= maxPrice;

    return matchesQuery && matchesPrice;
  });

  // CRITICAL MOCK CRASH TRAP FOR ERROR BOUNDARY (500)
  if (shouldCrash) {
    throw new Error("ERR_CONNECTION_FAILURE: Loss of connection to node-US-East-01. Data synchronization failed.");
  }

  // 401 Unauthorized Error Page Component Render Helper
  const render401Page = () => (
    <div className="error-page-container unauthorized animate-fade">
      <div className="error-card glassmorphic-modal">
        <div className="error-graphic-wrapper">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="error-icon-401">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h1 className="error-title">401</h1>
        <h2 className="error-subtitle">Unauthorized Action</h2>
        <p className="error-desc">
          You do not have the required administrative clearance to access the manager panel. 
          Please sign in using an account with administrator roles.
        </p>
        <div className="error-actions">
          <button className="btn-secondary" onClick={() => setCurrentView("explore")}>
            Return Home
          </button>
          <button className="btn-primary" onClick={() => { setCurrentView("login"); }}>
            Sign In as Admin
          </button>
        </div>
      </div>
    </div>
  );

  // 404 Page Not Found Error Page Component Render Helper
  const render404Page = () => (
    <div className="error-page-container not-found animate-fade">
      <div className="error-card glassmorphic-modal">
        <div className="error-graphic-wrapper">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="error-icon-44">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="8" y1="12" x2="16" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="16"></line>
          </svg>
        </div>
        <h1 className="error-title">404</h1>
        <h2 className="error-subtitle">Destination Not Found</h2>
        <p className="error-desc">
          The flight path, hotel listing details page, or booking form you requested does not exist 
          in our manifests. Let's redirect you back to safety.
        </p>
        <div className="error-actions">
          <button className="btn-primary" onClick={() => setCurrentView("explore")}>
            Back to Active Land
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary onReset={handleResetAfterCrash}>
      <CurrencyProvider>
        <div className="app-layout">
          {/* Navigation Header */}
          <Navbar 
            currentUser={currentUser} 
            onOpenAuth={() => setCurrentView("login")}
            onLogout={handleLogout}
            currentView={currentView}
            setCurrentView={setCurrentView}
            wishlistCount={wishlist.length}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
            onOpenSupport={() => setSupportModalOpen(true)}
            onOpenFindBookings={() => setFindBookingModalOpen(true)}
          />

          {/* Main Content Router */}
          <main className="app-main">
            
            {/* Trip.com Unified Exploration Portal (Hotels, Flights, Tours, Places) */}
            {["explore", "explore-hotels", "explore-places", "explore-flights"].includes(currentView) ? (
              <div className="trip-main-portal-container animate-fade">
                <TripSidebar 
                  currentView={currentView}
                  setCurrentView={setCurrentView}
                  onOpenPlanner={() => alert("Trip.Planner: Plan your custom itinerary, luxury stays, and daily routes with Safar!")}
                />

                <div className="trip-main-content-flow">
                  <TripHero 
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    checkIn={checkIn}
                    setCheckIn={setCheckIn}
                    checkOut={checkOut}
                    setCheckOut={setCheckOut}
                    guestsCount={guestsCount}
                    setGuestsCount={setGuestsCount}
                    onOpenAuth={() => setCurrentView("login")}
                    currentUser={currentUser}
                  />

                  <div id="main-travel-inventory">
                    {/* Explore Tours View */}
                    {currentView === "explore" && (
                      <section className="explore-tours-section">
                        <div className="section-header-row">
                          <div className="section-titles">
                            <h2>Trending Voyages & Tours</h2>
                            <p className="section-subtitle">Specially curated packages matching your filters ({filteredTours.length} found)</p>
                          </div>
                        </div>

                        {filteredTours.length > 0 ? (
                          <div className="tours-grid">
                            {filteredTours.map((tour) => (
                              <TourCard 
                                key={tour.id} 
                                tour={tour} 
                                onSelectTour={setSelectedTour}
                                isWishlisted={wishlist.some(w => (typeof w === 'object' ? w.id === tour.id : w === tour.id))}
                                onToggleWishlist={handleToggleWishlist}
                                currentUser={currentUser}
                                onEditTour={handleEditTourFromCardOrModal}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="dashboard-empty-state">
                            <p>No tours match your search filters. Try broadening your budget or queries!</p>
                          </div>
                        )}

                        {/* Community Stories */}
                        <CommunityStories onSelectTour={setSelectedTour} />
                      </section>
                    )}

                    {/* Explore Hotels View */}
                    {currentView === "explore-hotels" && (
                      <section className="explore-tours-section">
                        <div className="section-header-row">
                          <div className="section-titles">
                            <h2>Premium Hotels & Retreats</h2>
                            <p className="section-subtitle">Handpicked luxury hotels and chalets ({filteredHotels.length} found)</p>
                          </div>
                        </div>

                        {filteredHotels.length > 0 ? (
                          <div className="tours-grid">
                            {filteredHotels.map((hotel) => (
                              <HotelCard 
                                key={hotel.id} 
                                hotel={hotel} 
                                onSelectHotel={setSelectedHotel}
                                isWishlisted={wishlist.some(w => (typeof w === 'object' ? w.id === hotel.id : w === hotel.id))}
                                onToggleWishlist={handleToggleWishlist}
                                currentUser={currentUser}
                                onEditHotel={handleEditHotelFromCardOrModal}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="dashboard-empty-state">
                            <p>No hotels match your filters. Try increasing your maximum nightly budget!</p>
                          </div>
                        )}
                      </section>
                    )}

                    {/* Explore Places & Attractions View */}
                    {currentView === "explore-places" && (
                      <PlacesExplorer 
                        places={places}
                        onSelectPlace={setSelectedPlace}
                        onToggleWishlist={handleToggleWishlist}
                        wishlist={wishlist}
                        currentUser={currentUser}
                      />
                    )}

                    {/* Explore Flights View */}
                    {currentView === "explore-flights" && (
                      <FlightsExplorer 
                        flights={flights}
                        onStartBooking={handleStartBooking}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : null}

          {currentView === "dashboard" && currentUser && (
            <Dashboard 
              currentUser={currentUser}
              bookings={bookings}
              wishlist={wishlist}
              tours={tours}
              hotels={hotels}
              onCancelBooking={handleCancelBooking}
              onSelectTour={setSelectedTour}
              onSelectHotel={setSelectedHotel}
              onToggleWishlist={handleToggleWishlist}
            />
          )}

          {currentView === "admin" && currentUser && (
            currentUser.role === "Admin" ? (
              <AdminPanel 
                tours={tours}
                hotels={hotels}
                bookings={bookings}
                onAddTour={handleAddTour}
                onUpdateTour={handleUpdateTour}
                onDeleteTour={handleDeleteTour}
                onAddHotel={handleAddHotel}
                onUpdateHotel={handleUpdateHotel}
                onDeleteHotel={handleDeleteHotel}
                onUpdateBookingStatus={handleUpdateBookingStatus}
                initialEditingTour={initialEditingTour}
                initialEditingHotel={initialEditingHotel}
                dbStatus={dbStatus}
                onCheckDb={refreshDatabaseState}
                onReseedDb={handleReseedDatabase}
              />
            ) : (
              render401Page()
            )
          )}

          {currentView === "error-401" && render401Page()}
          {currentView === "error-404" && render404Page()}
          {currentView === "login" && (
            <LoginPage 
              onLoginSuccess={handleLoginSuccess} 
              onBack={() => setCurrentView("explore-hotels")}
            />
          )}
        </main>

        {/* Global Footer */}
        {currentView !== "login" && (
          <footer className="main-footer">
            <div className="footer-grid">
              <div>
                <div className="footer-brand" onClick={() => setCurrentView("explore")} style={{ cursor: "pointer" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                  <span>Explore the World with Safar</span>
                </div>
                <p className="footer-tagline">Plan, book, and manage unforgettable trips with ease. From breathtaking destinations to seamless travel experiences, Safar makes every journey memorable.</p>
              </div>

              <div>
                <h4 className="footer-title">Navigation</h4>
                <ul className="footer-links">
                  <li><a href="#explore" onClick={(e) => { e.preventDefault(); setCurrentView("explore"); }}>Tour Packages</a></li>
                  <li><a href="#hotels" onClick={(e) => { e.preventDefault(); setCurrentView("explore-hotels"); }}>Resort Hotels</a></li>
                  <li><a href="#about" onClick={(e) => e.preventDefault()}>About Us</a></li>
                  <li><a href="#contact" onClick={(e) => e.preventDefault()}>Contact Us</a></li>
                </ul>
              </div>

              <div>
                <h4 className="footer-title">Legal</h4>
                <ul className="footer-links">
                  <li><a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a></li>
                  <li><a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy Policy</a></li>
                </ul>
              </div>
            </div>

            <div className="footer-bottom">
              <span>&copy; {new Date().getFullYear()} Safar Inc. All rights reserved.</span>
              <span>Designed by Shreyash and Shashank</span>
            </div>
          </footer>
        )}

        {/* Auth Modal Overlay */}
        <AuthModal 
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />

        {/* Tour Detail Modal Overlay */}
        {selectedTour && (
          <TourDetailsModal 
            tour={tours.find(t => t.id === selectedTour.id)}
            onClose={() => setSelectedTour(null)}
            onStartBooking={handleStartBooking}
            currentUser={currentUser}
            onAddReview={handleAddReview}
            onEditTour={handleEditTourFromCardOrModal}
          />
        )}

        {/* Hotel Detail Modal Overlay */}
        {selectedHotel && (
          <HotelDetailsModal 
            hotel={hotels.find(h => h.id === selectedHotel.id)}
            onClose={() => setSelectedHotel(null)}
            onStartBooking={handleStartBooking}
            currentUser={currentUser}
            onAddReview={handleAddReview}
            onEditHotel={handleEditHotelFromCardOrModal}
          />
        )}

        {/* Place Detail Modal Overlay */}
        {selectedPlace && (
          <PlaceDetailsModal 
            place={places.find(p => p.id === selectedPlace.id) || selectedPlace}
            onClose={() => setSelectedPlace(null)}
            onStartBooking={handleStartBooking}
            currentUser={currentUser}
            onAddReview={handleAddReview}
          />
        )}

        {/* Multi-step Checkout Wizard Overlay */}
        {activeBookingData && (
          <BookingWizard 
            bookingData={activeBookingData}
            currentUser={currentUser}
            onClose={() => setActiveBookingData(null)}
            onCompleteBooking={handleCompleteBooking}
          />
        )}

        {/* Support Modal */}
        <SupportModal 
          isOpen={supportModalOpen} 
          onClose={() => setSupportModalOpen(false)} 
        />

        {/* Find Booking Modal */}
        <FindBookingModal 
          isOpen={findBookingModalOpen} 
          onClose={() => setFindBookingModalOpen(false)} 
          bookings={bookings}
          onSelectBooking={(b) => setActiveVoucherBooking(b)}
        />

        {/* Boarding Pass / E-Ticket Voucher Modal */}
        <TicketVoucherModal 
          booking={activeVoucherBooking} 
          onClose={() => setActiveVoucherBooking(null)} 
        />

        {/* Floating Toast Notification Containers */}
        {toasts.length > 0 && (
          <div className="toast-container">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast-item ${toast.type}`}>
                <span className="toast-icon">
                  {toast.type === "success" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  {toast.type === "error" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  )}
                  {toast.type === "info" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  )}
                </span>
                <span className="toast-message">{toast.message}</span>
                <button className="toast-close-btn" onClick={() => removeToast(toast.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </CurrencyProvider>
    </ErrorBoundary>
  );
}
