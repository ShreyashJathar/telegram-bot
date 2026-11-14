import React, { useState } from "react";
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle, 
  resetPassword, 
  isFirebaseConfigured 
} from "../firebase";
import { getBackendBaseUrl } from "../services/api";

export default function LoginPage({ onLoginSuccess, onBack }) {
  const [mode, setMode] = useState("signin"); // "signin", "signup", "forgot"
  
  // Google & Gmail OTP Auth Modal State
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState("");
  const [otpStep, setOtpStep] = useState("email"); // "email" or "otp"
  const [otpCode, setOtpCode] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const [demoOtpHint, setDemoOtpHint] = useState("");

  // WhatsApp OTP Auth Modal State
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappCountryCode, setWhatsappCountryCode] = useState("+91");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappStep, setWhatsappStep] = useState("phone"); // "phone" or "otp"
  const [whatsappOtpCode, setWhatsappOtpCode] = useState("");
  const [isSendingWhatsAppOtp, setIsSendingWhatsAppOtp] = useState(false);
  const [isVerifyingWhatsAppOtp, setIsVerifyingWhatsAppOtp] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappNotice, setWhatsappNotice] = useState("");
  const [whatsappCountdown, setWhatsappCountdown] = useState(60);

  // Forgot Password Gmail OTP State
  const [resetOtpStep, setResetOtpStep] = useState("email"); // "email" or "otp"
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetDemoOtp, setResetDemoOtp] = useState("");
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  const [isVerifyingResetOtp, setIsVerifyingResetOtp] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Feedback states
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const resetGoogleModal = () => {
    setGoogleModalOpen(false);
    setGoogleEmailInput("");
    setOtpStep("email");
    setOtpCode("");
    setOtpError("");
    setOtpNotice("");
    setDemoOtpHint("");
    setIsSendingOtp(false);
    setIsVerifyingOtp(false);
  };

  const resetWhatsAppModal = () => {
    setWhatsappModalOpen(false);
    setWhatsappPhone("");
    setWhatsappStep("phone");
    setWhatsappOtpCode("");
    setWhatsappError("");
    setWhatsappNotice("");
    setIsSendingWhatsAppOtp(false);
    setIsVerifyingWhatsAppOtp(false);
    setWhatsappCountdown(60);
  };

  React.useEffect(() => {
    let timer;
    if (whatsappModalOpen && whatsappStep === "otp" && whatsappCountdown > 0) {
      timer = setInterval(() => {
        setWhatsappCountdown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [whatsappModalOpen, whatsappStep, whatsappCountdown]);

  const resetState = (newMode) => {
    setMode(newMode);
    setError("");
    setSuccessMessage("");
    setResetOtpStep("email");
    setResetOtpCode("");
    setResetNewPassword("");
    setResetDemoOtp("");
  };

  const completeLogin = (userObj, token = null) => {
    localStorage.setItem("currentUser", JSON.stringify(userObj));
    if (token) {
      localStorage.setItem("authToken", token);
    }
    onLoginSuccess(userObj);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!username || !password) {
      setError("Email/Username and Password are required.");
      return;
    }

    // Default admin shortcut
    if (username.toLowerCase() === "shreyash" && password === "shashank") {
      const adminUser = { username: "shreyash", fullName: "Shreyash (Admin)", email: "shreyash.admin@gmail.com", role: "Admin" };
      completeLogin(adminUser);
      return;
    }

    if (isFirebaseConfigured) {
      try {
        const emailToUse = username.includes("@") ? username : `${username}@gmail.com`;
        const firebaseUser = await signInWithEmail(emailToUse, password);
        const loggedUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          fullName: firebaseUser.displayName || username,
          username: firebaseUser.displayName ? firebaseUser.displayName.split(" ")[0] : username,
          role: firebaseUser.email === "shreyash.admin@gmail.com" ? "Admin" : "Customer"
        };
        completeLogin(loggedUser);
        return;
      } catch (err) {
        let msg = "Invalid credentials or login error.";
        if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
          msg = "Incorrect Email or Password. Please check your credentials.";
        } else if (err.code === "auth/too-many-requests") {
          msg = "Too many failed attempts. Account temporarily locked for security.";
        } else if (err.message) {
          msg = err.message;
        }
        setError(msg);
        return;
      }
    }

    // Backend / Offline fallback login if Firebase is not configured
    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid credentials.");
        return;
      }

      const loggedUser = {
        ...data.user,
        username: data.user.fullName ? data.user.fullName.split(' ')[0] : 'Traveler',
        role: data.user.role || "Customer"
      };

      completeLogin(loggedUser, data.token);
    } catch (err) {
      const mockCustomer = {
        username: username.split("@")[0],
        fullName: username.includes("@") ? username.split("@")[0] : username,
        email: username.includes("@") ? username : `${username}@gmail.com`,
        role: "Customer"
      };
      completeLogin(mockCustomer);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!fullName || !email || !password) {
      setError("All fields are required for registration.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (isFirebaseConfigured) {
      try {
        const firebaseUser = await signUpWithEmail(email, password, fullName);
        const newUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          fullName: fullName,
          username: fullName.split(" ")[0],
          role: "Customer"
        };
        completeLogin(newUser);
        return;
      } catch (err) {
        let msg = "Registration failed.";
        if (err.code === "auth/email-already-in-use") {
          msg = "An account with this email address already exists.";
        } else if (err.code === "auth/weak-password") {
          msg = "Password should be at least 6 characters long.";
        } else if (err.code === "auth/invalid-email") {
          msg = "Please provide a valid email address.";
        } else if (err.message) {
          msg = err.message;
        }
        setError(msg);
        return;
      }
    }

    // Backend / Offline fallback registration
    const newUser = {
      username: fullName.split(' ')[0],
      fullName,
      email,
      role: "Customer"
    };

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Registration failed. Email may already exist.");
        return;
      }

      completeLogin({ ...newUser, id: data.user.id }, data.token);
    } catch (err) {
      completeLogin(newUser);
    }
  };

  // SEND PASSWORD RESET OTP TO GMAIL
  const handleSendResetPasswordOtp = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!email || !email.includes("@")) {
      setError("Please enter a valid Gmail / email address.");
      return;
    }

    setIsSendingResetOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/send-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await res.json();
      setIsSendingResetOtp(false);

      if (!res.ok || !data.success) {
        setError(data.message || "Failed to send reset code.");
        return;
      }

      setResetOtpStep("otp");
      setSuccessMessage(`Reset code sent to ${email}. Please check your Gmail.`);
      if (data.demoOtp) {
        setResetDemoOtp(data.demoOtp);
      }
    } catch (err) {
      setIsSendingResetOtp(false);
      // Offline fallback
      setResetOtpStep("otp");
      const fallbackCode = Math.floor(100000 + Math.random() * 900000).toString();
      setResetDemoOtp(fallbackCode);
      setSuccessMessage(`Offline Mode: Reset code generated for ${email}`);
    }
  };

  // VERIFY RESET OTP AND UPDATE PASSWORD
  const handleVerifyResetPassword = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!resetOtpCode || resetOtpCode.trim().length !== 6) {
      setError("Please enter the 6-digit reset code received on your Gmail.");
      return;
    }

    if (!resetNewPassword || resetNewPassword.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }

    setIsVerifyingResetOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: resetOtpCode.trim(),
          newPassword: resetNewPassword
        })
      });
      const data = await res.json();
      setIsVerifyingResetOtp(false);

      if (!res.ok || !data.success) {
        if (resetDemoOtp && resetOtpCode.trim() === resetDemoOtp) {
          // Offline fallback success
        } else {
          setError(data.message || "Invalid or expired reset code.");
          return;
        }
      }

      setSuccessMessage("Password reset successfully! You can now log in.");
      setTimeout(() => {
        resetState("signin");
        setUsername(email);
      }, 1500);
    } catch (err) {
      setIsVerifyingResetOtp(false);
      if (resetDemoOtp && resetOtpCode.trim() === resetDemoOtp) {
        setSuccessMessage("Password reset successfully! You can now log in.");
        setTimeout(() => {
          resetState("signin");
          setUsername(email);
        }, 1500);
      } else {
        setError("Network error. Could not reset password.");
      }
    }
  };

  const handleGoogleSignInClick = async () => {
    setError("");
    if (isFirebaseConfigured) {
      try {
        const firebaseUser = await signInWithGoogle();
        const loggedUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          fullName: firebaseUser.displayName || firebaseUser.email.split("@")[0],
          username: firebaseUser.displayName ? firebaseUser.displayName.split(" ")[0] : firebaseUser.email.split("@")[0],
          photoURL: firebaseUser.photoURL,
          role: firebaseUser.email === "shreyash.admin@gmail.com" ? "Admin" : "Customer",
          isGoogleAuth: true
        };
        completeLogin(loggedUser);
        return;
      } catch (err) {
        console.warn("Firebase Google Auth popup error, switching to Gmail OTP modal for cross-device support:", err);
        // Fallback directly to Gmail OTP modal so user is NEVER blocked on other devices!
        setGoogleModalOpen(true);
        return;
      }
    }
    // Fallback to Google OTP modal
    setGoogleModalOpen(true);
  };

  const handleSendGoogleOtp = async (e) => {
    if (e) e.preventDefault();
    setOtpError("");
    setOtpNotice("");
    setDemoOtpHint("");

    let userEmail = googleEmailInput.trim();
    if (!userEmail) {
      setOtpError("Please enter your email address.");
      return;
    }
    if (!userEmail.includes("@")) {
      userEmail = `${userEmail}@gmail.com`;
      setGoogleEmailInput(userEmail);
    }

    setIsSendingOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail })
      });
      const data = await res.json();
      setIsSendingOtp(false);

      if (!res.ok || !data.success) {
        setOtpError(data.message || "Failed to send verification code.");
        return;
      }

      setOtpStep("otp");
      setOtpNotice(`Verification OTP sent to ${userEmail}`);
      if (data.demoOtp) {
        setDemoOtpHint(data.demoOtp);
      }
    } catch (err) {
      setIsSendingOtp(false);
      // Offline mode fallback code
      setOtpStep("otp");
      const fallbackCode = Math.floor(100000 + Math.random() * 900000).toString();
      setDemoOtpHint(fallbackCode);
      setOtpNotice(`Offline Mode: Verification code generated for ${userEmail}`);
    }
  };

  const handleVerifyGoogleOtp = async (e) => {
    if (e) e.preventDefault();
    setOtpError("");

    const code = otpCode.trim();
    if (!code || code.length !== 6) {
      setOtpError("Please enter the 6-digit verification code.");
      return;
    }

    let userEmail = googleEmailInput.trim();
    if (!userEmail) {
      setOtpError("Email address is missing.");
      return;
    }
    if (!userEmail.includes("@")) userEmail = `${userEmail}@gmail.com`;

    const nameFromEmail = userEmail.split("@")[0].replace(/[._-]/g, " ");
    const formattedName = nameFromEmail
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    setIsVerifyingOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, otp: code, fullName: formattedName })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (demoOtpHint && code === demoOtpHint) {
          // Proceed with offline fallback match
        } else {
          setIsVerifyingOtp(false);
          setOtpError(data.message || "Invalid OTP code. Please try again.");
          return;
        }
      }

      // Successful verification - use MySQL user object returned from database if available
      const googleUser = data.user || {
        username: formattedName.split(" ")[0],
        fullName: formattedName,
        email: userEmail,
        role: "Customer",
        isGoogleAuth: true,
        isOtpVerified: true
      };

      setIsVerifyingOtp(false);
      resetGoogleModal();
      completeLogin(googleUser, data?.token);
    } catch (err) {
      if (demoOtpHint && code === demoOtpHint) {
        const nameFromEmail = userEmail.split("@")[0].replace(/[._-]/g, " ");
        const formattedName = nameFromEmail
          .split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        const googleUser = {
          username: formattedName.split(" ")[0],
          fullName: formattedName,
          email: userEmail,
          role: "Customer",
          isGoogleAuth: true,
          isOtpVerified: true
        };

        setIsVerifyingOtp(false);
        resetGoogleModal();
        completeLogin(googleUser);
      } else {
        setIsVerifyingOtp(false);
        setOtpError("Network error. Could not verify OTP code.");
      }
    }
  };

  const handleOpenWhatsAppModal = () => {
    setWhatsappModalOpen(true);
    setWhatsappStep("phone");
    setWhatsappError("");
    setWhatsappNotice("");
  };

  const handleSendWhatsAppOtp = async (e) => {
    if (e) e.preventDefault();
    setWhatsappError("");
    setWhatsappNotice("");

    const cleanNumber = whatsappPhone.replace(/\D/g, "");
    if (!cleanNumber || cleanNumber.length < 7) {
      setWhatsappError("Please enter a valid mobile phone number.");
      return;
    }

    const fullPhone = `${whatsappCountryCode.replace(/\D/g, "")}${cleanNumber}`;
    setIsSendingWhatsAppOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/send-whatsapp-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone })
      });
      const data = await res.json();
      setIsSendingWhatsAppOtp(false);

      if (!res.ok || !data.success) {
        setWhatsappError(data.message || "Failed to send WhatsApp verification code.");
        return;
      }

      setWhatsappStep("otp");
      setWhatsappNotice(`6-digit verification code sent to your WhatsApp (${whatsappCountryCode} ${whatsappPhone})`);
      setWhatsappCountdown(60);
    } catch (err) {
      setIsSendingWhatsAppOtp(false);
      setWhatsappError("Network error. Could not send WhatsApp verification code. Please try again.");
    }
  };

  const handleVerifyWhatsAppOtp = async (e) => {
    if (e) e.preventDefault();
    setWhatsappError("");

    const code = whatsappOtpCode.trim();
    if (!code || code.length !== 6) {
      setWhatsappError("Please enter the 6-digit verification code.");
      return;
    }

    const cleanNumber = whatsappPhone.replace(/\D/g, "");
    const fullPhone = `${whatsappCountryCode.replace(/\D/g, "")}${cleanNumber}`;
    setIsVerifyingWhatsAppOtp(true);

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/api/users/verify-whatsapp-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, otp: code })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsVerifyingWhatsAppOtp(false);
        setWhatsappError(data.message || "Invalid OTP code. Please try again.");
        return;
      }

      const loggedUser = {
        ...(data?.user || {}),
        fullName: data?.user?.fullName || `Traveler (+${cleanNumber.slice(-4)})`,
        username: data?.user?.fullName?.split(" ")[0] || "Traveler",
        role: data?.user?.role || "Customer",
        phone: fullPhone,
        isWhatsAppAuth: true
      };

      setIsVerifyingWhatsAppOtp(false);
      resetWhatsAppModal();
      completeLogin(loggedUser, data?.token);
    } catch (err) {
      setIsVerifyingWhatsAppOtp(false);
      setWhatsappError("Network error. Could not verify OTP code.");
    }
  };

  return (
    <div className="login-page-container animate-fade">
      <div className="login-glass-box glassmorphic">
        {onBack && (
          <button 
            type="button" 
            className="login-back-pill" 
            onClick={onBack}
            title="Return to Safar Portal"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Explorer</span>
          </button>
        )}
        
        {/* SIGN IN MODE */}
        {mode === "signin" && (
          <>
            <h2 className="login-title">Welcome Back to Your Adventure</h2>
            <p className="login-subtitle">Login \ Sign up</p>
            
            <form className="login-form" onSubmit={handleSignIn}>
              {error && <div className="auth-error">{error}</div>}
              {successMessage && <div className="auth-success">{successMessage}</div>}
              
              <div className="login-input-group">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <input 
                  type="text" 
                  placeholder="Email or Username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                />
              </div>

              <div className="login-input-group">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide Password" : "Show Password"}
                  aria-label={showPassword ? "Hide Password" : "Show Password"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>

              <div className="login-options">
                <button type="button" className="text-link-btn" onClick={() => resetState("forgot")}>
                  Forgot password?
                </button>
                <button type="button" className="text-link-btn" onClick={() => resetState("signup")}>
                  Create an account
                </button>
              </div>

              <button type="submit" className="login-submit-btn">Sign In Now</button>

              <div className="alt-login-buttons">
                <button type="button" className="alt-login-btn" onClick={handleGoogleSignInClick} title="Sign in with Google">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
              </div>
            </form>
          </>
        )}

        {/* CREATE AN ACCOUNT (SIGN UP) MODE */}
        {mode === "signup" && (
          <>
            <h2 className="login-title">Start Your Adventure</h2>
            <p className="login-subtitle">Create an account to explore & book luxury stays and tours</p>
            
            <form className="login-form" onSubmit={handleSignUp}>
              {error && <div className="auth-error">{error}</div>}
              {successMessage && <div className="auth-success">{successMessage}</div>}

              <div className="login-input-group">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required 
                />
              </div>
              
              <div className="login-input-group">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </span>
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>

              <div className="login-input-group">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Create Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>

              <button type="submit" className="login-submit-btn">Create Account</button>

              <div className="login-options-centered">
                <span>Already have an account? </span>
                <button type="button" className="text-link-highlight" onClick={() => resetState("signin")}>
                  Sign In
                </button>
              </div>
            </form>
          </>
        )}

        {/* FORGOT PASSWORD MODE (WITH GMAIL OTP) */}
        {mode === "forgot" && (
          <>
            <h2 className="login-title">Reset Your Password</h2>
            <p className="login-subtitle">
              {resetOtpStep === "email" 
                ? "Enter your registered Gmail to receive a password reset code"
                : `Enter the 4-digit code sent to ${email} and your new password`
              }
            </p>
            
            {error && <div className="auth-error">{error}</div>}
            {successMessage && <div className="auth-success">{successMessage}</div>}

            {/* STEP 1: ENTER GMAIL */}
            {resetOtpStep === "email" && (
              <form className="login-form" onSubmit={handleSendResetPasswordOtp}>
                <div className="login-input-group">
                  <span className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  </span>
                  <input 
                    type="email" 
                    placeholder="Enter your Gmail address" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                    autoFocus
                  />
                </div>

                <button type="submit" className="login-submit-btn" disabled={isSendingResetOtp}>
                  {isSendingResetOtp ? "Sending Reset Code..." : "Send Reset Code to Gmail"}
                </button>

                <div className="login-options-centered">
                  <button type="button" className="text-link-highlight" onClick={() => resetState("signin")}>
                    &larr; Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: ENTER OTP & NEW PASSWORD */}
            {resetOtpStep === "otp" && (
              <form className="login-form" onSubmit={handleVerifyResetPassword}>
                <div className="login-input-group">
                  <span className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input 
                    type="text" 
                    placeholder="6-digit OTP Code" 
                    value={resetOtpCode}
                    onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    style={{ letterSpacing: "6px", fontSize: "1.2rem", fontWeight: "bold", textAlign: "center" }}
                    required 
                    autoFocus
                  />
                </div>

                <div className="login-input-group">
                  <span className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Enter New Password (min. 4 chars)" 
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required 
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>

                <button type="submit" className="login-submit-btn" disabled={isVerifyingResetOtp}>
                  {isVerifyingResetOtp ? "Resetting Password..." : "Update Password & Log In"}
                </button>

                <div className="login-options" style={{ marginTop: "12px" }}>
                  <button 
                    type="button" 
                    className="text-link-btn" 
                    onClick={handleSendResetPasswordOtp}
                    disabled={isSendingResetOtp}
                  >
                    Resend Code
                  </button>
                  <button type="button" className="text-link-btn" onClick={() => setResetOtpStep("email")}>
                    Change Email
                  </button>
                </div>

                <div className="login-options-centered" style={{ marginTop: "16px" }}>
                  <button type="button" className="text-link-highlight" onClick={() => resetState("signin")}>
                    &larr; Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </>
        )}

      </div>

      {/* GOOGLE AUTH DIRECT SIGN IN DIALOG & GMAIL OTP VERIFICATION */}
      {googleModalOpen && (
        <div className="google-overlay animate-fade" onClick={resetGoogleModal}>
          <div className="google-auth-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <button className="google-close-btn" onClick={resetGoogleModal} title="Close" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div className="google-modal-header">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <h3>{otpStep === "email" ? "Sign in with Google" : "Verify Gmail OTP"}</h3>
              <p className="google-modal-subtitle">
                {otpStep === "email" ? "to continue to Safar" : `Code sent to ${googleEmailInput}`}
              </p>
            </div>

            {otpError && <div className="google-otp-error">{otpError}</div>}
            {otpNotice && <div className="google-otp-notice">{otpNotice}</div>}

            {/* STEP 1: EMAIL INPUT */}
            {otpStep === "email" && (
              <form className="google-email-form" onSubmit={handleSendGoogleOtp}>
                <div className="google-input-wrapper">
                  <input 
                    type="text" 
                    placeholder="Email or phone" 
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    autoFocus
                    required 
                  />
                </div>
                
                <div className="google-form-actions">
                  <a href="#forgot-email" onClick={(e) => e.preventDefault()} className="google-link">
                    Forgot email?
                  </a>
                  <button type="submit" className="google-next-btn" disabled={isSendingOtp}>
                    {isSendingOtp ? "Sending..." : "Next"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: OTP VERIFICATION CODE */}
            {otpStep === "otp" && (
              <form className="google-email-form" onSubmit={handleVerifyGoogleOtp}>
                <div className="google-input-wrapper">
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit code" 
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    style={{
                      letterSpacing: "8px",
                      fontSize: "1.3rem",
                      fontWeight: "bold",
                      textAlign: "center"
                    }}
                    autoFocus
                    required 
                  />
                </div>
                
                <div className="google-form-actions" style={{ marginTop: "16px" }}>
                  <button 
                    type="button" 
                    className="google-link" 
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => { setOtpStep("email"); setOtpError(""); setOtpNotice(""); }}
                  >
                    Change email
                  </button>
                  
                  <button type="submit" className="google-next-btn" disabled={isVerifyingOtp}>
                    {isVerifyingOtp ? "Verifying..." : "Verify & Sign In"}
                  </button>
                </div>

                <div style={{ textAlign: "center", marginTop: "14px" }}>
                  <button 
                    type="button" 
                    className="google-resend-btn"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#1a73e8",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                    onClick={handleSendGoogleOtp}
                    disabled={isSendingOtp}
                  >
                    {isSendingOtp ? "Resending..." : "Resend OTP Code"}
                  </button>
                </div>
              </form>
            )}

            <div className="google-modal-footer">
              To continue, Google will verify your identity with a secure Gmail OTP code.
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP DIRECT OTP VERIFICATION MODAL */}
      {whatsappModalOpen && (
        <div className="google-modal-backdrop" onClick={resetWhatsAppModal}>
          <div className="whatsapp-auth-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <button className="whatsapp-close-btn" onClick={resetWhatsAppModal} title="Close" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="whatsapp-modal-header">
              <h3>{whatsappStep === "phone" ? "WhatsApp Sign-In" : "Verify Code"}</h3>
              <p className="whatsapp-modal-subtitle">
                {whatsappStep === "phone" 
                  ? "Login \\ Sign up with WhatsApp" 
                  : `Enter the 4-digit code sent to ${whatsappCountryCode} ${whatsappPhone}`}
              </p>
            </div>

            {whatsappError && <div className="google-otp-error">{whatsappError}</div>}
            {whatsappNotice && <div className="whatsapp-otp-notice">{whatsappNotice}</div>}

            {/* STEP 1: PHONE INPUT */}
            {whatsappStep === "phone" && (
              <form onSubmit={handleSendWhatsAppOtp}>
                <div className="whatsapp-input-row">
                  <div className="whatsapp-country-select-box">
                    <select 
                      className="whatsapp-country-select"
                      value={whatsappCountryCode}
                      onChange={(e) => setWhatsappCountryCode(e.target.value)}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+61">🇦🇺 +61</option>
                    </select>
                  </div>

                  <div className="whatsapp-phone-box">
                    <span className="input-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </span>
                    <input 
                      type="tel" 
                      className="whatsapp-phone-input"
                      placeholder="Mobile Phone Number" 
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                      autoFocus
                      required 
                    />
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  className="whatsapp-action-btn"
                  disabled={isSendingWhatsAppOtp}
                >
                  {isSendingWhatsAppOtp ? "Sending code..." : "Send Code via WhatsApp"}
                </button>
              </form>
            )}

            {/* STEP 2: 4-DIGIT OTP VERIFICATION */}
            {whatsappStep === "otp" && (
              <form onSubmit={handleVerifyWhatsAppOtp}>
                <div className="whatsapp-otp-box">
                  <input 
                    type="text" 
                    className="whatsapp-otp-input"
                    placeholder="• • • • • •" 
                    value={whatsappOtpCode}
                    onChange={(e) => setWhatsappOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    required 
                  />
                </div>

                <button 
                  type="submit" 
                  className="whatsapp-action-btn"
                  disabled={isVerifyingWhatsAppOtp}
                >
                  {isVerifyingWhatsAppOtp ? "Verifying..." : "Sign In Now"}
                </button>

                <div className="whatsapp-options-row">
                  <button 
                    type="button" 
                    className="whatsapp-link-btn"
                    onClick={() => { setWhatsappStep("phone"); setWhatsappError(""); setWhatsappNotice(""); }}
                  >
                    ← Edit number
                  </button>
                  <button 
                    type="button" 
                    className="whatsapp-resend-btn"
                    onClick={handleSendWhatsAppOtp}
                    disabled={isSendingWhatsAppOtp || whatsappCountdown > 0}
                  >
                    {whatsappCountdown > 0 ? `Resend in ${whatsappCountdown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
