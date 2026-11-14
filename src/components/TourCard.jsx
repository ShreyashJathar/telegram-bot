import React from "react";
import { useCurrency } from "../context/CurrencyContext";

export default function TourCard({ 
  tour, 
  onSelectTour, 
  isWishlisted, 
  onToggleWishlist,
  currentUser,
  onEditTour
}) {
  const { formatPrice } = useCurrency();

  const handleWishlistClick = (e) => {
    e.stopPropagation();
    onToggleWishlist(tour.id);
  };

  return (
    <div className="tour-card" onClick={() => onSelectTour(tour)}>
      {/* Tour Image Wrapper */}
      <div className="card-image-wrapper">
        <img src={tour.image} alt={tour.title} className="tour-card-img" loading="lazy" />
        
        {/* Category Tag */}
        <span className="tour-category-tag">{tour.category}</span>
        
        {/* Admin Edit Button */}
        {currentUser && currentUser.role === "Admin" && (
          <button 
            className="card-wishlist-btn active"
            style={{ background: "#00df89", color: "#0b132a", fontWeight: "bold" }}
            onClick={(e) => {
              e.stopPropagation();
              if (onEditTour) onEditTour(tour);
            }}
            title="Edit package details"
          >
            ✏️
          </button>
        )}

        {/* Wishlist Button (Passenger only) */}
        {(!currentUser || currentUser.role !== "Admin") && (
          <button 
            className={`card-wishlist-btn ${isWishlisted ? "active" : ""}`}
            onClick={handleWishlistClick}
            title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-label="Wishlist"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isWishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        )}

        {/* Rating Overlay */}
        <div className="card-rating-overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>{tour.rating}</span>
          <span className="reviews-count">({tour.reviewsCount})</span>
        </div>
      </div>

      {/* Tour Details */}
      <div className="card-content">
        <div className="card-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>{tour.location}</span>
        </div>

        <h3 className="card-title">{tour.title}</h3>
        <p className="card-desc-snippet">{tour.description.slice(0, 85)}...</p>

        <div className="card-footer-row">
          <div className="card-duration">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>{tour.duration} Days</span>
          </div>

          <div className="card-price-section">
            <span className="price-label">From</span>
            <span className="price-amount">{formatPrice(tour.price)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
