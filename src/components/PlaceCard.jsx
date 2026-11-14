import React from "react";
import { useCurrency } from "../context/CurrencyContext";

export default function PlaceCard({ 
  place, 
  onSelect, 
  onToggleWishlist, 
  isWishlisted,
  currentUser,
  onEditPlace
}) {
  const { formatPrice } = useCurrency();
  return (
    <div className="card place-card hover-lift">
      <div className="card-image-container">
        <img 
          src={place.image} 
          alt={place.name} 
          className="card-image"
          loading="lazy" 
        />
        <div className="card-overlay"></div>
        
        {/* Category & Location Badges */}
        <span className="badge category-badge">{place.category}</span>
        <span className="badge city-badge">
          📍 {place.city}, {place.country}
        </span>

        {/* Wishlist Button */}
        <button 
          className={`wishlist-icon-btn ${isWishlisted ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(place.id, "place");
          }}
          title={isWishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
          aria-label="Wishlist"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isWishlisted ? "#ef4444" : "none"} stroke={isWishlisted ? "#ef4444" : "#ffffff"} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>

        {/* Admin Quick Edit Button */}
        {currentUser && currentUser.role === "Admin" && onEditPlace && (
          <button 
            className="admin-quick-edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditPlace(place);
            }}
            title="Edit Place Details (Admin)"
          >
            ✏️ Edit
          </button>
        )}
      </div>

      <div className="card-content">
        <div className="card-rating">
          <span className="star-icon">⭐</span>
          <span className="rating-score">{place.rating}</span>
          <span className="reviews-count">({place.reviewsCount.toLocaleString()} reviews)</span>
        </div>

        <h3 className="card-title" onClick={() => onSelect(place)}>
          {place.name}
        </h3>

        <p className="card-description">
          {place.description.substring(0, 110)}...
        </p>

        <div className="place-opening-info">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>{place.openingHours}</span>
        </div>

        <div className="card-footer">
          <div className="price-tag">
            <span className="price-prefix">Ticket from</span>
            <span className="price-amount">{formatPrice(place.ticketPrice)}</span>
            <span className="price-suffix">/ person</span>
          </div>

          <button className="btn-primary card-btn" onClick={() => onSelect(place)}>
            Book Ticket
          </button>
        </div>
      </div>
    </div>
  );
}
