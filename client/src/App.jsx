import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useTitle } from './useTitle.js';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import MovieDetails from './pages/MovieDetails.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Checkout from './pages/Checkout.jsx';
import Notifications from './pages/Notifications.jsx';
import Admin from './pages/admin/Admin.jsx';
import AdminRoute from './components/AdminRoute.jsx';

const NotFound = () => {
  useTitle('Page not found');
  return (
  <div className="text-center py-5">
    <h1 className="display-4">404</h1>
    <p className="text-secondary">That page does not exist.</p>
    <Link to="/" className="btn btn-accent">Back to movies</Link>
  </div>
  );
};

export default function App() {
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const first = useRef(true);
  // single-page apps must move focus on navigation so keyboard / screen-reader users land in the new view
  useEffect(() => { if (first.current) { first.current = false; return; } mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a href="#main" className="visually-hidden-focusable skip-link">Skip to content</a>
      <Navbar />
      <main id="main" ref={mainRef} tabIndex={-1} className="container py-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies/:id" element={<MovieDetails />} />
          <Route path="/shows/:id/seats" element={<SeatSelection />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
          <Route path="/bookings/:id" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />
          <Route path="/bookings/:id/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="container py-4 text-center text-secondary small">
        iMovies — B.Tech CSE project. Payments are simulated; no real transactions occur.
      </footer>
    </>
  );
}
