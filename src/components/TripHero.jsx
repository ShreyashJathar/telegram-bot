import React, { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";

export default function TripHero({
  currentView = "explore-hotels",
  setCurrentView,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  checkIn,
  setCheckIn,
  checkOut,
  setCheckOut,
  guestsCount,
  setGuestsCount,
  onOpenAuth,
  currentUser
}) {
  const [activeTab, setActiveTab] = useState("hotels");
  const [flightFrom, setFlightFrom] = useState("Mumbai (BOM)");
  const [flightTo, setFlightTo] = useState("Goa (GOI)");
  const [selectedClass, setSelectedClass] = useState("Economy");
  const [copiedCoupon, setCopiedCoupon] = useState("");
  const { formatPrice } = useCurrency();

  const handleTabSwitch = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey === "hotels") setCurrentView("explore-hotels");
    else if (tabKey === "flights" || tabKey === "combo") setCurrentView("explore-flights");
    else if (tabKey === "tours") setCurrentView("explore");
    else if (tabKey === "places") setCurrentView("explore-places");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (activeTab === "hotels") setCurrentView("explore-hotels");
    else if (activeTab === "flights" || activeTab === "combo") setCurrentView("explore-flights");
    else if (activeTab === "tours") setCurrentView("explore");
    else if (activeTab === "places") setCurrentView("explore-places");

    const element = document.getElementById("main-travel-inventory");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const copyCouponCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCoupon(code);
    setTimeout(() => setCopiedCoupon(""), 2500);
  };

  return (
    <section className="trip-hero-section">
      <div className="trip-hero-banner">
        <div className="hero-badge-wrap">
          <span className="hero-tagline-badge">
            <span className="badge-spark">✨</span> Curated Luxury Stays & Worldwide Expeditions
          </span>
        </div>
        <h1 className="trip-hero-headline">Every Check-In is a New Adventure</h1>
        <p className="trip-hero-subheading">
          Handcrafted 5-star villas, serene alpine chalets, seamless flights, and bespoke guided tours worldwide.
        </p>

        <div className="trip-guarantee-ribbon">
          <span className="guarantee-pill"><strong style={{ color: "#00df89" }}>✓</strong> Best Price Match</span>
          <span className="divider">•</span>
          <span className="guarantee-pill">📅 Free Reschedule Guarantee</span>
          <span className="divider">•</span>
          <span className="guarantee-pill">💳 Verified Luxury Stay</span>
          <span className="divider">•</span>
          <span className="guarantee-pill">⚡ 24/7 VIP Concierge</span>
        </div>

        {/* White Trip.com Floating Search Console */}
        <div className="trip-search-box-card">
          {/* Top Service Tabs */}
          <div className="trip-service-tabs-header">
            <button 
              className={`trip-tab-btn ${activeTab === "hotels" ? "active" : ""}`}
              onClick={() => handleTabSwitch("hotels")}
            >
              <span className="tab-icon">🏨</span>
              <span className="tab-text">Hotels & Homes</span>
            </button>
            <button 
              className={`trip-tab-btn ${activeTab === "flights" ? "active" : ""}`}
              onClick={() => handleTabSwitch("flights")}
            >
              <span className="tab-icon">✈️</span>
              <span className="tab-text">Flights</span>
            </button>
            <button 
              className={`trip-tab-btn ${activeTab === "combo" ? "active" : ""}`}
              onClick={() => handleTabSwitch("combo")}
            >
              <span className="tab-icon">🏨✈️</span>
              <span className="tab-text">Flight + Hotel</span>
            </button>
            <button 
              className={`trip-tab-btn ${activeTab === "tours" ? "active" : ""}`}
              onClick={() => handleTabSwitch("tours")}
            >
              <span className="tab-icon">🧳</span>
              <span className="tab-text">Luxury Tours</span>
            </button>
            <button 
              className={`trip-tab-btn ${activeTab === "places" ? "active" : ""}`}
              onClick={() => handleTabSwitch("places")}
            >
              <span className="tab-icon">🎡</span>
              <span className="tab-text">Attractions</span>
            </button>
          </div>

          {/* Search Inputs Bar */}
          <form className="trip-search-inputs-row" onSubmit={handleSearchSubmit}>
            {activeTab === "hotels" && (
              <>
                <div className="search-input-unit location-unit">
                  <label>Destination / Hotel Name</label>
                  <div className="input-flex">
                    <span className="icon">📍</span>
                    <input
                      type="text"
                      placeholder="Where to? (e.g. Goa, Paris, Swiss Alps)"
                      value={searchQuery || ""}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="search-input-unit dates-unit">
                  <label>Check-in / Check-out</label>
                  <div className="input-flex">
                    <span className="icon">📅</span>
                    <input
                      type="date"
                      value={checkIn || ""}
                      onChange={(e) => setCheckIn && setCheckIn(e.target.value)}
                    />
                    <span className="date-sep">&rarr;</span>
                    <input
                      type="date"
                      value={checkOut || ""}
                      onChange={(e) => setCheckOut && setCheckOut(e.target.value)}
                    />
                  </div>
                </div>

                <div className="search-input-unit rooms-unit">
                  <label>Rooms & Guests</label>
                  <div className="input-flex">
                    <span className="icon">👤</span>
                    <select
                      value={guestsCount || 1}
                      onChange={(e) => setGuestsCount && setGuestsCount(Number(e.target.value))}
                    >
                      <option value="1">1 room, 1 adult</option>
                      <option value="2">1 room, 2 adults</option>
                      <option value="3">1 room, 3 adults</option>
                      <option value="4">2 rooms, 4 adults</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {(activeTab === "flights" || activeTab === "combo") && (
              <>
                <div className="search-input-unit location-unit">
                  <label>Origin & Destination</label>
                  <div className="input-flex">
                    <span className="icon">🛫</span>
                    <input
                      type="text"
                      placeholder="From"
                      value={flightFrom}
                      onChange={(e) => setFlightFrom(e.target.value)}
                    />
                    <span className="date-sep">&rarr;</span>
                    <input
                      type="text"
                      placeholder="To"
                      value={flightTo}
                      onChange={(e) => setFlightTo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="search-input-unit dates-unit">
                  <label>Departure Date</label>
                  <div className="input-flex">
                    <span className="icon">📅</span>
                    <input type="date" defaultValue="2026-11-05" />
                  </div>
                </div>

                <div className="search-input-unit rooms-unit">
                  <label>Cabin Class</label>
                  <div className="input-flex">
                    <span className="icon">💺</span>
                    <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                      <option value="Economy">Economy</option>
                      <option value="Premium Economy">Premium Economy</option>
                      <option value="Business">Business Class</option>
                      <option value="First">First Class</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {(activeTab === "tours" || activeTab === "places") && (
              <>
                <div className="search-input-unit location-unit" style={{ flex: 2 }}>
                  <label>Explore Experiences</label>
                  <div className="input-flex">
                    <span className="icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search guided luxury tours, scuba diving, safaris..."
                      value={searchQuery || ""}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="search-input-unit rooms-unit">
                  <label>Category</label>
                  <div className="input-flex">
                    <span className="icon">🏷️</span>
                    <select
                      value={selectedCategory || "Nature"}
                      onChange={(e) => setSelectedCategory && setSelectedCategory(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      <option value="Nature">Nature & Scenic</option>
                      <option value="Adventure">Adventure & Trek</option>
                      <option value="Cultural">Heritage & Cultural</option>
                      <option value="Beach">Beaches & Coastal</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <button type="submit" className="trip-search-action-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Search</span>
            </button>
          </form>

          {/* Bottom Incentive Strip */}
          <div className="trip-search-bottom-strip">
            {!currentUser ? (
              <span className="incentive-text" onClick={onOpenAuth} style={{ cursor: "pointer" }}>
                🔑 <strong style={{ color: "#2563eb", textDecoration: "underline" }}>Sign in or register</strong> to unlock exclusive Safar coupons & instant reward points
              </span>
            ) : (
              <span className="incentive-text">
                ⭐ Welcome back, <strong>{currentUser.fullName || "Traveler"}</strong>! VIP Member savings active on all bookings.
              </span>
            )}
          </div>
        </div>

        {/* Quick Trending Exploration Chips */}
        <div className="hero-quick-filter-strip">
          <span className="quick-filter-title">Popular Escapes:</span>
          <div className="quick-filter-chips">
            {[
              { label: "🏖️ Beachfront Resorts", val: "Beach" },
              { label: "🏔️ Alpine Chalets", val: "Nature" },
              { label: "🏰 Royal Heritage", val: "Cultural" },
              { label: "🏕️ Wilderness Safaris", val: "Adventure" },
              { label: "⭐ Ultra Luxury Villas", val: "Luxury" }
            ].map((chip) => (
              <button
                key={chip.val}
                type="button"
                className={`quick-filter-chip ${selectedCategory === chip.val ? "active" : ""}`}
                onClick={() => {
                  if (setSelectedCategory) setSelectedCategory(chip.val);
                  if (setSearchQuery) setSearchQuery("");
                  const el = document.getElementById("main-travel-inventory");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Promo Deals Shelf */}
        <div className="trip-promo-shelf">
          <div className="shelf-header">
            <h3>New User & Exclusive Flash Deals</h3>
            <span className="shelf-subtitle">Apply these promo codes directly at checkout</span>
          </div>

          <div className="promo-cards-grid">
            <div className="promo-deal-card">
              <div className="deal-discount">10% OFF</div>
              <div className="deal-info">
                <h4>Safar Special Offer</h4>
                <p>Valid on all 5-star hotels & luxury voyages worldwide</p>
              </div>
              <button 
                className={`copy-code-btn ${copiedCoupon === "SAFAR10" ? "copied" : ""}`}
                onClick={() => copyCouponCode("SAFAR10")}
              >
                {copiedCoupon === "SAFAR10" ? "COPIED! ✓" : "CODE: SAFAR10"}
              </button>
            </div>

            <div className="promo-deal-card">
              <div className="deal-discount">{formatPrice(500)} FLAT</div>
              <div className="deal-info">
                <h4>First Journey Welcome Gift</h4>
                <p>Instant flat deduction for newly verified accounts</p>
              </div>
              <button 
                className={`copy-code-btn ${copiedCoupon === "FIRSTTRIP" ? "copied" : ""}`}
                onClick={() => copyCouponCode("FIRSTTRIP")}
              >
                {copiedCoupon === "FIRSTTRIP" ? "COPIED! ✓" : "CODE: FIRSTTRIP"}
              </button>
            </div>

            <div className="promo-deal-card">
              <div className="deal-discount">15% OFF</div>
              <div className="deal-info">
                <h4>VIP Luxury Retreat Voucher</h4>
                <p>Private villas, chalets, and international resorts</p>
              </div>
              <button 
                className={`copy-code-btn ${copiedCoupon === "LUXURY2026" ? "copied" : ""}`}
                onClick={() => copyCouponCode("LUXURY2026")}
              >
                {copiedCoupon === "LUXURY2026" ? "COPIED! ✓" : "CODE: LUXURY2026"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
